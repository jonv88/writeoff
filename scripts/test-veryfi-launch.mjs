import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom' });
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const recorded = JSON.parse(readFileSync('fixtures/veryfi-recorded/gt-coffee-digital.json', 'utf8'));

try {
  const { handleExtractReceipt, resetExtractGuards } = await server.ssrLoadModule('/src/server/extractReceiptHandler.ts');
  const { processVeryfiDocument, VeryfiRequestError } = await server.ssrLoadModule('/src/server/veryfiLive.ts');
  const policy = await server.ssrLoadModule('/src/server/veryfiPolicy.ts');
  const plan = await server.ssrLoadModule('/src/lib/billing/plan.ts');
  const evidence = await server.ssrLoadModule('/src/lib/ocr/receiptEvidence.ts');
  const files = await server.ssrLoadModule('/src/lib/ocr/importFileValidation.ts');
  const heic = new Uint8Array(16);
  heic.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
  assert.equal(files.detectReceiptMimeFromMagicBytes(heic), 'image/heic');

  assert.equal(plan.APPROVED_PLAN.amountCents, 999);
  assert.equal(plan.APPROVED_PLAN.interval, 'month');
  assert.equal(plan.APPROVED_PLAN.annualApproved, false);
  assert.equal(plan.isApprovedPlan({ amountCents: 999, currency: 'USD', interval: 'month' }), true);
  assert.equal(plan.isApprovedPlan({ amountCents: 999, currency: 'USD', interval: 'year' }), false);
  assert.equal(policy.providerEnabled({ VERYFI_LIVE_CALLS: '1', VERCEL_ENV: 'preview' }), false);
  assert.equal(policy.providerEnabled({ VERYFI_PROVIDER: 'enabled', VERYFI_LIVE_CALLS: '1', VERCEL_ENV: 'production' }), false);
  assert.equal(policy.globalScanBudget({}), 0);
  assert.equal(policy.MAX_NETWORK_ATTEMPTS, 1);
  assert.equal(policy.CLOUD_SCANS_PER_CUSTOMER_MONTH, 8);

  function post(bytes, extra, options) {
    return handleExtractReceipt(new Request('https://preview.test/api/extract-receipt', {
      method: 'POST',
      headers: {
        origin: 'https://preview.test',
        host: 'preview.test',
        'idempotency-key': extra.key,
        'x-file-name': extra.name || 'receipt.jpg',
      },
      body: bytes,
    }), options);
  }

  const liveEnv = {
    VERYFI_PROVIDER: 'enabled',
    VERYFI_LIVE_CALLS: '1',
    VERYFI_PREVIEW_DOC_CAP: '3',
    VERYFI_CLIENT_ID: 'test-client',
    VERYFI_USERNAME: 'test-user',
    VERYFI_API_KEY: 'test-key',
    VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_REF: 'cursor/veryfi-live-scan-9e74',
  };

  resetExtractGuards();
  let networkCalls = 0;
  const disabled = await post(jpeg, { key: 'launch-off-1' }, {
    env: { ...liveEnv, VERYFI_PROVIDER: undefined, VERYFI_LIVE_CALLS: '0' },
    processDocument: async () => {
      networkCalls += 1;
      return { ocr_text: 'TOTAL 1.00' };
    },
  });
  assert.equal(disabled.status, 503);
  assert.equal(networkCalls, 0);
  const disabledBody = await disabled.json();
  assert.equal(disabledBody.mode, 'off');
  assert.doesNotMatch(JSON.stringify(disabledBody), /test-key|apikey/i);

  resetExtractGuards();
  const blockedNetwork = await post(jpeg, { key: 'launch-block-1' }, {
    env: { ...liveEnv, VERYFI_PROVIDER: undefined },
  });
  assert.equal(blockedNetwork.status, 503);

  resetExtractGuards();
  let providerCalls = 0;
  const recordedResponse = await post(jpeg, { key: 'launch-recorded-1', name: 'gt-coffee-digital.jpg' }, {
    env: { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'feat/plaid-sandbox' },
    selectRecorded: (name) => (name.endsWith('gt-coffee-digital.jpg') ? recorded : null),
    processDocument: async () => {
      providerCalls += 1;
      return { ocr_text: 'SHOULD NOT RUN' };
    },
  });
  assert.equal(recordedResponse.status, 200);
  assert.equal(providerCalls, 0);
  const recordedBody = await recordedResponse.json();
  assert.equal(recordedBody.mode, 'recorded');
  assert.equal(recordedBody.provider, 'veryfi');

  const local = { merchant: 'Typed Cafe', date: '2026-11-01', total: 4.5, currency: 'USD', uncertainFields: [], fieldHints: {}, message: '', status: 'ready', items: [] };
  const merged = evidence.mergeReceiptReading({
    local,
    remote: null,
    remoteError: 'Live receipt reading is turned off.',
  });
  assert.equal(merged.merchant, 'Typed Cafe');
  assert.equal(merged.total, 4.5);
  const uncertainLocal = {
    ...local,
    merchant: 'Target',
    date: '2026-10-02',
    total: 12.34,
    uncertainFields: ['merchant', 'date', 'total'],
    status: 'needs_details',
    message: 'Review these details.',
  };
  const kept = evidence.mergeReceiptReading({
    local: uncertainLocal,
    remote: null,
    remoteError: 'Live receipt reading is turned off.',
  });
  assert.equal(kept.merchant, 'Target');
  assert.equal(kept.date, '2026-10-02');
  assert.equal(kept.total, 12.34);
  assert.equal(kept.message, 'Review these details.');

  resetExtractGuards();
  let statusCalls = 0;
  const availability = await handleExtractReceipt(new Request('https://preview.test/api/extract-receipt', { method: 'GET' }), {
    env: { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'feat/plaid-sandbox', VERYFI_LIVE_CALLS: '1' },
    processDocument: async () => {
      statusCalls += 1;
      return {};
    },
  });
  assert.equal(availability.status, 200);
  assert.equal((await availability.json()).enabled, false);
  assert.equal(statusCalls, 0);

  resetExtractGuards();
  const realUnentitled = await post(jpeg, { key: 'launch-pay-2' }, {
    env: liveEnv,
    resolveCustomer: async () => ({ ownerId: 'customer-a', entitled: false }),
  });
  assert.equal(realUnentitled.status, 402);
  assert.match(await realUnentitled.text(), /\$9\.99 per month/);

  resetExtractGuards();
  const ledger = policy.createScanLedger();
  const month = '2026-11';
  const parallel = await Promise.all([1, 2, 3, 4].map(() => ledger.reserve('customer-a', month, 1, 2)));
  assert.equal(parallel.filter(Boolean).length, 1);
  assert.equal(await ledger.reserve('customer-b', month, 1, 2), true);
  assert.equal(await ledger.reserve('customer-b', month, 1, 2), false);
  assert.equal(ledger.count('customer-a', month), 1);
  assert.equal(ledger.count('customer-b', month), 1);

  resetExtractGuards();
  const limiter = policy.createRateLimiter(2, 60_000);
  assert.equal(limiter('customer-a', 1_000), true);
  assert.equal(limiter('customer-a', 1_100), true);
  assert.equal(limiter('customer-a', 1_200), false);
  assert.equal(limiter('customer-b', 1_200), true);

  resetExtractGuards();
  let reservations = 0;
  let fetches = 0;
  const enabled = {
    env: { ...liveEnv, VERYFI_ATTEMPT_TOKEN: 'memory' },
    resolveCustomer: async () => ({ ownerId: 'customer-a', entitled: true }),
    allowRequest: () => true,
    consumeAllowance: async () => {
      reservations += 1;
      return reservations <= 2;
    },
    reserveAttempt: async () => true,
  };
  const hung = await post(jpeg, { key: 'launch-timeout-1' }, {
    ...enabled,
    processDocument: async () => {
      fetches += 1;
      throw new VeryfiRequestError(504);
    },
  });
  assert.equal(hung.status, 502);
  assert.equal(fetches, 1);
  assert.equal(reservations, 1);
  const again = await post(Uint8Array.from([...jpeg, 7]), { key: 'launch-timeout-2' }, {
    ...enabled,
    processDocument: async () => {
      fetches += 1;
      return { vendor: { raw_name: 'Cafe' }, date: '2026-11-02', total: 4.25, ocr_text: 'TOTAL 4.25' };
    },
  });
  assert.equal(again.status, 200);
  assert.equal(fetches, 2);
  assert.equal(reservations, 2);
  const duplicate = await post(Uint8Array.from([...jpeg, 7]), { key: 'launch-timeout-3' }, enabled);
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);
  assert.equal(reservations, 2);
  assert.equal(fetches, 2);

  let attempts = 0;
  let providerError = null;
  try {
    await processVeryfiDocument(jpeg, 'image/jpeg', {
      clientId: 'test-client', username: 'test-user', apiKey: 'test-key',
    }, async () => {
      attempts += 1;
      return new Response('no', { status: 504 });
    }, 'once', { timeoutMs: 50 });
  } catch (error) {
    providerError = error;
  }
  assert.equal(attempts, 1);
  assert.ok(providerError instanceof VeryfiRequestError);
  assert.equal(providerError.status, 504);
  assert.doesNotMatch(providerError.message, /test-key|apikey/i);
} finally {
  await server.close();
}

console.log('PASS veryfi launch: provider off, recorded reading, entitlement, allowance, single attempt');
