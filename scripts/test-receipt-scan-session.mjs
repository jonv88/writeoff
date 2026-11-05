import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ReceiptScanSession } from '../src/lib/ocr/receiptScanSession.ts';

const session = new ReceiptScanSession();
const first = session.begin();
assert.equal(session.isCurrent(first), true);
const second = session.begin();
assert.equal(session.isCurrent(first), false, 'late first photo must not replace the second');
assert.equal(session.isCurrent(second), true);
session.invalidate();
assert.equal(session.isCurrent(second), false, 'closing must invalidate an in-flight scan');
const reopened = session.begin();
assert.equal(session.isCurrent(second), false);
assert.equal(session.isCurrent(reopened), true);
const dialog = readFileSync(new URL('../src/components/dialogs/SnapReceiptDialog.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(dialog, /veryfiMockFallback|applyMockCase|MOCK_VERYFI_RESPONSES/, 'sample data must not enter receipt forms');
console.log('PASS: receipt isolation, close/reopen, and mock import boundary');
