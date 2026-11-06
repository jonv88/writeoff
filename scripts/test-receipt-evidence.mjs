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
  const { parseTotalFromText, explainTotal, rowsFromLayout } = totals;
  const liveMod = await server.ssrLoadModule('/src/server/veryfiLive.ts');
  const { handleExtractReceipt, resetExtractGuards, liveDocumentCount } = handlerMod;
  const { handlePreviewAccess } = await server.ssrLoadModule('/src/server/ownerAccess.ts');
  const { processVeryfiDocument } = liveMod;

  assert.equal(parseTotalFromText('TIP 3.50\nAMOUNT PAID 29.30').total, 29.3);
  assert.equal(parseTotalFromText('YOU SAVED 48.00\nAMOUNT DUE 23.76').total, 23.76);
  assert.equal(parseTotalFromText('TOTAL 19.90\nCASH TENDERED 20.00\nCHANGE 0.10').total, 19.9);
  assert.equal(parseTotalFromText('TOTAL 19.90 CHANGE 0.10').total, 19.9);
  assert.equal(parseTotalFromText('TOTAL 12.50\nGRAND TOTAL 15.00\nAMOUNT DUE 11.00').total, null);
  assert.equal(parseTotalFromText('CASH 20.00').total, null);
  assert.equal(parseTotalFromText('SUBTOTAL\n16.40\nTAX\n1.20\nTOTAL\n17.60').total, 17.6);
  assert.equal(parseTotalFromText('TOTAL\n4.92\nCASH TENDERED\n5.00\nCHANGE\n0.08').total, 4.92);
  assert.equal(parseTotalFromText('REWARDS BALANCE\n48.20\nTOTAL\n12.34').total, 12.34);
  assert.equal(parseTotalFromText('TOTAL\n12.50\nGRAND TOTAL\n15.00\nAMOUNT DUE\n11.00').total, null);
  assert.equal(
    parseTotalFromText('SUBTOTAL 14.98\nTAX 0.99\nTOTAL 15.97\nROUNDING 0.02\nCASH 20.00\nCHANGE 4.05\nCASH 0.87\nBALANCE 0.73').total,
    15.97,
  );
  assert.equal(parseTotalFromText('****BALANCE 25.96').total, 25.96);
  const structuredCash = explainTotal('TOTAL\n4.92\nCASH TENDERED\n5.00\nCHANGE\n0.08', { structured: { total: 5 } });
  assert.equal(structuredCash.total, 4.92);
  assert.equal(structuredCash.reason, 'accepted-next-line');
  const structuredOnly = explainTotal('Notebook 3.50\nPen 1.25', { structured: { total: 4.75, tax: 0.4 } });
  assert.equal(structuredOnly.total, null);
  assert.equal(structuredOnly.reason, 'rejected-structured-only');
  const sideBySide = explainTotal('TOTAL CASH\n10.50 20.00', {
    layoutText: rowsFromLayout([
      { text: 'TOTAL', top: 0.8, left: 0.1 },
      { text: '10.50', top: 0.802, left: 0.72 },
      { text: 'CASH', top: 0.9, left: 0.1 },
      { text: '20.00', top: 0.901, left: 0.72 },
    ]).join('\n'),
  });
  assert.equal(sideBySide.total, 10.5);
  assert.equal(sideBySide.reason, 'accepted-layout-row');

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

  const split = resolveVeryfiDocument(JSON.parse(readFileSync('fixtures/veryfi-recorded/split-line-total.json', 'utf8')));
  assert.equal(split.total, 17.6);
  assert.equal(split.uncertainFields.includes('total'), false);
  assert.equal(split.totalTrace.reason, 'accepted-next-line');
  const rounded = resolveVeryfiDocument(JSON.parse(readFileSync('fixtures/veryfi-recorded/cash-rounding.json', 'utf8')));
  assert.equal(rounded.total, 4.92);
  assert.equal(rounded.totalTrace.decision, 'accepted');
  const rewards = resolveVeryfiDocument(JSON.parse(readFileSync('fixtures/veryfi-recorded/rewards-balance.json', 'utf8')));
  assert.equal(rewards.total, 12.34);
  assert.equal(rewards.merchant, 'Harbor Books');
  const retained = resolveVeryfiDocument(JSON.parse(readFileSync('fixtures/veryfi-recorded/labeled-total-with-balance.json', 'utf8')));
  assert.equal(retained.total, 15.97);
  assert.equal(retained.totalTrace.reason, 'accepted-same-line');
  assert.equal(retained.merchant, 'Market Street');
  assert.equal(retained.date, '2026-11-04');
  const retainedForm = mergeReceiptReading({
    local: {
      merchant: null,
      date: null,
      total: null,
      currency: 'USD',
      uncertainFields: ['merchant', 'date', 'total'],
      status: 'needs_details',
      message: 'Some fields need a quick check before saving.',
    },
    remote: retained,
  });
  assert.equal(retainedForm.total, 15.97);
  assert.equal(retainedForm.merchant, 'Market Street');
  assert.equal(retainedForm.date, '2026-11-04');
  const edited = mergeReceiptReading({
    local: {
      merchant: 'Pine Grocery',
      date: '2026-11-04',
      total: 3.25,
      currency: 'USD',
      uncertainFields: [],
      status: 'ready',
      message: 'Review the details before saving.',
    },
    remote: rounded,
  });
  assert.equal(edited.total, 3.25);

  const diagnostics = await server.ssrLoadModule('/src/server/fieldDiagnostics.ts');
  const { mergeDiagnosticLog, sanitizeDiagnostic, shouldRetainTotalTrace } = diagnostics;
  const dirty = sanitizeDiagnostic({
    requestId: 'req-1',
    at: '2026-11-05T18:00:00.000Z',
    field: 'total',
    decision: 'rejected',
    reason: 'rejected-conflict',
    structuredTotal: 15.97,
    candidates: [12.5, 15, 1, 2, 3, 4, 5, 6, 7, 8],
    evidence: [
      'total:same-line:12.5',
      'card 4111111111111111',
      'person@example.com',
      ...Array.from({ length: 10 }, (_, index) => `cash:same-line:${index}.10`),
    ],
  });
  assert.equal(dirty.evidence.some((item) => item.includes('4111') || item.includes('@')), false);
  assert.equal(dirty.evidence[0], 'total:same-line:12.5');
  assert.equal(dirty.evidence.length, 8);
  assert.equal(dirty.reason, 'rejected-conflict');
  assert.equal(dirty.structuredTotal, 15.97);
  assert.equal(dirty.evidence.some((item) => item.startsWith('structured-total')), false);
  assert.equal(shouldRetainTotalTrace('accepted-same-line'), false);
  assert.equal(shouldRetainTotalTrace('accepted-next-line'), true);
  const keptLog = mergeDiagnosticLog(
    [
      { requestId: 'old', at: '2026-11-01T00:00:00.000Z', field: 'total', decision: 'rejected', reason: 'rejected-no-label', candidates: [], evidence: [] },
      ...Array.from({ length: 8 }, (_, index) => ({
        requestId: `keep-${index}`,
        at: '2026-11-05T18:00:00.000Z',
        field: 'total',
        decision: 'rejected',
        reason: 'rejected-conflict',
        candidates: [index],
        evidence: [`total:same-line:${index}.00`],
      })),
    ],
    dirty,
    Date.parse('2026-11-05T19:00:00.000Z'),
  );
  assert.equal(keptLog.length, 8);
  assert.equal(keptLog.some((item) => item.requestId === 'old'), false);
  assert.equal(keptLog[keptLog.length - 1].requestId, 'req-1');

  const { toVeryfiDocument } = liveMod;
  const mapped = toVeryfiDocument({
    vendor: { raw_name: 'Northline Market' },
    total: 17.6,
    subtotal: 16.4,
    tax: 1.2,
    ocr_text: 'Northline Market\nTOTAL\n17.60',
    payment: { card_number: '4111111111111111', type: 'visa' },
    meta: {
      pages: [{
        ocr: {
          lines: [
            { text: 'TOTAL', bounding_box: [0.1, 0.8, 0.3, 0.82] },
            { text: '17.60', bounding_box: [0.6, 0.8, 0.8, 0.82] },
          ],
        },
      }],
    },
  });
  assert.equal(JSON.stringify(mapped).includes('4111'), false);
  assert.equal(mapped.total, 17.6);
  assert.equal(mapped.layoutLines.length, 2);
  assert.equal(resolveVeryfiDocument(mapped).total, 17.6);
  const withItems = toVeryfiDocument({
    vendor: { name: 'Market Street' },
    total: 15.97,
    ocr_text: 'Market Street\nTOTAL 15.97',
    line_items: [
      { description: 'Skittles', price: 1.49, total: 1.49, text: 'Skittles 1.49', type: 'product' },
      { description: '', full_description: 'Bandages 10 ct', price: 4.29, type: 'product' },
      { description: 'Sales tax', price: 0.99, type: 'tax' },
      { text: '2.50', price: 2.5, type: 'product' },
    ],
  });
  assert.deepEqual(withItems.line_items.map((item) => item.description), ['Skittles', 'Bandages 10 ct']);
  assert.equal(JSON.stringify(withItems.line_items).includes('1.49'), false);
  assert.equal(resolveVeryfiDocument(withItems).total, 15.97);
  assert.deepEqual(resolveVeryfiDocument(withItems).items, [{ name: 'Skittles' }, { name: 'Bandages 10 ct' }]);

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
          ...(extra.cookie ? { cookie: extra.cookie } : {}),
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
  assert.equal(recordedBody.totalTrace, undefined);
  assert.equal(calls, 1);

  resetExtractGuards();
  const noted = [];
  let reserved = 0;
  const splitResponse = await post(jpeg, { name: 'split-line-total.png', key: 'split-line-key-01' }, {
    selectRecorded() {
      return JSON.parse(readFileSync('fixtures/veryfi-recorded/split-line-total.json', 'utf8'));
    },
    reserveAttempt() {
      reserved += 1;
      return true;
    },
    recordDiagnostic(entry) {
      noted.push(entry);
    },
  });
  const splitBody = await splitResponse.json();
  assert.equal(splitResponse.status, 200);
  assert.equal(splitBody.total, 17.6);
  assert.equal(splitBody.merchant, 'Northline Market');
  assert.equal(splitBody.totalTrace, undefined);
  assert.doesNotMatch(JSON.stringify(splitBody), /ocr_text|16\.40|SUBTOTAL/);
  assert.equal(reserved, 0);
  assert.equal(liveDocumentCount(), 0);
  assert.equal(noted.length, 1);
  assert.equal(noted[0].reason, 'accepted-next-line');
  assert.equal(noted[0].structuredTotal, 17.6);
  assert.equal(noted[0].requestId, 'split-line-key-01');
  assert.equal(noted[0].evidence.some((item) => /Northline|November/.test(item)), false);

  resetExtractGuards();
  const crowdedNotes = [];
  const crowded = await post(jpeg, { name: 'crowded-total.png', key: 'crowded-total-key' }, {
    selectRecorded() {
      return {
        vendor: { name: 'Market Street' },
        date: '2026-11-04',
        total: 0.73,
        ocr_text: [
          'SUBTOTAL 14.98',
          'TAX 0.99',
          'TOTAL 15.97',
          'ROUNDING 0.02',
          'CASH 20.00',
          'CHANGE 4.05',
          'CASH 0.87',
          'BALANCE 0.73',
          'GRAND TOTAL 11.00',
        ].join('\n'),
      };
    },
    recordDiagnostic(entry) {
      crowdedNotes.push(entry);
    },
  });
  const crowdedBody = await crowded.json();
  assert.equal(crowded.status, 200);
  assert.equal(crowdedBody.total, null);
  assert.equal(crowdedBody.totalTrace, undefined);
  assert.equal(crowdedNotes.length, 1);
  assert.equal(crowdedNotes[0].reason, 'rejected-conflict');
  assert.equal(crowdedNotes[0].structuredTotal, 0.73);
  assert.equal(crowdedNotes[0].evidence.length, 8);
  assert.equal(crowdedNotes[0].evidence.some((item) => item.startsWith('structured-')), false);

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
  let ownerCalls = 0;
  const ownerEnv = {
    env: { PREVIEW_OWNER_CODE: 'owner-test-code', VERYFI_LIVE_CALLS: '1', VERYFI_PREVIEW_DOC_CAP: '3' },
    processDocument: async () => {
      ownerCalls += 1;
      return { vendor: { raw_name: 'Walmart' }, date: '2026-11-01', total: 19.9, ocr_text: 'TOTAL 19.90' };
    },
  };
  const locked = await post(jpeg, { key: 'owner-locked-1' }, ownerEnv);
  assert.equal(locked.status, 401);
  const wrongOwner = await post(jpeg, { key: 'owner-wrong-1', cookie: 'wo_owner=someone-else' }, ownerEnv);
  assert.equal(wrongOwner.status, 401);
  assert.equal(ownerCalls, 0);
  const owner = await post(jpeg, { key: 'owner-open-1', cookie: 'wo_owner=owner-test-code' }, ownerEnv);
  assert.equal(owner.status, 200);
  assert.equal(ownerCalls, 1);
  const denied = await handlePreviewAccess(
    new Request('https://preview.test/api/preview-access', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'nope' }),
    }),
    { PREVIEW_OWNER_CODE: 'owner-test-code' },
  );
  assert.equal(denied.status, 401);
  const admitted = await handlePreviewAccess(
    new Request('https://preview.test/api/preview-access', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'owner-test-code' }),
    }),
    { PREVIEW_OWNER_CODE: 'owner-test-code' },
  );
  assert.equal(admitted.status, 204);
  assert.match(admitted.headers.get('set-cookie') || '', /^wo_owner=/);
  assert.equal(await admitted.text(), '');

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
