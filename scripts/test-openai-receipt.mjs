import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'error' });
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

try {
  const mod = await server.ssrLoadModule('/src/server/openaiReceipt.ts');
  const handlerMod = await server.ssrLoadModule('/src/server/extractReceiptHandler.ts');
  const { acceptOpenAiReceipt, openaiReaderEnabled, openAiCountCaps, outputText, OPENAI_RESERVE_CENTS, buildOpenAiRequest, readReceiptWithOpenAi } = mod;
  const { handleExtractReceipt, resetExtractGuards } = handlerMod;

  const accepted = acceptOpenAiReceipt({
    merchant: 'Northline Market',
    merchantQuote: 'NORTHLINE MARKET',
    date: '2026-11-02',
    dateQuote: 'Nov 2, 2026',
    total: 17.6,
    totalQuote: 'Notebook\nTOTAL 17.60',
    currency: 'USD',
    items: ['Notebook'],
  });
  assert.equal(accepted.merchant, 'Northline Market');
  assert.equal(accepted.date, '2026-11-02');
  assert.equal(accepted.total, 17.6);
  assert.deepEqual(accepted.items, [{ name: 'Notebook' }]);

  const subtotal = acceptOpenAiReceipt({
    merchant: 'Northline Market',
    merchantQuote: 'NORTHLINE MARKET',
    date: '2026-11-02',
    dateQuote: 'Nov 2, 2026',
    total: 14.98,
    totalQuote: 'SUBTOTAL 14.98',
    currency: 'usd',
    items: ['Invented item'],
  });
  assert.equal(subtotal.total, null);
  assert.equal(subtotal.uncertainFields.includes('total'), true);
  assert.deepEqual(subtotal.items, []);

  const invented = acceptOpenAiReceipt({
    merchant: 'Missing Store',
    merchantQuote: 'SOME OTHER WORDS',
    date: '2026-02-31',
    dateQuote: 'Feb 31, 2026',
    total: 4,
    totalQuote: 'TOTAL missing',
    currency: 'USD',
    items: [],
  });
  assert.equal(invented.merchant, null);
  assert.equal(invented.date, null);
  assert.equal(invented.total, null);

  assert.equal(outputText({ output_text: '{"ok":true}' }), '{"ok":true}');
  assert.equal(openaiReaderEnabled({ VERCEL_ENV: 'production', RECEIPT_READER: 'openai', OPENAI_API_KEY: 'present', OPENAI_RECEIPT_MONTHLY_BUDGET_CENTS: '60' }), false);
  assert.equal(openaiReaderEnabled({ VERCEL_ENV: 'preview', RECEIPT_READER: 'openai', OPENAI_API_KEY: 'present', VERCEL_GIT_COMMIT_REF: 'feat/plaid-sandbox' }), false);
  assert.equal(openaiReaderEnabled({ VERCEL_ENV: 'preview', RECEIPT_READER: 'openai', OPENAI_API_KEY: 'present', VERCEL_GIT_COMMIT_REF: 'feat/plaid-sandbox', OPENAI_RECEIPT_MONTHLY_BUDGET_CENTS: '60' }), true);
  assert.equal(openaiReaderEnabled({ VERCEL_ENV: 'preview', RECEIPT_READER: 'openai', OPENAI_API_KEY: 'present', VERCEL_GIT_COMMIT_REF: 'feat/plaid-sandbox', OPENAI_RECEIPT_MONTHLY_BUDGET_CENTS: '0' }), false);
  assert.equal(openaiReaderEnabled({ VERCEL_ENV: 'preview', RECEIPT_READER: 'openai', VERCEL_GIT_COMMIT_REF: 'feat/plaid-sandbox', OPENAI_RECEIPT_MONTHLY_BUDGET_CENTS: '60' }), false);
  assert.equal(openaiReaderEnabled({ VERCEL_ENV: 'preview', RECEIPT_READER: 'openai', OPENAI_API_KEY: 'present', VERCEL_GIT_COMMIT_REF: 'cursor/veryfi-live-scan-9e74', OPENAI_RECEIPT_MONTHLY_BUDGET_CENTS: '60' }), false);
  assert.equal(openaiReaderEnabled({ VERCEL_ENV: 'preview', RECEIPT_READER: 'openai', OPENAI_API_KEY: 'present', VERCEL_GIT_COMMIT_REF: 'feat/plaid-sandbox', OPENAI_RECEIPT_MONTHLY_BUDGET_CENTS: '60', OPENAI_RECEIPT_MODEL: 'gpt-4o-mini' }), false);
  assert.equal(openAiCountCaps({ OPENAI_RECEIPT_CUSTOMER_CAP: '100', OPENAI_RECEIPT_MONTHLY_CAP: '1000' }).customer, 20);
  assert.equal(openAiCountCaps({ OPENAI_RECEIPT_CUSTOMER_CAP: '100', OPENAI_RECEIPT_MONTHLY_CAP: '1000' }).global, 60);
  assert.equal(openAiCountCaps({ OPENAI_RECEIPT_CUSTOMER_CAP: '5' }).customer, 5);
  assert.equal(OPENAI_RESERVE_CENTS >= 1 && OPENAI_RESERVE_CENTS <= 5, true);
  const requestShape = buildOpenAiRequest('gpt-4.1-mini', 'data:image/jpeg;base64,AA==');
  assert.equal(requestShape.model, 'gpt-4.1-mini');
  assert.equal(requestShape.max_output_tokens, 700);
  assert.equal('detail' in requestShape.input[0].content[1], false);
  assert.equal('service_tier' in requestShape, false);

  const env = {
    VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_REF: 'feat/plaid-sandbox',
    RECEIPT_READER: 'openai',
    OPENAI_API_KEY: 'present',
    OPENAI_RECEIPT_MONTHLY_BUDGET_CENTS: '60',
  };
  let calls = 0;
  let veryfiCalls = 0;
  const reading = {
    merchant: 'Northline Market',
    date: '2026-11-02',
    total: 17.6,
    currency: 'USD',
    uncertainFields: [],
    fieldHints: {},
    message: 'Review the details before saving.',
    status: 'needs_details',
    items: [],
  };
  function post(bytes, key) {
    return handleExtractReceipt(new Request('https://preview.test/api/extract-receipt', {
      method: 'POST',
      headers: { origin: 'https://preview.test', 'idempotency-key': key },
      body: bytes,
    }), {
      env,
      allowedOrigins: ['https://preview.test'],
      resolveCustomer: async () => ({ ownerId: 'customer-a', entitled: false }),
      readReceipt: async () => {
        calls += 1;
        return reading;
      },
      processDocument: async () => {
        veryfiCalls += 1;
        return {};
      },
      reserveOpenAi: async () => ({ ok: true, attemptId: 'attempt-1', reservedCents: OPENAI_RESERVE_CENTS }),
    });
  }

  resetExtractGuards();
  const off = await handleExtractReceipt(new Request('https://preview.test/api/extract-receipt', { method: 'GET' }), {
    env: { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'feat/plaid-sandbox' },
  });
  assert.equal((await off.json()).enabled, false);

  resetExtractGuards();
  const on = await handleExtractReceipt(new Request('https://preview.test/api/extract-receipt', { method: 'GET' }), { env });
  assert.deepEqual(await on.json(), { enabled: true, provider: 'openai' });

  const first = await post(jpeg, 'openai-key-01');
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.provider, 'openai');
  assert.equal(firstBody.merchant, 'Northline Market');
  assert.equal(firstBody.total, 17.6);
  assert.equal(calls, 1);
  assert.equal(veryfiCalls, 0);

  const again = await post(jpeg, 'openai-key-02');
  assert.equal(again.status, 200);
  assert.equal((await again.json()).duplicate, true);
  assert.equal(calls, 1);

  resetExtractGuards();
  calls = 0;
  let reserved = 0;
  const capped = await handleExtractReceipt(new Request('https://preview.test/api/extract-receipt', {
    method: 'POST',
    headers: { origin: 'https://preview.test', 'idempotency-key': 'openai-key-03' },
    body: png,
  }), {
    env,
    allowedOrigins: ['https://preview.test'],
    resolveCustomer: async () => ({ ownerId: 'customer-a', entitled: false }),
    readReceipt: async () => {
      calls += 1;
      return reading;
    },
    reserveOpenAi: async () => {
      reserved += 1;
      return { ok: false, reason: 'cap' };
    },
  });
  assert.equal(capped.status, 429);
  assert.equal(calls, 0);
  assert.equal(reserved, 1);
  assert.match(await capped.text(), /ChatGPT receipt reading allowance/);

  const pdf = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  resetExtractGuards();
  calls = 0;
  const skippedPdf = await handleExtractReceipt(new Request('https://preview.test/api/extract-receipt', {
    method: 'POST',
    headers: { origin: 'https://preview.test', 'idempotency-key': 'openai-key-04' },
    body: pdf,
  }), {
    env,
    allowedOrigins: ['https://preview.test'],
    resolveCustomer: async () => ({ ownerId: 'customer-a', entitled: true }),
    readReceipt: async () => {
      calls += 1;
      return reading;
    },
  });
  assert.equal(skippedPdf.status, 415);
  assert.equal(calls, 0);

  resetExtractGuards();
  calls = 0;
  const closed = await handleExtractReceipt(new Request('https://preview.test/api/extract-receipt', { method: 'GET' }), {
    env: { ...env, OPENAI_RECEIPT_MONTHLY_BUDGET_CENTS: undefined },
  });
  assert.deepEqual(await closed.json(), { enabled: false, provider: 'openai', reason: 'budget' });
  const refused = await handleExtractReceipt(new Request('https://preview.test/api/extract-receipt', {
    method: 'POST',
    headers: { origin: 'https://preview.test' },
    body: jpeg,
  }), {
    env: { ...env, OPENAI_RECEIPT_MONTHLY_BUDGET_CENTS: '' },
    allowedOrigins: ['https://preview.test'],
    resolveCustomer: async () => ({ ownerId: 'customer-a', entitled: true }),
    readReceipt: async () => {
      calls += 1;
      return reading;
    },
    reserveOpenAi: async () => ({ ok: true, attemptId: 'should-not-run', reservedCents: 1 }),
  });
  assert.equal(refused.status, 503);
  assert.equal(calls, 0);

  const cost = await server.ssrLoadModule('/src/server/openaiCost.ts');
  const ledgerMod = await server.ssrLoadModule('/src/server/openaiSpendLedger.ts');
  const evidence = await server.ssrLoadModule('/src/lib/ocr/receiptEvidence.ts');
  assert.equal(cost.maxImageInputTokens(), 6637);
  assert.equal(cost.imageTokensForDimensions(1600, 1600) + 1, cost.preparedImageInputTokens());
  assert.equal(cost.imageTokensForDimensions(10000, 10000), cost.imageTokensForDimensions(2048, 2048));
  assert.equal(evidence.needsCloudReceiptAssist({
    merchant: 'Market', date: '2026-11-02', total: 4.5, uncertainFields: [], status: 'ready',
  }), false);
  assert.equal(evidence.needsCloudReceiptAssist({
    merchant: 'Market', date: '2026-11-02', total: 4.5, uncertainFields: ['total'], status: 'needs_details',
  }), true);
  assert.equal(evidence.needsCloudReceiptAssist({
    merchant: null, date: '2026-11-02', total: 4.5, uncertainFields: [], status: 'needs_details',
  }), true);

  const ledger = ledgerMod.createOpenAiSpendLedger();
  const month = '2026-11';
  const reserveInput = {
    ownerId: 'customer-a',
    month,
    customerCap: 20,
    globalCap: 60,
    budgetCents: OPENAI_RESERVE_CENTS,
    reserveCents: OPENAI_RESERVE_CENTS,
  };
  const firstReserve = await ledger.reserve(reserveInput);
  assert.equal(firstReserve.ok, true);
  await ledger.record(firstReserve.attemptId, {
    outcome: 'timeout',
    model: 'gpt-4.1-mini',
    inputTokens: null,
    outputTokens: null,
    imageTokens: null,
    measuredCents: null,
    latencyMs: 25000,
    httpStatus: null,
    byteLength: 1200,
  });
  const blocked = await ledger.reserve(reserveInput);
  assert.deepEqual(blocked, { ok: false, reason: 'budget' });
  assert.equal(ledger.rows()[0].reservedCents, OPENAI_RESERVE_CENTS);
  assert.equal(ledger.rows()[0].outcome, 'timeout');

  const wide = ledgerMod.createOpenAiSpendLedger();
  let winner = 0;
  const raced = await Promise.all([
    wide.reserve({ ...reserveInput, budgetCents: OPENAI_RESERVE_CENTS }).then((result) => {
      if (result.ok) winner += 1;
      return result;
    }),
    wide.reserve({ ...reserveInput, budgetCents: OPENAI_RESERVE_CENTS }).then((result) => {
      if (result.ok) winner += 1;
      return result;
    }),
  ]);
  assert.equal(winner, 1);
  assert.equal(raced.filter((result) => result.ok).length, 1);
  assert.equal(raced.filter((result) => !result.ok && result.reason === 'budget').length, 1);

  const cappedLedger = ledgerMod.createOpenAiSpendLedger();
  for (let index = 0; index < 20; index += 1) {
    const saved = await cappedLedger.reserve({
      ...reserveInput,
      budgetCents: 1000,
      ownerId: 'customer-a',
    });
    assert.equal(saved.ok, true);
  }
  const overCount = await cappedLedger.reserve({ ...reserveInput, budgetCents: 1000 });
  assert.deepEqual(overCount, { ok: false, reason: 'cap' });
  const otherCustomer = await cappedLedger.reserve({ ...reserveInput, budgetCents: 1000, ownerId: 'customer-b' });
  assert.equal(otherCustomer.ok, true);

  let providerCalls = 0;
  const payload = {
    output_text: JSON.stringify({
      merchant: 'Northline Market',
      merchantQuote: 'NORTHLINE MARKET',
      date: '2026-11-02',
      dateQuote: 'Nov 2, 2026',
      total: 17.6,
      totalQuote: 'TOTAL 17.60',
      currency: 'USD',
      items: ['Notebook'],
    }),
    usage: {
      input_tokens: 4200,
      output_tokens: 80,
      input_tokens_details: { cached_tokens: 0, image_tokens: 4050 },
      receipt_text: 'NORTHLINE MARKET TOTAL 17.60',
    },
  };
  await assert.rejects(
    () => readReceiptWithOpenAi(jpeg, 'image/jpeg', 'test-key', 'gpt-4.1-mini', async () => {
      providerCalls += 1;
      return new Response(JSON.stringify(payload), { status: 500 });
    }),
    /failed before a result/,
  );
  assert.equal(providerCalls, 1);
  providerCalls = 0;
  const completed = await readReceiptWithOpenAi(jpeg, 'image/jpeg', 'test-key', 'gpt-4.1-mini', async (_url, init) => {
    providerCalls += 1;
    const body = JSON.parse(init.body);
    assert.equal(body.max_output_tokens, 700);
    assert.equal(body.model, 'gpt-4.1-mini');
    assert.equal(body.service_tier, undefined);
    assert.equal(body.input[0].content[1].detail, undefined);
    return new Response(JSON.stringify(payload), { status: 200 });
  });
  assert.equal(providerCalls, 1);
  assert.equal(completed.attempts, 1);
  assert.equal(completed.reading.merchant, 'Northline Market');
  assert.equal(completed.usage.inputTokens, 4200);
  assert.equal(completed.usage.outputTokens, 80);
  assert.equal(completed.usage.imageTokens, 4050);
  assert.equal(JSON.stringify(completed.usage).includes('NORTHLINE'), false);
  assert.equal(JSON.stringify(completed.usage).includes('17.60'), false);

  const fees = cost.listedDomesticFees(999);
  assert.equal(fees.paymentsMicro, 589710);
  assert.equal(fees.billingMicro, 69930);
  assert.equal(fees.beforeOcrMicro, 9330360);
  const reserveMicro = OPENAI_RESERVE_CENTS * 10_000;
  for (const reads of [20, 50, 100]) {
    const after = fees.beforeOcrMicro - reads * reserveMicro;
    assert.equal(after > 0, true);
  }
  console.log(JSON.stringify({
    reserveCents: OPENAI_RESERVE_CENTS,
    textTokenCeiling: mod.textTokenCeiling(),
    maxImageTokens: cost.maxImageInputTokens(),
    preparedImageTokens: cost.preparedImageInputTokens(),
    beforeOcrMicro: fees.beforeOcrMicro,
    after20ReserveMicro: fees.beforeOcrMicro - 20 * reserveMicro,
    after50ReserveMicro: fees.beforeOcrMicro - 50 * reserveMicro,
    after100ReserveMicro: fees.beforeOcrMicro - 100 * reserveMicro,
  }));
  console.log('PASS openai receipt reading');

} finally {
  await server.close();
}
