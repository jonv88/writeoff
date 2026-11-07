import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'error' });
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

try {
  const mod = await server.ssrLoadModule('/src/server/openaiReceipt.ts');
  const handlerMod = await server.ssrLoadModule('/src/server/extractReceiptHandler.ts');
  const { acceptOpenAiReceipt, openaiReaderEnabled, outputText } = mod;
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
  assert.equal(openaiReaderEnabled({ VERCEL_ENV: 'production', RECEIPT_READER: 'openai', OPENAI_API_KEY: 'present' }), false);
  assert.equal(openaiReaderEnabled({ VERCEL_ENV: 'preview', RECEIPT_READER: 'openai', OPENAI_API_KEY: 'present', VERCEL_GIT_COMMIT_REF: 'feat/plaid-sandbox' }), true);
  assert.equal(openaiReaderEnabled({ VERCEL_ENV: 'preview', RECEIPT_READER: 'openai', VERCEL_GIT_COMMIT_REF: 'feat/plaid-sandbox' }), false);
  assert.equal(openaiReaderEnabled({ VERCEL_ENV: 'preview', RECEIPT_READER: 'openai', OPENAI_API_KEY: 'present', VERCEL_GIT_COMMIT_REF: 'cursor/veryfi-live-scan-9e74' }), false);

  const env = {
    VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_REF: 'feat/plaid-sandbox',
    RECEIPT_READER: 'openai',
    OPENAI_API_KEY: 'present',
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
      reserveOpenAi: async () => true,
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
      return false;
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

  console.log('PASS openai receipt reading');
} finally {
  await server.close();
}
