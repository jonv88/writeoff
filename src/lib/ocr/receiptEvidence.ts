/**
 * Turn a receipt reading into merchant, U.S. date, and final amount.
 * Structured provider fields are accepted only when the receipt text agrees.
 * No network and no credentials.
 */
import { parseTotalFromText } from './receiptTotals.ts';

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

export type ReceiptReading = {
  merchant: string | null;
  date: string | null;
  total: number | null;
  currency: string;
  uncertainFields: string[];
  fieldHints: { merchant?: string; date?: string; total?: string };
  message: string;
  status: 'ready' | 'needs_details' | 'failed';
};

export type VeryfiDocumentShape = {
  vendor?: { name?: string | null; raw_name?: string | null } | null;
  date?: string | null;
  total?: number | null;
  tip?: number | null;
  currency_code?: string | null;
  ocr_text?: string | null;
  document_type?: string | null;
};

type DatedEvidence = {
  date: string | null;
  ambiguous: boolean;
  /** Single U.S. month/day reading when the numeric date could also be day/month. */
  usNumeric: string | null;
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
export function evidenceDate(text: string): DatedEvidence {
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
  const usChoices = [...new Set(ambiguousPairs.map((pair) => pair.mdy))];
  if (ambiguousPairs.length) {
    const resolved =
      uniqueAnchors.length === 1 &&
      ambiguousPairs.every((pair) => pair.mdy === uniqueAnchors[0] || pair.dmy === uniqueAnchors[0]);
    if (resolved) return { date: uniqueAnchors[0], ambiguous: false, usNumeric: null };
    return {
      date: null,
      ambiguous: true,
      usNumeric: uniqueAnchors.length === 0 && usChoices.length === 1 ? usChoices[0] : null,
    };
  }
  if (uniqueAnchors.length === 1) return { date: uniqueAnchors[0], ambiguous: false, usNumeric: null };
  return { date: null, ambiguous: uniqueAnchors.length > 1, usNumeric: null };
}

export function providerDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** Accept a U.S. month/day reading. A provider date that swaps the parts stays for review. */
export function resolveUsDate(text: string, proposed: string | null): { date: string | null; uncertain: boolean } {
  const dated = evidenceDate(text);
  if (dated.date && !dated.ambiguous) {
    if (proposed && proposed !== dated.date) return { date: null, uncertain: true };
    return { date: dated.date, uncertain: false };
  }
  if (dated.usNumeric && (!proposed || proposed === dated.usNumeric)) {
    return { date: dated.usNumeric, uncertain: false };
  }
  return { date: null, uncertain: true };
}

function merchantSupported(name: string, text: string): boolean {
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const needle = norm(name);
  return needle.length >= 3 && norm(text).includes(needle);
}

function hintsFor(uncertain: string[]): ReceiptReading['fieldHints'] {
  return {
    ...(uncertain.includes('merchant') ? { merchant: 'Confirm the merchant name' } : {}),
    ...(uncertain.includes('date') ? { date: 'Confirm the purchase date' } : {}),
    ...(uncertain.includes('total') ? { total: 'Confirm the final amount paid' } : {}),
  };
}

function readingFrom(parts: {
  merchant: string | null;
  date: string | null;
  total: number | null;
  currency: string;
  uncertain: string[];
  message: string;
  status?: ReceiptReading['status'];
}): ReceiptReading {
  const uncertainFields = [...new Set(parts.uncertain)];
  const status = parts.status || (uncertainFields.length ? 'needs_details' : 'ready');
  return {
    merchant: parts.merchant,
    date: parts.date,
    total: parts.total,
    currency: parts.currency,
    uncertainFields,
    fieldHints: hintsFor(uncertainFields),
    message: parts.message,
    status,
  };
}

/**
 * Read merchant, date, and final amount from one provider document.
 * Tip, savings, cash tendered, change, and disagreeing totals do not become the amount.
 */
export function resolveVeryfiDocument(doc: VeryfiDocumentShape): ReceiptReading {
  const text = doc.ocr_text || '';
  const uncertain: string[] = [];
  const proposedDate = providerDate(doc.date);
  const dated = text ? resolveUsDate(text, proposedDate) : { date: null, uncertain: true };
  const date = dated.uncertain ? null : dated.date;
  if (!date) uncertain.push('date');

  const evidenced = text ? parseTotalFromText(text) : { total: null, currency: 'USD' };
  let total: number | null = null;
  if (evidenced.total != null) total = evidenced.total;
  if (total == null) uncertain.push('total');

  const vendor = (doc.vendor?.raw_name || doc.vendor?.name || '').replace(/\s+/g, ' ').trim();
  const merchant = vendor && text && merchantSupported(vendor, text) ? vendor : null;
  if (!merchant) uncertain.push('merchant');

  const currency =
    doc.currency_code && /^[A-Za-z]{3}$/.test(doc.currency_code) ? doc.currency_code.toUpperCase() : 'USD';
  const message = uncertain.length
    ? 'Some fields need a quick check before saving.'
    : 'Review the details before saving.';
  return readingFrom({ merchant, date, total, currency, uncertain, message });
}

type LocalReading = {
  merchant: string | null;
  date: string | null;
  total: number | null;
  currency: string | null;
  uncertainFields: string[];
  status: string;
  message: string;
  provider?: string;
  version?: string;
};

function localKept(local: LocalReading, field: 'merchant' | 'date' | 'total'): boolean {
  if (local.uncertainFields.includes(field)) return false;
  if (field === 'merchant') return Boolean(local.merchant?.trim());
  if (field === 'date') return Boolean(local.date);
  return local.total != null && Number.isFinite(local.total);
}

/** Keep a reliable on-device field. Fill only what that reading left open. */
export function mergeReceiptReading(input: {
  local: LocalReading;
  remote: ReceiptReading | null;
  remoteError?: string;
}): ReceiptReading & { provider: string; version: string } {
  const local = input.local;
  const remote = input.remote;
  const uncertain: string[] = [];

  const merchant = localKept(local, 'merchant')
    ? local.merchant
    : remote && !remote.uncertainFields.includes('merchant')
      ? remote.merchant
      : null;
  if (!merchant) uncertain.push('merchant');

  const date = localKept(local, 'date')
    ? local.date
    : remote && !remote.uncertainFields.includes('date')
      ? remote.date
      : null;
  if (!date) uncertain.push('date');

  const total = localKept(local, 'total')
    ? local.total
    : remote && !remote.uncertainFields.includes('total')
      ? remote.total
      : null;
  if (total == null) uncertain.push('total');

  let message = uncertain.length
    ? 'Some fields need a quick check before saving.'
    : 'Review the details before saving.';
  if (input.remoteError) {
    message = merchant || date || total != null
      ? `${input.remoteError} On-device details are still shown for review.`
      : input.remoteError;
  } else if (!remote && local.message) {
    message = local.message;
  }

  const failed = !remote && local.status === 'failed' && !merchant && !date && total == null;
  return {
    ...readingFrom({
      merchant,
      date,
      total,
      currency: local.currency || remote?.currency || 'USD',
      uncertain,
      message,
      status: failed ? 'failed' : undefined,
    }),
    provider: remote ? 'veryfi' : local.provider || 'tesseract.js',
    version: remote ? 'veryfi-evidence-2026.11.05' : local.version || 'browser-tesseract',
  };
}
