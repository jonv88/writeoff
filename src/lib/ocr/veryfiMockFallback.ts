/**
 * Private-preview fallback using redacted mocks.
 * Live Veryfi stays off until the account's $0 quota is confirmed.
 * This module never calls the network and never reads API credentials.
 */
import { fieldHintsFor, formatOcrAmount, parseTotalFromText } from './browserOcr';
import { evidenceDate } from './receiptEvidence.ts';

export { evidenceDate };

/** Hard stop. Do not flip this on from the client. */
export const LIVE_VERYFI_CALLS_ENABLED = false;

export const LIVE_VERYFI_BLOCK_REASON =
  'Live Veryfi is off until you confirm this account has enough $0 quota for the test.';

export type MockCaseId = 'supported-total' | 'conflicting-total' | 'ambiguous-date';

export type MockVeryfiResponse = {
  id: MockCaseId;
  label: string;
  live: false;
  merchant: string;
  /** Proposed date. Null when the mock date is ambiguous. */
  date: string | null;
  /** Proposed final amount. Ignored unless the mock evidence supports it. */
  total: number | null;
  /** Redacted synthetic receipt text. This is the evidence the pilot logs lacked. */
  evidenceText: string;
};

export const MOCK_VERYFI_RESPONSES: Record<MockCaseId, MockVeryfiResponse> = {
  'supported-total': {
    id: 'supported-total',
    label: 'Mock: supported total',
    live: false,
    merchant: 'Demo Market',
    date: '2026-11-03',
    total: 18.4,
    evidenceText: 'Demo Market\nItem 16.00\nAMOUNT PAID 18.40\nNovember 3, 2026',
  },
  'conflicting-total': {
    id: 'conflicting-total',
    label: 'Mock: conflicting totals',
    live: false,
    merchant: 'Harbor Market',
    date: '2026-11-02',
    total: 15,
    evidenceText: 'Harbor Market\nTOTAL 12.50\nGRAND TOTAL 15.00\nAMOUNT DUE 11.00\nNovember 2, 2026',
  },
  'ambiguous-date': {
    id: 'ambiguous-date',
    label: 'Mock: ambiguous date',
    live: false,
    merchant: 'Northside Hardware',
    date: null,
    total: 25.37,
    evidenceText: 'Northside Hardware\nGRAND TOTAL 25.37\n11/02/2026 10:15',
  },
};

export type FieldSnapshot = {
  merchant: string;
  date: string;
  amount: string;
  uncertain: string[];
};

export type UserEdits = {
  merchant: boolean;
  date: boolean;
  amount: boolean;
};

export type MockFallbackResult = {
  live: false;
  label: string;
  merchant: string;
  date: string;
  amount: string;
  uncertain: string[];
  fieldHints: { merchant?: string; date?: string; total?: string };
  message: string;
  preserved: string[];
  accepted: string[];
  leftForReview: string[];
};

function sameMoney(a: number, b: number): boolean {
  return Math.abs(Math.round(a * 100) - Math.round(b * 100)) <= 2;
}

function merchantInEvidence(name: string, text: string): boolean {
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const needle = norm(name);
  return needle.length >= 3 && norm(text).includes(needle);
}

function hasValue(value: string): boolean {
  return value.trim() !== '';
}

/** Describes the form field, not the mock evidence. "Filled" only when the value changes. */
function fieldNotice(name: 'Merchant' | 'Date' | 'Amount', before: string, after: string, forReview: boolean): string {
  const previous = before.trim();
  const next = after.trim();
  if (next !== previous && next !== '') return `${name} filled.`;
  if (previous !== '' && next === previous) return `Existing ${name.toLowerCase()} kept.`;
  if (forReview || next === '') return `${name} left for review.`;
  return `${name} filled.`;
}

function reliable(value: string, field: 'merchant' | 'date' | 'total', uncertain: string[]): boolean {
  return hasValue(value) && !uncertain.includes(field);
}

export function applyMockFallback(input: {
  id: MockCaseId;
  tesseract: FieldSnapshot;
  current: { merchant: string; date: string; amount: string };
  userEdited: UserEdits;
}): MockFallbackResult {
  if (LIVE_VERYFI_CALLS_ENABLED) {
    throw new Error(LIVE_VERYFI_BLOCK_REASON);
  }
  const mock = MOCK_VERYFI_RESPONSES[input.id];
  const preserved: string[] = [];
  const accepted: string[] = [];
  const leftForReview: string[] = [];
  const uncertain = new Set<string>();

  let merchant = '';
  if (input.userEdited.merchant) {
    merchant = input.current.merchant;
    preserved.push('your merchant edit');
  } else if (reliable(input.tesseract.merchant, 'merchant', input.tesseract.uncertain)) {
    merchant = input.tesseract.merchant;
    preserved.push('on-device merchant');
  } else if (merchantInEvidence(mock.merchant, mock.evidenceText)) {
    merchant = mock.merchant;
    accepted.push('merchant');
  } else {
    merchant = input.tesseract.merchant;
    uncertain.add('merchant');
    leftForReview.push('merchant');
  }

  let date = '';
  const dated = evidenceDate(mock.evidenceText);
  if (input.userEdited.date) {
    date = input.current.date;
    preserved.push('your date edit');
  } else if (reliable(input.tesseract.date, 'date', input.tesseract.uncertain)) {
    date = input.tesseract.date;
    preserved.push('on-device date');
  } else if (!dated.ambiguous && dated.date && dated.date === mock.date) {
    date = dated.date;
    accepted.push('date');
  } else {
    date = input.tesseract.date;
    uncertain.add('date');
    leftForReview.push('date');
  }

  let amount = '';
  const evidenced = parseTotalFromText(mock.evidenceText);
  const totalSupported =
    mock.total != null && evidenced.total != null && sameMoney(evidenced.total, mock.total);
  if (input.userEdited.amount) {
    amount = input.current.amount;
    preserved.push('your amount edit');
  } else if (reliable(input.tesseract.amount, 'total', input.tesseract.uncertain)) {
    amount = input.tesseract.amount;
    preserved.push('on-device amount');
  } else if (totalSupported && mock.total != null) {
    amount = formatOcrAmount(mock.total);
    accepted.push('amount');
  } else {
    amount = input.tesseract.amount;
    uncertain.add('total');
    leftForReview.push('amount');
  }

  const review = [...uncertain];
  const hints = fieldHintsFor(review);
  const formNotes = [
    fieldNotice('Merchant', input.current.merchant, merchant, leftForReview.includes('merchant')),
    fieldNotice('Date', input.current.date, date, leftForReview.includes('date')),
    fieldNotice('Amount', input.current.amount, amount, leftForReview.includes('amount')),
  ];
  const message = `${mock.label}. Live Veryfi is off and the photo was not sent. ${formNotes.join(' ')}`;

  return {
    live: false,
    label: mock.label,
    merchant,
    date,
    amount,
    uncertain: review,
    fieldHints: hints,
    message,
    preserved,
    accepted,
    leftForReview,
  };
}
