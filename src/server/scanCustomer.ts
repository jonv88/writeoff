import { BILLING_PRODUCT_ID } from '../lib/billing/plan.ts';
import { accessAllowed, type EntitlementState } from '../lib/billing/sandboxEntitlements.ts';
import { customerFromRequest, type CustomerRequest } from './customerRequest.ts';
import { CLOUD_SCANS_PER_CUSTOMER_MONTH, createRateLimiter, globalScanBudget } from './veryfiPolicy.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

const allow = createRateLimiter();

export function scanRequestAllowed(ownerId: string): boolean {
  return allow(ownerId);
}

export async function resolveScanCustomer(req: CustomerRequest, env: Record<string, string | undefined>) {
  try {
    const customer = await customerFromRequest(req, env);
    const { data, error } = await customer.client
      .from('entitlements')
      .select('state,expires_at')
      .eq('user_id', customer.ownerId)
      .eq('product_id', BILLING_PRODUCT_ID)
      .maybeSingle();
    if (error || !data) return { ownerId: customer.ownerId, entitled: false, client: customer.client };
    const entitled = accessAllowed({
      ownerId: customer.ownerId,
      productId: BILLING_PRODUCT_ID,
      state: data.state as EntitlementState,
      expiresAt: data.expires_at,
      lastEventId: '',
      lastEventAt: '',
    }, new Date().toISOString());
    return { ownerId: customer.ownerId, entitled, client: customer.client };
  } catch {
    return null;
  }
}

export async function consumeScanAllowance(
  client: SupabaseClient,
  ownerId: string,
  env: { VERYFI_GLOBAL_MONTHLY_CAP?: string },
): Promise<boolean> {
  const month = new Date().toISOString().slice(0, 7);
  const { data, error } = await client.rpc('reserve_scan_attempt', {
    p_owner: ownerId,
    p_month: month,
    p_customer_cap: CLOUD_SCANS_PER_CUSTOMER_MONTH,
    p_global_cap: globalScanBudget(env),
  });
  return !error && data === true;
}
