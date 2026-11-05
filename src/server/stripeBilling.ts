import { createHmac, timingSafeEqual } from 'node:crypto';
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

export function entitlementEventFromStripe(payload: string, productId: string): EntitlementEvent | null {
  const event = JSON.parse(payload) as StripeEnvelope;
  const object = event.data?.object || {};
  const ownerId = String(object.client_reference_id || object.metadata && (object.metadata as { owner_id?: string }).owner_id || '');
  if (!event.id || !ownerId) return null;
  const at = new Date((event.created || 0) * 1000).toISOString();
  const periodEnd = typeof object.current_period_end === 'number'
    ? new Date(object.current_period_end * 1000).toISOString()
    : null;
  const status = String(object.status || '');
  let type: EntitlementEvent['type'] | null = null;
  if (event.type === 'checkout.session.completed') type = 'purchase';
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
  const body = new URLSearchParams({
    mode: 'subscription',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.ownerId,
    'line_items[0][price]': input.priceId,
    'line_items[0][quantity]': '1',
    'metadata[owner_id]': input.ownerId,
  });
  const response = await (input.fetchImpl || fetch)('https://api.stripe.com/v1/checkout/sessions', {
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
