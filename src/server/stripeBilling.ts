import { createHmac, timingSafeEqual } from 'node:crypto';
import { BILLING_PRODUCT_ID, isApprovedPlan } from '../lib/billing/plan.ts';
import { applyEntitlementEvents, type Entitlement, type EntitlementEvent } from '../lib/billing/sandboxEntitlements.ts';

const TOLERANCE_SEC = 5 * 60;

export function assertSandboxSecret(secretKey: string): void {
  if (!secretKey.startsWith('sk_test_')) {
    throw new Error('Sandbox checkout requires a Stripe test secret.');
  }
}

export function verifyStripeSignature(payload: string, header: string, secret: string, nowSec: number): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((item) => {
      const [key, value] = item.split('=');
      return [key, value];
    }),
  );
  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!Number.isFinite(timestamp) || !signature) return false;
  if (Math.abs(nowSec - timestamp) > TOLERANCE_SEC) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

type StripeEnvelope = {
  id?: string;
  type?: string;
  created?: number;
  data?: { object?: Record<string, unknown> };
};

function ownerIdFromStripe(object: Record<string, unknown>): string {
  const metadata = (object.metadata || {}) as { owner_id?: string };
  const parent = (object.parent || {}) as { subscription_details?: { metadata?: { owner_id?: string } } };
  const details = (object.subscription_details || {}) as { metadata?: { owner_id?: string } };
  return String(
    object.client_reference_id
    || metadata.owner_id
    || parent.subscription_details?.metadata?.owner_id
    || details.metadata?.owner_id
    || '',
  );
}

function periodEndFromStripe(object: Record<string, unknown>): string | null {
  if (typeof object.current_period_end === 'number') {
    return new Date(object.current_period_end * 1000).toISOString();
  }
  const lines = object.lines as { data?: Array<{ period?: { end?: number } }> } | undefined;
  const lineEnd = lines?.data?.[0]?.period?.end;
  if (typeof lineEnd === 'number') return new Date(lineEnd * 1000).toISOString();
  if (object.object === 'invoice' && typeof object.period_end === 'number') {
    return new Date(object.period_end * 1000).toISOString();
  }
  return null;
}

export function entitlementEventFromStripe(payload: string, productId: string = BILLING_PRODUCT_ID): EntitlementEvent | null {
  const event = JSON.parse(payload) as StripeEnvelope;
  const object = event.data?.object || {};
  const ownerId = ownerIdFromStripe(object);
  if (!event.id || !ownerId) return null;
  const at = new Date((event.created || 0) * 1000).toISOString();
  const periodEnd = periodEndFromStripe(object);
  const status = String(object.status || '');
  let type: EntitlementEvent['type'] | null = null;
  if (event.type === 'checkout.session.completed') {
    const paid = object.payment_status === 'paid' || object.payment_status === 'no_payment_required';
    if (paid) type = 'purchase';
  }
  else if (event.type === 'invoice.paid') type = 'renew';
  else if (event.type === 'invoice.payment_failed') type = 'billing_retry';
  else if (event.type === 'customer.subscription.deleted') type = 'expire';
  else if (event.type === 'customer.subscription.updated') {
    if (status === 'active' || status === 'trialing') type = 'renew';
    else if (status === 'past_due') type = 'billing_retry';
    else if (status === 'canceled' || status === 'unpaid') type = 'cancel';
    else if (status === 'paused') type = 'grace';
  }
  if (!type) return null;
  return { id: event.id, ownerId, productId, type, at, expiresAt: periodEnd };
}

export async function createSandboxCheckout(input: {
  secretKey: string;
  priceId: string;
  ownerId: string;
  successUrl: string;
  cancelUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<{ url: string }> {
  assertSandboxSecret(input.secretKey);
  if (!input.priceId.startsWith('price_')) throw new Error('Sandbox checkout needs a Stripe test price id.');
  if (!input.ownerId) throw new Error('Sandbox checkout needs the signed-in customer.');
  const fetchImpl = input.fetchImpl || fetch;
  const priceResponse = await fetchImpl(`https://api.stripe.com/v1/prices/${input.priceId}`, {
    headers: { Authorization: `Bearer ${input.secretKey}` },
  });
  if (!priceResponse.ok) throw new Error('The test price could not be confirmed.');
  const price = await priceResponse.json() as { unit_amount?: number; currency?: string; recurring?: { interval?: string } };
  if (!isApprovedPlan({
    amountCents: Number(price.unit_amount),
    currency: String(price.currency || '').toUpperCase(),
    interval: String(price.recurring?.interval || ''),
  })) {
    throw new Error('Only the approved $9.99 monthly price can be checked out.');
  }
  const body = new URLSearchParams({
    mode: 'subscription',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.ownerId,
    'line_items[0][price]': input.priceId,
    'line_items[0][quantity]': '1',
    'metadata[owner_id]': input.ownerId,
    'subscription_data[metadata][owner_id]': input.ownerId,
  });
  const response = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!response.ok) throw new Error('Stripe did not open a sandbox checkout.');
  const json = (await response.json()) as { url?: string };
  if (!json.url) throw new Error('Stripe did not return a checkout link.');
  return { url: json.url };
}

export function applyVerifiedStripeEvent(input: {
  payload: string;
  header: string;
  secret: string;
  nowSec: number;
  productId: string;
  current: Entitlement | null;
}): { entitlement: Entitlement | null; event: EntitlementEvent } {
  if (!verifyStripeSignature(input.payload, input.header, input.secret, input.nowSec)) {
    throw new Error('Stripe signature was rejected.');
  }
  const event = entitlementEventFromStripe(input.payload, input.productId);
  if (!event) throw new Error('Stripe event did not grant access.');
  const next = applyEntitlementEvents(input.current, [event], event.ownerId, input.productId);
  return { entitlement: next.entitlement, event };
}
