/**
 * Sandbox entitlement reducer. A client flag cannot grant access.
 * Store terms stay with the store. This reducer only tracks access state.
 */

export type EntitlementState = 'none' | 'active' | 'grace' | 'billing_retry' | 'cancelled' | 'expired';

export type EntitlementEventType =
  | 'purchase'
  | 'restore'
  | 'renew'
  | 'cancel'
  | 'expire'
  | 'grace'
  | 'billing_retry';

export type EntitlementEvent = {
  id: string;
  ownerId: string;
  productId: string;
  type: EntitlementEventType;
  at: string;
  expiresAt?: string | null;
};

export type Entitlement = {
  ownerId: string;
  productId: string;
  state: EntitlementState;
  expiresAt: string | null;
  lastEventId: string;
  lastEventAt: string;
};

export type EntitlementResult = {
  entitlement: Entitlement | null;
  applied: string[];
  skipped: string[];
};

const ACCESS: EntitlementState[] = ['active', 'grace', 'billing_retry', 'cancelled'];

export function accessAllowed(entitlement: Entitlement | null, now: string): boolean {
  if (!entitlement || !ACCESS.includes(entitlement.state)) return false;
  if (entitlement.state === 'cancelled' || entitlement.state === 'active' || entitlement.state === 'grace' || entitlement.state === 'billing_retry') {
    if (entitlement.expiresAt && entitlement.expiresAt <= now) return false;
  }
  return entitlement.state !== 'none' && entitlement.state !== 'expired';
}

export function applyEntitlementEvents(
  current: Entitlement | null,
  events: EntitlementEvent[],
  ownerId: string,
  productId: string,
): EntitlementResult {
  const applied: string[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  if (current?.lastEventId) seen.add(current.lastEventId);
  let entitlement = current && current.ownerId === ownerId && current.productId === productId ? { ...current } : null;
  const ordered = [...events].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));

  for (const event of ordered) {
    if (event.ownerId !== ownerId || event.productId !== productId) {
      skipped.push(`${event.id}:other`);
      continue;
    }
    if (seen.has(event.id)) {
      skipped.push(`${event.id}:duplicate`);
      continue;
    }
    if (entitlement && event.at < entitlement.lastEventAt) {
      skipped.push(`${event.id}:out-of-order`);
      continue;
    }
    const expiresAt = event.expiresAt ?? entitlement?.expiresAt ?? null;
    let state: EntitlementState = entitlement?.state || 'none';
    if (event.type === 'purchase' || event.type === 'restore' || event.type === 'renew') state = 'active';
    else if (event.type === 'grace') state = 'grace';
    else if (event.type === 'billing_retry') state = 'billing_retry';
    else if (event.type === 'cancel') state = 'cancelled';
    else if (event.type === 'expire') state = 'expired';
    entitlement = {
      ownerId,
      productId,
      state,
      expiresAt,
      lastEventId: event.id,
      lastEventAt: event.at,
    };
    seen.add(event.id);
    applied.push(event.id);
  }

  return { entitlement, applied, skipped };
}
