import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom' });
const secret = 'whsec_test_only';
const owner = '22222222-2222-4222-8222-222222222222';
const product = 'writeoff';
let now = 1_700_000_000;

function signed(payload) {
  const signature = createHmac('sha256', secret).update(`${now}.${payload}`).digest('hex');
  return { payload, header: `t=${now},v1=${signature}` };
}

try {
  const billing = await server.ssrLoadModule('/src/server/stripeBilling.ts');
  const entitlements = await server.ssrLoadModule('/src/lib/billing/sandboxEntitlements.ts');
  const storeMod = await server.ssrLoadModule('/src/server/entitlementStore.ts');
  const plan = await server.ssrLoadModule('/src/lib/billing/plan.ts');
  const store = storeMod.memoryEntitlementStore();

  assert.equal(plan.BILLING_PRODUCT_ID, 'writeoff');
  await assert.rejects(
    billing.createSandboxCheckout({
      secretKey: 'sk_test_example',
      priceId: 'price_annual',
      ownerId: owner,
      successUrl: 'https://preview.test/?checkout=return',
      cancelUrl: 'https://preview.test/?checkout=cancel',
      fetchImpl: async () => new Response(JSON.stringify({
        unit_amount: 9990,
        currency: 'usd',
        recurring: { interval: 'year' },
      }), { status: 200 }),
    }),
    /approved \$9\.99 monthly/,
  );

  async function apply(body) {
    now += 60;
    const envelope = signed(JSON.stringify({ ...body, created: now }));
    return storeMod.recordVerifiedStripeEvent({
      ...envelope,
      secret,
      nowSec: now,
      productId: product,
      store,
    });
  }

  const purchase = await apply({
    id: 'evt_purchase',
    type: 'checkout.session.completed',
    data: { object: { client_reference_id: owner, payment_status: 'paid' } },
  });
  assert.equal(purchase.entitlement.state, 'active');

  const renewed = await apply({
    id: 'evt_renew',
    type: 'invoice.paid',
    data: {
      object: {
        object: 'invoice',
        period_end: now + 60 * 60 * 24 * 31,
        parent: { subscription_details: { metadata: { owner_id: owner } } },
      },
    },
  });
  assert.equal(renewed.entitlement.state, 'active');
  assert.ok(renewed.entitlement.expiresAt > new Date(now * 1000).toISOString());

  const failed = await apply({
    id: 'evt_failed',
    type: 'invoice.payment_failed',
    data: {
      object: {
        metadata: { owner_id: owner },
        lines: { data: [{ period: { end: now + 60 * 60 * 24 * 40 } }] },
      },
    },
  });
  assert.equal(failed.entitlement.state, 'billing_retry');
  assert.equal(entitlements.accessAllowed(failed.entitlement, new Date((now + 10) * 1000).toISOString()), true);

  const duplicate = await apply({
    id: 'evt_failed',
    type: 'invoice.payment_failed',
    data: { object: { metadata: { owner_id: owner } } },
  });
  assert.equal(duplicate.entitlement.state, 'billing_retry');
  assert.equal(duplicate.entitlement.lastEventId, 'evt_failed');

  const late = await apply({
    id: 'evt_late',
    type: 'customer.subscription.deleted',
    data: { object: { metadata: { owner_id: owner } } },
  });
  // The signed timestamp is newer, so this deletion is in order and expires access.
  assert.equal(late.entitlement.state, 'expired');

  const replay = await storeMod.recordVerifiedStripeEvent({
    ...signed(JSON.stringify({
      id: 'evt_late',
      type: 'customer.subscription.deleted',
      created: now - 120,
      data: { object: { metadata: { owner_id: owner } } },
    })),
    secret,
    nowSec: now,
    productId: product,
    store,
  });
  assert.equal(replay.entitlement.state, 'expired');
  assert.equal(replay.entitlement.lastEventId, 'evt_late');

  const restored = await apply({
    id: 'evt_restore',
    type: 'customer.subscription.updated',
    data: { object: { metadata: { owner_id: owner }, status: 'active', current_period_end: now + 86400 } },
  });
  assert.equal(restored.entitlement.state, 'active');

  const stalePayload = signed(JSON.stringify({
    id: 'evt_stale',
    type: 'customer.subscription.deleted',
    created: now - 10_000,
    data: { object: { metadata: { owner_id: owner } } },
  }));
  const stale = await storeMod.recordVerifiedStripeEvent({
    ...stalePayload,
    secret,
    nowSec: now,
    productId: product,
    store,
  });
  assert.equal(stale.entitlement.state, 'active');
  assert.equal(stale.entitlement.lastEventId, 'evt_restore');

  const unpaid = billing.entitlementEventFromStripe(JSON.stringify({
    id: 'evt_unpaid',
    type: 'checkout.session.completed',
    created: now,
    data: { object: { client_reference_id: owner, payment_status: 'unpaid' } },
  }), product);
  assert.equal(unpaid, null);
  assert.equal(entitlements.accessAllowed({ clientFlag: true }, new Date().toISOString()), false);
} finally {
  await server.close();
}

console.log('PASS billing lifecycle: price, purchase, renewal, failure, duplicate, out-of-order');
