import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'error' });

try {
  const mod = await server.ssrLoadModule('/src/lib/expenseSave.ts');
  const {
    receiptStoragePath,
    normalizeReceiptMime,
    assertReceiptUploadable,
    describeSaveFailure,
    sanitizeSaveDiagnostic,
    ExpenseSaveError,
    MAX_RECEIPT_UPLOAD_BYTES,
  } = mod;

  assert.equal(
    receiptStoragePath('7c8c8952-1849-4ca9-99c5-b2faf098fd39', '0dabc525-6ff8-4b15-9183-e39cf155ab2e', 'image/jpeg'),
    '7c8c8952-1849-4ca9-99c5-b2faf098fd39/0dabc525-6ff8-4b15-9183-e39cf155ab2e/receipt.jpg',
  );
  assert.equal(receiptStoragePath('u', 'e', 'image/png'), 'u/e/receipt.png');
  assert.equal(normalizeReceiptMime({ type: '', name: 'photo.JPG' }), 'image/jpeg');
  assert.equal(normalizeReceiptMime({ type: 'image/webp', name: 'x.bin' }), 'image/webp');
  assert.equal(assertReceiptUploadable({ size: 12, type: 'image/jpeg', name: 'a.jpg' }), 'image/jpeg');
  assert.throws(() => assertReceiptUploadable({ size: 0, type: 'image/jpeg', name: 'a.jpg' }), /empty/i);
  assert.throws(
    () => assertReceiptUploadable({ size: MAX_RECEIPT_UPLOAD_BYTES + 1, type: 'image/jpeg', name: 'a.jpg' }),
    /3 MB/i,
  );

  assert.match(describeSaveFailure(new TypeError('Load failed'), 'upload'), /did not finish uploading/i);
  assert.match(describeSaveFailure(new TypeError('Failed to fetch'), 'expense'), /interrupted/i);
  assert.match(describeSaveFailure({ message: 'JWT expired', status: 401 }, 'auth'), /session expired/i);
  assert.match(
    describeSaveFailure(new ExpenseSaveError('Choose a receipt smaller than 3 MB.', { stage: 'upload', retryable: false })),
    /3 MB/,
  );

  const note = sanitizeSaveDiagnostic({
    stage: 'upload',
    expenseId: '0dabc525-6ff8-4b15-9183-e39cf155ab2e',
    storagePath: '7c8c8952-1849-4ca9-99c5-b2faf098fd39/0dabc525-6ff8-4b15-9183-e39cf155ab2e/receipt.jpg',
    byteLength: 184320,
    mimeType: 'image/jpeg',
    httpStatus: null,
    errorName: 'StorageUnknownError',
    errorMessage: 'Load failed from MJ at the Neil Simon TOTAL 31.86',
  });
  assert.equal(note.errorClass, 'network');
  assert.equal(note.mimeType, 'image/jpeg');
  assert.equal(note.storageOwned, 1);
  assert.equal(JSON.stringify(note).includes('Neil'), false);
  assert.equal(JSON.stringify(note).includes('31.86'), false);

  const draft = await server.ssrLoadModule('/src/lib/receiptDraft.ts');
  const key = draft.RECEIPT_DRAFT_KEY;
  globalThis.localStorage = {
    store: {},
    getItem(name) { return this.store[name] || null; },
    setItem(name, value) { this.store[name] = String(value); },
    removeItem(name) { delete this.store[name]; },
  };
  draft.saveReceiptDraft({
    merchant: 'MJ at the Neil Simon - Lower Level Bar',
    amount: '31.86',
    date: '2026-11-07',
    currency: 'USD',
    notes: '',
    updatedAt: '2026-11-08T03:03:00.000Z',
    expenseId: '0dabc525-6ff8-4b15-9183-e39cf155ab2e',
    provider: 'tesseract.js',
  });
  const loaded = draft.loadReceiptDraft();
  assert.equal(loaded.expenseId, '0dabc525-6ff8-4b15-9183-e39cf155ab2e');
  assert.equal(loaded.provider, 'tesseract.js');
  assert.equal(loaded.amount, '31.86');
  assert.equal(JSON.parse(globalThis.localStorage.getItem(key)).provider, 'tesseract.js');

  console.log('PASS expense save helpers');
} finally {
  await server.close();
}
