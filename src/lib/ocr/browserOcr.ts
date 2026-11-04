/**
 * Free, in-browser receipt OCR via Tesseract.js (WASM).
 * No API keys, no Supabase, no paid services.
 * Accuracy varies — fields remain editable after extraction.
 */
import type { OcrExtraction } from './adapter';
import { US_MERCHANTS } from './usMerchants';
import { prepareReceiptPhoto } from './photoPrep';

const VERSION = 'browser-tesseract-2026.11.03d';

const CUSTOMER_REVIEW_MSG = 'Review the details before saving.';

function base(
  partial: Partial<OcrExtraction> & Pick<OcrExtraction, 'status' | 'message'>,
): OcrExtraction {
  return {
    merchant: null,
    date: null,
    total: null,
    currency: 'USD',
    subtotal: null,
    tax: null,
    tip: null,
    confidence: 0,
    uncertainFields: ['merchant', 'date', 'total'],
    version: VERSION,
    provider: 'tesseract.js',
    ...partial,
  };
}

const MONTHS: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

/** Prefer dates next to a transaction time or explicit purchase-date label. */
export function parseDateFromText(text: string): string | null {
  const candidates = new Map<string, number>();
  for (const line of text.split(/\r?\n/)) {
    if (/\b(expir(?:es|ation|y)|valid (?:until|through|thru)|return by|offer ends|copyright)\b/i.test(line)) continue;
    const rank = /\b\d{1,2}:\d{2}\b|\b(?:transaction|purchase|sale) date\b/i.test(line) ? 2 : 1;
    for (const m of line.matchAll(/\b(?:(\d{4})\s*([-/.])\s*(\d{1,2})\s*\2\s*(\d{1,2})|(\d{1,2})\s*([-/.])\s*(\d{1,2})\s*\6\s*(\d{4}|\d{2})|([a-z]{3,9})\s+(\d{1,2}),?\s+(\d{4}))\b/gi)) {
      const yearText = m[1] || m[8] || m[11];
      const year = Number(yearText) + (yearText.length === 2 ? (Number(yearText) >= 70 ? 1900 : 2000) : 0);
      const month = Number(m[3] || m[5] || MONTHS[m[9]?.toLowerCase()]);
      const day = Number(m[4] || m[7] || m[10]);
      if (year < 1900 || year > 2099) continue;
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) continue;
      const key = date.toISOString().slice(0, 10);
      candidates.set(key, Math.max(rank, candidates.get(key) ?? 0));
    }
  }
  const ranked = [...candidates].sort((a, b) => b[1] - a[1]);
  return ranked[0] && ranked[0][1] !== ranked[1]?.[1] ? ranked[0][0] : null;
}

/** Prefer TOTAL / amount-due style lines; fall back to largest money-like number. */
export function parseTotalFromText(text: string): { total: number | null; currency: string } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const moneyRe = /(?:USD\s*)?\$?\s*(\d{1,6}(?:[.,]\d{2}))\b/gi;
  const labeled =
    /(?:total|amount\s*due|balance|grand\s*total|visa|mastercard|paid)\D{0,24}(?:USD\s*)?\$?\s*(\d{1,6}(?:[.,]\d{2}))/i;

  for (const line of lines) {
    const m = line.match(labeled);
    if (m) {
      const n = Number(m[1].replace(',', '.'));
      if (Number.isFinite(n) && n > 0) return { total: n, currency: 'USD' };
    }
  }

  let best: number | null = null;
  for (const line of lines) {
    moneyRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = moneyRe.exec(line))) {
      const n = Number(m[1].replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) continue;
      if (best == null || n >= best) best = n;
    }
  }
  return { total: best, currency: 'USD' };
}

