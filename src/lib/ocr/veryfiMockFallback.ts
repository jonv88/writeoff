/**
 * Private-preview fallback using redacted mocks.
 * Live Veryfi stays off until the account's $0 quota is confirmed.
 * This module never calls the network and never reads API credentials.
 */
import { fieldHintsFor, formatOcrAmount, parseTotalFromText } from './browserOcr';

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

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function fullYear(yearText: string): number {
  const year = Number(yearText);
  return yearText.length === 2 ? 2000 + year : year;
}

/** Month-name and year-first dates are unambiguous. Numeric dates with both parts ≤ 12 are not. */
export function evidenceDate(text: string): { date: string | null; ambiguous: boolean } {
  const unambiguous: string[] = [];
  const ambiguousPairs: { mdy: string; dmy: string }[] = [];
  const re =
    /\b(?:(\d{4})\s*([-/.])\s*(\d{1,2})\s*\2\s*(\d{1,2})|(\d{1,2})\s*([-/.])\s*(\d{1,2})\s*\6\s*(\d{4}|\d{2})|([a-z]{3,9})\s+(\d{1,2}),?\s+(\d{4}))\b/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match[1]) {
      const iso = isoDate(Number(match[1]), Number(match[3]), Number(match[4]));
      if (iso) unambiguous.push(iso);
      continue;
    }
    if (match[9]) {
      const month = MONTHS[match[9].toLowerCase()];
      const iso = month ? isoDate(Number(match[11]), month, Number(match[10])) : null;
      if (iso) unambiguous.push(iso);
      continue;
    }
    const year = fullYear(match[8]);
    const first = Number(match[5]);
    const second = Number(match[7]);
    const mdy = isoDate(year, first, second);
    const dmy = isoDate(year, second, first);
    if (mdy && dmy && mdy !== dmy) ambiguousPairs.push({ mdy, dmy });
    else if (mdy) unambiguous.push(mdy);
    else if (dmy) unambiguous.push(dmy);
  }
  const uniqueAnchors = [...new Set(unambiguous)];
  if (ambiguousPairs.length) {
    const resolved =
      uniqueAnchors.length === 1 &&
      ambiguousPairs.every((pair) => pair.mdy === uniqueAnchors[0] || pair.dmy === uniqueAnchors[0]);
    if (resolved) return { date: uniqueAnchors[0], ambiguous: false };
    return { date: null, ambiguous: true };
  }
  if (uniqueAnchors.length === 1) return { date: uniqueAnchors[0], ambiguous: false };
  return { date: null, ambiguous: uniqueAnchors.length > 1 };
}

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
