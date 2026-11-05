import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom' });
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

try {
  const evidence = await server.ssrLoadModule('/src/lib/ocr/receiptEvidence.ts');
  const totals = await server.ssrLoadModule('/src/lib/ocr/receiptTotals.ts');
  const handlerMod = await server.ssrLoadModule('/src/server/extractReceiptHandler.ts');
  const { resolveVeryfiDocument, mergeReceiptReading, resolveUsDate, evidenceDate } = evidence;
  const { parseTotalFromText } = totals;
  const liveMod = await server.ssrLoadModule('/src/server/veryfiLive.ts');
  const { handleExtractReceipt, resetExtractGuards, liveDocumentCount } = handlerMod;
  const { processVeryfiDocument } = liveMod;

  assert.equal(parseTotalFromText('TIP 3.50\nAMOUNT PAID 29.30').total, 29.3);
  assert.equal(parseTotalFromText('YOU SAVED 48.00\nAMOUNT DUE 23.76').total, 23.76);
  assert.equal(parseTotalFromText('TOTAL 19.90\nCASH TENDERED 20.00\nCHANGE 0.10').total, 19.9);
  assert.equal(parseTotalFromText('TOTAL 19.90 CHANGE 0.10').total, 19.9);
  assert.equal(parseTotalFromText('TOTAL 12.50\nGRAND TOTAL 15.00\nAMOUNT DUE 11.00').total, null);
  assert.equal(parseTotalFromText('CASH 20.00').total, null);

  assert.equal(resolveUsDate('November 3, 2026', null).date, '2026-11-03');
  assert.equal(resolveUsDate('November 3, 2026', '2026-03-11').date, null);
  assert.equal(resolveUsDate('02/13/2026', null).date, '2026-02-13');
  assert.equal(resolveUsDate('11/02/2026', null).date, '2026-11-02');
  assert.equal(resolveUsDate('11/02/2026', '2026-02-11').date, null);
  assert.equal(resolveUsDate('11/02/2026\n11/03/2026', null).date, null);
  assert.equal(evidenceDate('11/02/2026').ambiguous, true);

  const tip = resolveVeryfiDocument({
    vendor: { raw_name: 'Riverbend Bistro' },
    date: '2026-11-03',
    total: 3.5,
    tip: 3.5,
    ocr_text: 'Riverbend Bistro\nSUBTOTAL 24.00\nTAX 1.80\nTIP 3.50\nAMOUNT PAID 29.30\nNovember 3, 2026',
  });
  assert.equal(tip.total, 29.3);
  assert.equal(tip.date, '2026-11-03');
  assert.equal(tip.merchant, 'Riverbend Bistro');
  assert.equal(tip.uncertainFields.includes('total'), false);

  const savings = resolveVeryfiDocument({
    vendor: { raw_name: 'Greenfield Foods' },
    total: 48,
    date: '2026-11-02',
    ocr_text: 'Greenfield Foods\nYOU SAVED 48.00\nAMOUNT DUE 23.76\nNovember 2, 2026',
  });
  assert.equal(savings.total, 23.76);

  const cash = resolveVeryfiDocument({
    vendor: { raw_name: 'Walmart' },
    total: 20,
    date: '2026-11-01',
    ocr_text: 'Walmart\nTOTAL 19.90\nCASH TENDERED 20.00\nCHANGE 0.10\nNovember 1, 2026',
  });
  assert.equal(cash.total, 19.9);

  const conflict = resolveVeryfiDocument(JSON.parse(readFileSync('fixtures/veryfi-recorded/gt-conflicting-totals.json', 'utf8')));
  assert.equal(conflict.total, null);
  assert.equal(conflict.date, null);
  assert.equal(conflict.merchant, 'Harbor Market');
  assert.match(conflict.message, /check/i);
  assert.doesNotMatch(JSON.stringify(conflict), /15\.00|18\.40|Demo Market/);

  const kept = mergeReceiptReading({
    local: {
      merchant: 'DEMO COFFEE CO',
      date: '2026-10-21',
      total: 4.9,
      currency: 'USD',
      uncertainFields: [],
      status: 'ready',
      message: 'Review the details before saving.',
    },
    remote: resolveVeryfiDocument(JSON.parse(readFileSync('fixtures/veryfi-recorded/gt-coffee-digital.json', 'utf8'))),
  });
  assert.equal(kept.total, 4.9);
  assert.equal(kept.merchant, 'DEMO COFFEE CO');
  assert.equal(kept.date, '2026-10-21');

  const filled = mergeReceiptReading({
    local: {
      merchant: 'Corner Newsstand',
      date: '2026-11-03',
      total: null,
      currency: 'USD',
      uncertainFields: ['total'],
      status: 'needs_details',
      message: 'Some fields need a quick check before saving.',
    },
    remote: resolveVeryfiDocument(JSON.parse(readFileSync('fixtures/veryfi-recorded/gt-no-total-label.json', 'utf8'))),
  });
  assert.equal(filled.total, 7.25);
  assert.equal(filled.merchant, 'Corner Newsstand');
  assert.equal(filled.uncertainFields.includes('total'), false);

  const dialog = readFileSync('src/components/dialogs/SnapReceiptDialog.tsx', 'utf8');
  const client = readFileSync('src/lib/ocr/serverExtraction.ts', 'utf8');
  assert.doesNotMatch(dialog, /veryfiMockFallback|applyMockCase|MOCK_VERYFI_RESPONSES/);
  assert.doesNotMatch(client, /api\.veryfi\.com|CLIENT-ID|AUTHORIZATION/);

  function post(bytes, extra = {}, options = {}) {
    return handleExtractReceipt(
      new Request('https://preview.test/api/extract-receipt', {
        method: 'POST',
        headers: {
          origin: 'https://preview.test',
          host: 'preview.test',
          'idempotency-key': extra.key || crypto.randomUUID(),
          'x-file-name': extra.name || 'receipt.jpg',
        },
        body: bytes,
      }),
      options,
    );
  }

  resetExtractGuards();
  const missingOrigin = await handleExtractReceipt(
    new Request('https://preview.test/api/extract-receipt', {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: jpeg,
    }),
  );
  assert.equal(missingOrigin.status, 403);

  resetExtractGuards();
  let calls = 0;
  const recorded = await post(jpeg, { name: 'gt-no-total-label.png' }, {
    selectRecorded(name) {
      calls += 1;
      assert.equal(name, 'gt-no-total-label.png');
      return JSON.parse(readFileSync('fixtures/veryfi-recorded/gt-no-total-label.json', 'utf8'));
    },
  });
  const recordedBody = await recorded.json();
  assert.equal(recorded.status, 200);
  assert.equal(recordedBody.mode, 'recorded');
  assert.equal(recordedBody.total, 7.25);
  assert.equal(recordedBody.merchant, 'Corner Newsstand');
  assert.equal(calls, 1);

  resetExtractGuards();
  let liveCalls = 0;
  const off = await post(jpeg, {}, {
    env: { VERYFI_LIVE_CALLS: '0', VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'cursor/veryfi-live-scan-9e74' },
    processDocument: async () => {
      liveCalls += 1;
      return { ocr_text: 'AMOUNT PAID 1.00' };
    },
  });
  assert.equal(off.status, 503);
  assert.equal(liveCalls, 0);
  const offBody = await off.json();
  assert.equal(offBody.merchant, null);
  assert.equal(offBody.total, null);
  assert.match(offBody.message, /turned off/);

  resetExtractGuards();
  const wrongBranch = await post(jpeg, {}, {
    env: { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'cursor/phase-a-foundation-85e1', VERYFI_LIVE_CALLS: '1' },
  });
  assert.equal(wrongBranch.status, 404);

  const production = await post(jpeg, {}, { env: { VERCEL_ENV: 'production', VERYFI_LIVE_CALLS: '1' } });
  assert.equal(production.status, 404);

  resetExtractGuards();
  let processed = 0;
  const options = {
    env: { VERYFI_LIVE_CALLS: '1', VERYFI_PREVIEW_DOC_CAP: '2' },
    processDocument: async () => {
      processed += 1;
      return {
        vendor: { raw_name: 'Walmart' },
        date: '2026-11-01',
        total: 19.9,
        ocr_text: 'Walmart\nTOTAL 19.90\nNovember 1, 2026',
      };
    },
  };
  const first = await post(jpeg, { key: 'idem-key-1' }, options);
  assert.equal(first.status, 200);
  const again = await post(jpeg, { key: 'idem-key-2' }, options);
  const againBody = await again.json();
  assert.equal(again.status, 200);
  assert.equal(againBody.duplicate, true);
  assert.equal(againBody.total, 19.9);
  assert.equal(processed, 1);

  const other = Uint8Array.from([...jpeg, 1]);
  const second = await post(other, { key: 'idem-key-3' }, options);
  assert.equal(second.status, 200);
  const third = await post(Uint8Array.from([...jpeg, 2]), { key: 'idem-key-4' }, options);
  assert.equal(third.status, 429);
  assert.equal(processed, 2);

  const clash = await post(Uint8Array.from([...jpeg, 9]), { key: 'idem-key-1' }, options);
  assert.equal(clash.status, 409);

  const notImage = await post(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]), { key: 'idem-key-9' }, options);
  assert.equal(notImage.status, 415);
  assert.equal(processed, 2);

  resetExtractGuards();
  const digest = await crypto.subtle.digest('SHA-256', jpeg);
  const jpegHash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  let openCalls = 0;
  const notHashed = await post(Uint8Array.from([...jpeg, 3]), { key: 'open-photo-1' }, {
    env: {
      VERYFI_LIVE_CALLS: '1',
      VERYFI_ALLOWED_SHA256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      VERYFI_PREVIEW_DOC_CAP: '3',
    },
    processDocument: async () => {
      openCalls += 1;
      return { vendor: { raw_name: 'Walmart' }, date: '2026-11-01', total: 19.9, ocr_text: 'Walmart\nTOTAL 19.90', document_type: 'receipt' };
    },
  });
  assert.equal(notHashed.status, 200);
  assert.equal(openCalls, 1);

  resetExtractGuards();
  let ledger = 0;
  let attempts = 0;
  const flaky = {
    env: { VERYFI_LIVE_CALLS: '1', VERYFI_PREVIEW_DOC_CAP: '3' },
    reserveAttempt: async (cap) => {
      if (ledger >= cap) return false;
      ledger += 1;
      return true;
    },
    processDocument: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('timeout');
      return { vendor: { raw_name: 'Walmart' }, date: '2026-11-01', total: 19.9, ocr_text: 'TOTAL 19.90' };
    },
  };
  const failed = await post(jpeg, { key: 'retry-key-1' }, flaky);
  assert.equal(failed.status, 502);
  const retried = await post(jpeg, { key: 'retry-key-2' }, flaky);
  assert.equal(retried.status, 200);
  assert.equal(attempts, 2);
  assert.equal(ledger, 2);
  const thirdPhoto = await post(Uint8Array.from([...jpeg, 4]), { key: 'retry-key-3' }, flaky);
  assert.equal(thirdPhoto.status, 200);
  const fourth = await post(Uint8Array.from([...jpeg, 5]), { key: 'retry-key-4' }, flaky);
  assert.equal(fourth.status, 429);
  assert.equal(attempts, 3);
  assert.equal(ledger, 3);

  resetExtractGuards();
  const noLedger = await post(jpeg, { key: 'no-ledger-1' }, {
    env: { VERYFI_LIVE_CALLS: '1', VERYFI_CLIENT_ID: 'test-client', VERYFI_USERNAME: 'test-user', VERYFI_API_KEY: 'test-key' },
  });
  assert.equal(noLedger.status, 503);

  let seenKey = '';
  let boost = null;
  const provider = await processVeryfiDocument(
    jpeg,
    'image/jpeg',
    { clientId: 'test-client', username: 'test-user', apiKey: 'test-key' },
    async (_url, init) => {
      seenKey = init.headers['Idempotency-Key'];
      boost = JSON.parse(init.body).boost_mode;
      return new Response(JSON.stringify({
        vendor: { name: 'Walmart' },
        date: '2026-11-01',
        total: 19.9,
        ocr_text: 'TOTAL 19.90',
        document_type: { value: 'receipt' },
      }), { status: 201 });
    },
    jpegHash,
  );
  assert.equal(seenKey, jpegHash);
  assert.equal(boost, false);
  assert.equal(provider.document_type, 'receipt');
  assert.equal(provider.vendor.name, 'Walmart');

  console.log('PASS receipt evidence, upload guards, and recorded provider readings');
} finally {
  await server.close();
}