function normalizeMerchantLine(raw: string): string {
  return raw.replace(/[^\w\s&'.\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Reject logo OCR garbage like "U a CM ." — short letter scraps, sparse tokens,
 * or mostly punctuation. Prefer leaving merchant blank over a bad autofill.
 */
export function isGarbledMerchant(line: string): boolean {
  const t = line.trim();
  if (t.length < 3) return true;

  const letters = (t.match(/[A-Za-z]/g) || []).length;
  if (letters < 3) return true;
  if (letters / Math.max(t.length, 1) < 0.5) return true;

  const tokens = t.split(/\s+/).filter(Boolean);
  const letterLen = (tok: string) => (tok.match(/[A-Za-z]/g) || []).length;
  const tiny = tokens.filter((tok) => letterLen(tok) <= 1).length;
  if (tokens.length >= 2 && tiny >= Math.ceil(tokens.length * 0.5)) return true;

  // "U a CM ." / "A C M E" style spaced logo scraps
  if (/^([A-Za-z]\s+){2,}[A-Za-z]?\.?$/.test(t)) return true;

  const compact = t.replace(/[\s.]+/g, '');
  if (compact.length <= 4 && !/^[A-Z]{2,4}$/.test(compact)) return true;

  return false;
}

/**
 * Marketing / tagline lines are not merchants (e.g. "OUR Favorite Local Super marke").
 * Generic — no brand-specific rules.
 */
export function isSloganLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^(our|your|welcome(\s+to)?|the\s+best|happily|proudly|simply|always)\b/i.test(t)) {
    return true;
  }
  if (
    /\b(favorite|favourite|local\s+super|everyday\s+low|quality\s+you|best\s+deals|fresh\s+daily|shop\s+local|super\s*marke)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  // Slogan-shaped: possessive/marketing opener + 3+ words
  if (
    /\b(our|your|favorite|favourite|local|best|fresh|quality|everyday)\b/i.test(t) &&
    /\b(market|marke|store|shop|place|choice|deals|savings|prices|produce|grocer)/i.test(t) &&
    t.split(/\s+/).length >= 3
  ) {
    return true;
  }
  return false;
}

/** Footer “Thank you for shopping …” often carries the real store name. */
export function merchantFromThankYou(text: string): string | null {
  const patterns = [
    /thank(?:s|\s*you)\s+for\s+shopping\s+(?:at\s+)?([^\n.!?]{3,60})/i,
    /thank(?:s|\s*you)\s+for\s+visiting\s+(?:at\s+)?([^\n.!?]{3,60})/i,
    /thanks\s+for\s+choosing\s+([^\n.!?]{3,60})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    let cand = normalizeMerchantLine(m[1]);
    // Drop trailing "today" / "with us"
    cand = cand.replace(/\b(today|with\s+us|again)\b/gi, '').replace(/\s+/g, ' ').trim();
    if (!cand || isGarbledMerchant(cand) || isSloganLine(cand)) continue;
    if (!cleanMerchant(cand)) continue;
    return cand.slice(0, 100);
  }
  return null;
}

const BODY_LINE = /^(?:groc(?:ery)?|non\s*edible|produce|deli|meat|seafood|dairy|frozen|department|dept|cashier|you saved|savings|store savings|payment|tender|visa|mastercard|amex|debit|credit|cash|balance|subtotal|total|tax|change|amount|paid|qty|item|description|receipt|invoice|date|time|phone|tel|fax|thank|thanks|welcome|store\s*#?\s*\d)\b/i;

function merchantKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cleanMerchant(raw: string): string | null {
  const name = normalizeMerchantLine(raw);
  if (!name || BODY_LINE.test(name) || isGarbledMerchant(name) || isSloganLine(name)) return null;
  if (/^\d+\s|\d{3,}|\d+[.,]\d{2}|\b(?:cashier|register|terminal)\b/i.test(raw)) return null;
  return name.slice(0, 100);
}

function canonicalMerchant(name: string): string {
  const key = merchantKey(name);
  return US_MERCHANTS.find((entry) =>
    [entry.name, ...entry.aliases].some((alias) => merchantKey(alias) === key),
  )?.name ?? name;
}

/** Only official directory domains qualify as standalone website evidence. */
export function merchantFromWebsite(text: string): string | null {
  const hosts = [...text.matchAll(/(?:^|[^\w@.-])((?:[a-z0-9-]+\.)+[a-z]{2,})(?=$|[^\w.-])/gi)]
    .map((match) => match[1].toLowerCase());
  const matches = US_MERCHANTS.filter((entry) => entry.domains.some((domain) =>
    hosts.some((host) => host === domain || host.endsWith('.' + domain)),
  ));
  return matches.length === 1 ? matches[0].name : null;
}

type ReceiptLine = { text: string; bbox: { y0: number; y1: number }; confidence: number };

export function parseMerchantFromText(
  text: string,
  positionedLines: ReceiptLine[] = [],
  imageHeight?: number,
): string | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  // Stop at transaction metadata or the first item/price row. Only explicit
  // merchant evidence is considered below that boundary.
  const header = lines.slice(0, 6);
  const boundary = header.findIndex((line) =>
    BODY_LINE.test(line) && !/^(?:receipt|invoice|welcome)\b/i.test(line) ||
    /\b\d+[.,]\d{2}\b/.test(line) || parseDateFromText(line) !== null,
  );
  const headerLines = boundary < 0 ? header : header.slice(0, boundary);
  const printed = headerLines.flatMap((raw, index) => {
    const labeled = raw.match(/^(?:merchant|store|sold\s+by|vendor|business|payee)\s*[:#-]\s*(.+)$/i);
    const name = cleanMerchant(labeled?.[1] ?? raw);
    if (!name || /(?:https?:\/\/|www\.|\.(?:com|net|org)\b)/i.test(raw)) return [];
    const canonical = canonicalMerchant(name);
    const known = US_MERCHANTS.some((entry) => entry.name === canonical);
    const position = positionedLines.find((line) => merchantKey(line.text) === merchantKey(raw));
    const prominent = position && imageHeight && position.bbox.y0 < imageHeight * 0.3 &&
      position.bbox.y1 - position.bbox.y0 >= imageHeight * 0.018 && position.confidence >= 55;
    const businessName = /\b(?:co|inc|llc|market|shop|cafe|coffee|hardware|restaurant|bakery|pharmacy|foods|mart)\b/i.test(name);
    return labeled || known || prominent || businessName
      ? [{ name: canonical, score: (known ? 8 : 0) + (labeled ? 7 : 0) +
        (prominent ? 5 : 0) + (businessName ? 3 : 0) + (6 - index) / 10 }]
      : [];
  }).sort((a, b) => b.score - a.score);

  const footer = merchantFromThankYou(text);
  const domain = merchantFromWebsite(text);
  const explicit = footer ? canonicalMerchant(footer) : domain;
  if (footer && domain && merchantKey(canonicalMerchant(footer)) !== merchantKey(domain)) return null;
  const headerName = printed[0]?.name;
  if (explicit && headerName && merchantKey(explicit) !== merchantKey(headerName)) {
    // An official domain can corroborate an unfamiliar header spelling, but
    // conflicting names are safer to leave for review.
    return null;
  }
  return explicit ?? headerName ?? null;
}

export function formatOcrAmount(total: number): string {
  return total.toFixed(2);
}

export function parseReceiptText(text: string, confidencePct: number,
  lines?: ReceiptLine[],
  imageHeight?: number,
): OcrExtraction {
  const merchant = parseMerchantFromText(text, lines, imageHeight);
  const date = parseDateFromText(text);
  const { total, currency } = parseTotalFromText(text);
  const uncertain: string[] = [];
  if (!merchant) uncertain.push('merchant');
  if (!date) uncertain.push('date');
  if (total == null) uncertain.push('total');
  // Low overall OCR confidence: keep filled values but flag for review
  if (confidencePct < 55) {
    if (merchant) uncertain.push('merchant');
    if (date) uncertain.push('date');
    if (total != null) uncertain.push('total');
  }
  const unique = [...new Set(uncertain)];
  const preview = text.replace(/\s+/g, ' ').trim().slice(0, 280);

  if (!merchant && !date && total == null) {
    return base({
      status: 'needs_details',
      message: CUSTOMER_REVIEW_MSG,
      confidence: confidencePct / 100,
      rawTextPreview: preview || undefined,
      uncertainFields: ['merchant', 'date', 'total'],
    });
  }

  return base({
    merchant,
    date,
    total,
    currency,
    confidence: confidencePct / 100,
    rawTextPreview: preview || undefined,
    uncertainFields: unique,
    status: unique.length ? 'needs_details' : 'ready',
    message: CUSTOMER_REVIEW_MSG,
  });
}

export type BrowserOcrBundle = {
  extraction: OcrExtraction;
  /** File to attach to the expense (prepared JPEG when possible). */
  attachFile: File | null;
  previewUrl: string | null;
};

/**
 * Prepare photo then run Tesseract.js. Never invents field values.
 * On failure, still returns attachFile/preview when available so the draft keeps the receipt.
 */
export async function extractWithBrowserOcr(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<BrowserOcrBundle> {
  const prepared = await prepareReceiptPhoto(file, onProgress);

  if (!prepared.ok) {
    return {
      extraction: base({
        status: 'needs_details',
        message: CUSTOMER_REVIEW_MSG,
        uncertainFields: ['merchant', 'date', 'total'],
      }),
      attachFile: prepared.attachFile,
      previewUrl: prepared.previewUrl,
    };
  }

  onProgress?.('Photo attached');
  onProgress?.('Reading receipt…');

  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text' && typeof m.progress === 'number') {
          onProgress?.(`Reading receipt… ${Math.round(m.progress * 100)}%`);
        } else if (m.status === 'loading language traineddata') {
          onProgress?.('Reading receipt… loading language data');
        }
      },
    });
    let extraction: OcrExtraction;
    try {
      const { data } = await worker.recognize(prepared.ocrFile);
      extraction = parseReceiptText(data.text || '', data.confidence || 0, data.lines, prepared.height);
      if (!extraction.merchant && prepared.width && prepared.height) {
        try {
          const { data: header } = await worker.recognize(prepared.ocrFile, {
            rectangle: { left: 0, top: 0, width: prepared.width, height: Math.floor(prepared.height * 0.25) },
          });
          const recovered = parseMerchantFromText(
            header.text + '\n' + data.text, header.lines, prepared.height,
          );
          if (recovered && header.confidence >= 55) {
            extraction.merchant = recovered;
            extraction.uncertainFields = extraction.uncertainFields.filter((field) => field !== 'merchant');
            extraction.status = extraction.uncertainFields.length ? 'needs_details' : 'ready';
          }
        } catch {
          // A focused pass may fail independently. Keep the original fields.
        }
      }
      if (!extraction.date) {
        try {
          const top = Math.floor(prepared.height * 0.65);
          const { data: footer } = await worker.recognize(prepared.ocrFile, {
            rectangle: { left: 0, top, width: prepared.width, height: prepared.height - top },
          });
          // Re-evaluate both passes together so conflicting dates remain unresolved.
          const date = parseDateFromText(data.text + '\n' + footer.text);
          if (date && footer.confidence >= 55) {
            extraction.date = date;
            extraction.uncertainFields = extraction.uncertainFields.filter((field) => field !== 'date');
            extraction.status = extraction.uncertainFields.length ? 'needs_details' : 'ready';
          }
        } catch {
          // Keep fields recovered by the full scan.
        }
      }
    } finally {
      await worker.terminate();
    }
    return {
      extraction,
      attachFile: prepared.attachFile,
      previewUrl: prepared.previewUrl,
    };
  } catch {
    return {
      extraction: base({
        status: 'failed',
        message: CUSTOMER_REVIEW_MSG,
      }),
      attachFile: prepared.attachFile,
      previewUrl: prepared.previewUrl,
    };
  }
}
