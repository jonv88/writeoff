import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const { createServer: createVite } = await import('vite');

const server = await createVite({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const http = createServer((req, res) => server.middlewares(req, res));
await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));

try {
  const csvMod = await server.ssrLoadModule('/src/lib/records/csvExport.ts');
  const deletion = await server.ssrLoadModule('/src/lib/account/deletion.ts');
  const bank = await server.ssrLoadModule('/src/lib/bank/sandboxLedger.ts');
  const billing = await server.ssrLoadModule('/src/lib/billing/sandboxEntitlements.ts');
  const draftMod = await server.ssrLoadModule('/src/lib/receiptDraft.ts');
  const local = await server.ssrLoadModule('/src/lib/localWorkspace.ts');

  const csv = csvMod.expensesToCsv([
    {
      id: '1',
      merchant: '=HYPERLINK("http://evil")',
      amount: 10,
      currency: 'USD',
      date: '2026-11-04',
      category: 'Other',
      type: 'Business',
      share: 100,
      entity: '',
      notes: '+cmd',
      percent: 50,
      eligibilityChecked: true,
      reviewed: true,
      source: 'Manual expense',
      account: '@sheet',
      receipt: null,
    },
    {
      id: '2',
      merchant: 'Market Street',
      amount: 15.97,
      currency: 'USD',
      date: '2026-11-04',
      category: 'Other',
      type: 'Unsorted',
      share: 0,
      entity: '',
      notes: '',
      percent: 100,
      eligibilityChecked: false,
      reviewed: false,
      source: 'Receipt capture',
      account: '',
      receipt: null,
    },
  ]);
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /'\+cmd/);
  assert.match(csv, /'@sheet/);
  assert.match(csv, /5\.00/);
  assert.match(csv, /Eligible amount checked/);
  assert.doesNotMatch(csv.split('\r\n')[2], /,5\.00,/);
  assert.match(csv, /15\.97/);

  const calls = [];
  const done = await deletion.deleteOwnedAccount(
    {
      async disconnectProviders(ownerId) {
        calls.push(`disconnect:${ownerId}`);
      },
      async deleteOwned(step, ownerId) {
        calls.push(`${step}:${ownerId}`);
      },
    },
    'customer-a',
  );
  assert.deepEqual(done, [...deletion.DELETION_STEPS]);
  assert.equal(calls[0], 'disconnect:customer-a');
  assert.equal(calls.at(-1), 'delete_profile:customer-a');
  assert.equal(deletion.subscriptionCancelKeepsRecords(), true);
  await assert.rejects(() => deletion.deleteOwnedAccount({
    async disconnectProviders() {},
    async deleteOwned() {},
  }, ''), /signed-in customer/);

  let failed = false;
  await assert.rejects(() => deletion.deleteOwnedAccount({
    async disconnectProviders() {
      failed = true;
      throw new Error('provider still linked');
    },
    async deleteOwned() {
      throw new Error('should not delete records');
    },
  }, 'customer-a'), /provider still linked/);
  assert.equal(failed, true);

  const sample = {
    providerId: 'p1',
    accountId: 'acct',
    ownerId: 'customer-a',
    name: 'Northline Market',
    amountCents: 1760,
    currency: 'USD',
    date: '2026-11-04',
    pending: true,
    kind: 'purchase',
  };
  const first = bank.ingestSandbox([], [sample, { ...sample, providerId: 'xfer', kind: 'transfer' }, { ...sample, providerId: 'other', ownerId: 'customer-b' }], 'customer-a');
  assert.equal(first.expenses.length, 1);
  assert.equal(first.expenses[0].accountLabel, 'Sandbox sample · not your bank');
  assert.equal(first.expenses[0].pending, true);
  assert.ok(first.ignored.some((item) => item.reason === 'transfer'));
  assert.ok(first.ignored.some((item) => item.reason === 'other-customer'));

  const reviewed = { ...first.expenses[0], reviewed: true, useType: 'Business', share: 100, eligibilityChecked: true, eligiblePercent: 40 };
  const posted = bank.ingestSandbox([reviewed], [{ ...sample, settlesTo: 'p1-posted' }], 'customer-a');
  assert.equal(posted.expenses.length, 1);
  assert.equal(posted.expenses[0].providerId, 'p1-posted');
  assert.equal(posted.expenses[0].pending, false);
  assert.equal(posted.expenses[0].reviewed, true);
  assert.equal(posted.expenses[0].useType, 'Business');
  assert.equal(posted.expenses[0].eligibilityChecked, true);

  const duplicate = bank.ingestSandbox(posted.expenses, [{ ...sample, providerId: 'p1-posted', pending: false }], 'customer-a');
  assert.equal(duplicate.expenses.length, 1);
  assert.ok(duplicate.ignored.some((item) => item.reason === 'duplicate'));

  const refunded = bank.ingestSandbox(posted.expenses, [{
    ...sample,
    providerId: 'refund-1',
    kind: 'refund',
    refundOf: 'p1-posted',
  }], 'customer-a');
  assert.equal(refunded.expenses.length, 0);

  const cardPayment = bank.ingestSandbox([], [{ ...sample, providerId: 'pay', kind: 'payment' }], 'customer-a');
  assert.equal(cardPayment.expenses.length, 0);

  const owner = 'customer-a';
  const product = 'writeoff.reviewer';
  const events = [
    { id: 'e2', ownerId: owner, productId: product, type: 'renew', at: '2026-11-05T00:00:00.000Z', expiresAt: '2026-12-05T00:00:00.000Z' },
    { id: 'e1', ownerId: owner, productId: product, type: 'purchase', at: '2026-11-01T00:00:00.000Z', expiresAt: '2026-12-01T00:00:00.000Z' },
    { id: 'e1', ownerId: owner, productId: product, type: 'purchase', at: '2026-11-01T00:00:00.000Z', expiresAt: '2026-12-01T00:00:00.000Z' },
    { id: 'other', ownerId: 'customer-b', productId: product, type: 'purchase', at: '2026-11-06T00:00:00.000Z' },
  ];
  const reduced = billing.applyEntitlementEvents(null, events, owner, product);
  assert.deepEqual(reduced.applied, ['e1', 'e2']);
  const stale = billing.applyEntitlementEvents(reduced.entitlement, [
    { id: 'late', ownerId: owner, productId: product, type: 'expire', at: '2026-10-01T00:00:00.000Z' },
  ], owner, product);
  assert.ok(stale.skipped.some((item) => item.includes('out-of-order')));
  assert.equal(stale.entitlement.state, 'active');
  assert.equal(reduced.entitlement.state, 'active');
  assert.equal(billing.accessAllowed(reduced.entitlement, '2026-11-20T00:00:00.000Z'), true);
  assert.equal(billing.accessAllowed({ clientFlag: true }, '2026-11-20T00:00:00.000Z'), false);

  const cancelled = billing.applyEntitlementEvents(reduced.entitlement, [
    { id: 'e3', ownerId: owner, productId: product, type: 'cancel', at: '2026-11-06T00:00:00.000Z', expiresAt: '2026-12-05T00:00:00.000Z' },
  ], owner, product);
  assert.equal(cancelled.entitlement.state, 'cancelled');
  assert.equal(billing.accessAllowed(cancelled.entitlement, '2026-11-20T00:00:00.000Z'), true);
  assert.equal(billing.accessAllowed(cancelled.entitlement, '2026-12-05T00:00:00.000Z'), false);
  const expired = billing.applyEntitlementEvents(cancelled.entitlement, [
    { id: 'e4', ownerId: owner, productId: product, type: 'expire', at: '2026-12-05T00:00:00.000Z' },
  ], owner, product);
  assert.equal(expired.entitlement.state, 'expired');
  assert.equal(billing.accessAllowed(expired.entitlement, '2026-12-06T00:00:00.000Z'), false);

  const grace = billing.applyEntitlementEvents(reduced.entitlement, [
    { id: 'g1', ownerId: owner, productId: product, type: 'grace', at: '2026-11-07T00:00:00.000Z', expiresAt: '2026-12-10T00:00:00.000Z' },
    { id: 'b1', ownerId: owner, productId: product, type: 'billing_retry', at: '2026-11-08T00:00:00.000Z', expiresAt: '2026-12-10T00:00:00.000Z' },
  ], owner, product);
  assert.equal(grace.entitlement.state, 'billing_retry');
  assert.equal(billing.accessAllowed(grace.entitlement, '2026-11-20T00:00:00.000Z'), true);

  const memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  };
  draftMod.saveReceiptDraft({ merchant: 'Market Street', amount: '15.97', date: '2026-11-04', currency: 'USD', notes: '', updatedAt: '2026-11-05T00:00:00.000Z' });
  assert.equal(draftMod.loadReceiptDraft().amount, '15.97');
  draftMod.clearReceiptDraft();
  assert.equal(draftMod.loadReceiptDraft(), null);

  local.saveLocalWorkspace({
    records: [{ id: 'saved', merchant: 'Market Street', amount: 15.97, currency: 'USD', date: '2026-11-04', category: 'Other', type: 'Unsorted', share: 0, entity: '', notes: '', percent: 0, eligibilityChecked: false, reviewed: false, source: 'Receipt capture', account: '', receipt: null }],
    profile: { mode: 'Both', worktype: 'self', industry: 'general', country: 'US', jurisdiction: '', taxYear: 2026, entityType: 'unspecified', name: 'Demo', complete: true },
    rules: [],
  });
  const reloaded = local.loadLocalWorkspace();
  assert.equal(reloaded.records[0].amount, 15.97);
  assert.equal(reloaded.records[0].merchant, 'Market Street');

  const sql = [
    readFileSync('supabase/migrations/20261102190000_phase_a_foundation.sql', 'utf8'),
    readFileSync('supabase/migrations/20261105160000_phase_cd_sandbox.sql', 'utf8'),
  ].join('\n');
  for (const table of ['profiles', 'expenses', 'receipts', 'merchant_rules', 'bank_items', 'entitlements', 'entitlement_events']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  for (const policy of ['profiles', 'expenses', 'receipts', 'rules', 'bank_items', 'entitlements', 'entitlement_events']) {
    assert.match(sql, new RegExp(`${policy}_select_own`));
    assert.match(sql, new RegExp(`${policy}_delete_own`));
  }
  assert.match(sql, /storage_path like auth\.uid\(\)::text/);
  assert.doesNotMatch(readFileSync('src/lib/billing/sandboxEntitlements.ts', 'utf8'), /\$\d|price|trial/i);
  assert.match(readFileSync('src/screens/SetupScreen.tsx', 'utf8'), /Purchases aren’t available in this preview/);
  assert.match(readFileSync('src/screens/AccountsScreen.tsx', 'utf8'), /Bank integration unavailable/);
  assert.doesNotMatch(readFileSync('src/lib/ocr/receiptTotals.ts', 'utf8'), /Walgreens|15\.97/);

  const recovery = await server.ssrLoadModule('/src/lib/auth/recovery.ts');
  assert.equal(recovery.isRecoveryCallback('https://preview.test/?type=recovery'), true);
  assert.equal(recovery.isRecoveryCallback('https://preview.test/#access_token=abc&type=recovery'), true);
  assert.equal(recovery.isRecoveryCallback('https://preview.test/#type=signup'), false);

  const stripeBilling = await server.ssrLoadModule('/src/server/stripeBilling.ts');
  const crypto = await import('node:crypto');
  const secret = 'whsec_test_only';
  const now = 1_700_000_000;
  const payload = JSON.stringify({
    id: 'evt_test_1',
    type: 'checkout.session.completed',
    created: now,
    data: { object: { client_reference_id: 'customer-a', status: 'complete' } },
  });
  const signature = crypto.createHmac('sha256', secret).update(`${now}.${payload}`).digest('hex');
  const header = `t=${now},v1=${signature}`;
  const applied = stripeBilling.applyVerifiedStripeEvent({
    payload,
    header,
    secret,
    nowSec: now,
    productId: 'writeoff-sandbox',
    current: null,
  });
  assert.equal(applied.entitlement.state, 'active');
  assert.equal(applied.event.ownerId, 'customer-a');
  assert.throws(() => stripeBilling.applyVerifiedStripeEvent({
    payload,
    header: `t=${now},v1=00`,
    secret,
    nowSec: now,
    productId: 'writeoff-sandbox',
    current: null,
  }), /rejected/);
  assert.throws(() => stripeBilling.assertSandboxSecret('sk_live_secret'), /test secret/);
  let called = 0;
  const checkout = await stripeBilling.createSandboxCheckout({
    secretKey: 'sk_test_example',
    priceId: 'price_test_123',
    ownerId: 'customer-a',
    successUrl: 'https://preview.test/?checkout=return',
    cancelUrl: 'https://preview.test/?checkout=cancel',
    fetchImpl: async (url, init) => {
      called += 1;
      assert.equal(url, 'https://api.stripe.com/v1/checkout/sessions');
      assert.match(String(init.body), /price_test_123/);
      assert.match(String(init.headers.Authorization), /sk_test_example/);
      return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test_123' }), { status: 200 });
    },
  });
  assert.equal(called, 1);
  assert.match(checkout.url, /cs_test_123/);

  console.log('PASS launch readiness: export, deletion, sandbox bank, entitlements, drafts, RLS, billing');
} finally {
  await new Promise((resolve) => http.close(resolve));
  await server.close();
}
