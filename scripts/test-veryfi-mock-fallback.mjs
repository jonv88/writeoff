#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom' });
try {
  const {
    LIVE_VERYFI_CALLS_ENABLED,
    MOCK_VERYFI_RESPONSES,
    applyMockFallback,
    evidenceDate,
  } = await server.ssrLoadModule('/src/lib/ocr/veryfiMockFallback.ts');

  assert.equal(LIVE_VERYFI_CALLS_ENABLED, false);
  for (const mock of Object.values(MOCK_VERYFI_RESPONSES)) {
    assert.equal(mock.live, false);
    assert.match(mock.label, /^Mock:/);
    assert.doesNotMatch(mock.evidenceText, /veryfi|api[_-]?key|client[_-]?id/i);
  }

  const blank = { merchant: '', date: '', amount: '', uncertain: ['merchant', 'date', 'total'] };
  const untouched = { merchant: false, date: false, amount: false };

  const supported = applyMockFallback({
    id: 'supported-total',
    tesseract: { ...blank, merchant: 'ACME', date: '2026-11-02', uncertain: ['total'] },
    current: { merchant: 'ACME', date: '2026-11-02', amount: '' },
    userEdited: untouched,
  });
  assert.equal(supported.merchant, 'ACME');
  assert.equal(supported.date, '2026-11-02');
  assert.equal(supported.amount, '18.40');
  assert.deepEqual(supported.accepted, ['amount']);
  assert.deepEqual(supported.leftForReview, []);
  assert.ok(supported.preserved.includes('on-device merchant'));
  assert.ok(supported.preserved.includes('on-device date'));
  assert.match(supported.message, /photo was not sent/i);
  assert.match(supported.message, /Mock: supported total/);
  assert.match(supported.message, /Redacted evidence supports 18\.40/);

  const keptPaid = applyMockFallback({
    id: 'supported-total',
    tesseract: { merchant: 'DEMO COFFEE CO', date: '2026-10-21', amount: '4.90', uncertain: [] },
    current: { merchant: 'DEMO COFFEE CO', date: '2026-10-21', amount: '4.90' },
    userEdited: untouched,
  });
  assert.equal(keptPaid.amount, '4.90');
  assert.match(keptPaid.message, /Redacted evidence supports 18\.40/);
  assert.match(keptPaid.message, /on-device amount/);

  const edited = applyMockFallback({
    id: 'supported-total',
    tesseract: blank,
    current: { merchant: 'Typed Cafe', date: '2026-10-01', amount: '9.00' },
    userEdited: { merchant: true, date: true, amount: true },
  });
  assert.equal(edited.merchant, 'Typed Cafe');
  assert.equal(edited.date, '2026-10-01');
  assert.equal(edited.amount, '9.00');
  assert.deepEqual(edited.accepted, []);
  assert.deepEqual(edited.leftForReview, []);

  const conflict = applyMockFallback({
    id: 'conflicting-total',
    tesseract: blank,
    current: { merchant: '', date: '', amount: '' },
    userEdited: untouched,
  });
  assert.equal(conflict.amount, '');
  assert.equal(conflict.date, '2026-11-02');
  assert.equal(conflict.merchant, 'Harbor Market');
  assert.ok(conflict.leftForReview.includes('amount'));
  assert.ok(!conflict.accepted.includes('amount'));
  assert.notEqual(conflict.amount, '15.00');
  assert.match(conflict.message, /15\.00 was not accepted/);

  const conflictKeepsPaid = applyMockFallback({
    id: 'conflicting-total',
    tesseract: { merchant: 'ACME', date: '2026-11-02', amount: '25.96', uncertain: [] },
    current: { merchant: 'ACME', date: '2026-11-02', amount: '25.96' },
    userEdited: untouched,
  });
  assert.equal(conflictKeepsPaid.amount, '25.96');
  assert.equal(conflictKeepsPaid.date, '2026-11-02');
  assert.deepEqual(conflictKeepsPaid.leftForReview, []);

  const ambiguous = applyMockFallback({
    id: 'ambiguous-date',
    tesseract: blank,
    current: { merchant: '', date: '', amount: '' },
    userEdited: untouched,
  });
  assert.equal(ambiguous.date, '');
  assert.equal(ambiguous.amount, '25.37');
  assert.ok(ambiguous.leftForReview.includes('date'));
  assert.match(ambiguous.message, /11\/02\/2026/);
  assert.match(ambiguous.message, /no date was accepted/);
  assert.equal(evidenceDate(MOCK_VERYFI_RESPONSES['ambiguous-date'].evidenceText).ambiguous, true);
  assert.equal(evidenceDate('November 3, 2026').date, '2026-11-03');
  assert.equal(evidenceDate('2026-11-02').date, '2026-11-02');
  assert.equal(evidenceDate('11/02/2026').ambiguous, true);

  console.log('PASS mock fallback: supported total, conflicting total, ambiguous date, preserved fields');
} finally {
  await server.close();
}
