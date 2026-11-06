import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { applyVerifiedStripeEvent } from './stripeBilling.ts';
import type { Entitlement, EntitlementEvent } from '../lib/billing/sandboxEntitlements.ts';

export type EntitlementStore = {
  load(ownerId: string, productId: string): Promise<Entitlement | null>;
  save(entitlement: Entitlement, event: EntitlementEvent): Promise<void>;
};

const OWNER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** In-memory stand-in for tests. This is not the hosted database. */
export function memoryEntitlementStore(): EntitlementStore {
  const rows = new Map<string, Entitlement>();
  const events = new Set<string>();
  return {
    async load(ownerId, productId) {
      return rows.get(`${ownerId}:${productId}`) || null;
    },
    async save(entitlement, event) {
      if (events.has(event.id)) return;
      events.add(event.id);
      rows.set(`${entitlement.ownerId}:${entitlement.productId}`, entitlement);
    },
  };
}

function rowToEntitlement(row: {
  user_id: string;
  product_id: string;
  state: Entitlement['state'];
  expires_at: string | null;
  last_event_id: string;
  last_event_at: string;
}): Entitlement {
  return {
    ownerId: row.user_id,
    productId: row.product_id,
    state: row.state,
    expiresAt: row.expires_at,
    lastEventId: row.last_event_id,
    lastEventAt: row.last_event_at,
  };
}

export function supabaseEntitlementStore(url: string, serviceKey: string): EntitlementStore {
  const client: SupabaseClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async load(ownerId, productId) {
      const { data, error } = await client
        .from('entitlements')
        .select('user_id, product_id, state, expires_at, last_event_id, last_event_at')
        .eq('user_id', ownerId)
        .eq('product_id', productId)
        .maybeSingle();
      if (error) throw new Error('Entitlement could not be read.');
      return data ? rowToEntitlement(data) : null;
    },
    async save(entitlement, event) {
      const { error: eventError } = await client.from('entitlement_events').upsert(
        {
          id: event.id,
          user_id: event.ownerId,
          product_id: event.productId,
          event_type: event.type,
          event_at: event.at,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      );
      if (eventError) throw new Error('Entitlement event could not be stored.');
      const { error } = await client.from('entitlements').upsert(
        {
          user_id: entitlement.ownerId,
          product_id: entitlement.productId,
          state: entitlement.state,
          expires_at: entitlement.expiresAt,
          last_event_id: entitlement.lastEventId,
          last_event_at: entitlement.lastEventAt,
        },
        { onConflict: 'user_id,product_id' },
      );
      if (error) throw new Error('Entitlement could not be stored.');
    },
  };
}

export function entitlementStoreFromEnv(env: {
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}): EntitlementStore | null {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) return null;
  return supabaseEntitlementStore(url, serviceKey);
}

/** Verify the Stripe signature, then store the resulting entitlement. A client flag cannot do this. */
export async function recordVerifiedStripeEvent(input: {
  payload: string;
  header: string;
  secret: string;
  nowSec: number;
  productId: string;
  store: EntitlementStore;
}): Promise<{ entitlement: Entitlement }> {
  const preview = applyVerifiedStripeEvent({ ...input, current: null });
  if (!OWNER_ID.test(preview.event.ownerId)) {
    throw new Error('Stripe event did not name a customer account.');
  }
  const current = await input.store.load(preview.event.ownerId, input.productId);
  const next = applyVerifiedStripeEvent({ ...input, current });
  if (!next.entitlement) throw new Error('Stripe event did not grant access.');
  await input.store.save(next.entitlement, next.event);
  return { entitlement: next.entitlement };
}
