/**
 * Free, in-browser receipt OCR via Tesseract.js (WASM).
 * No API keys, no Supabase, no paid services.
 * Accuracy varies — fields remain editable after extraction.
 */
import type { OcrExtraction } from './adapter';
import { prepareReceiptPhoto } from './photoPrep';

const VERSION = 'browser-tesseract-2026.11.03c';

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

/** Pull likely dates (ISO, US numeric, or Month D, YYYY). */
export function parseDateFromText(text: string): string | null {
  const named = text.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2})\b/i,
  );
  if (named) {
    const mon = MONTHS[named[1].toLowerCase()];
    if (mon) {
      return `${named[3]}-${mon}-${named[2].padStart(2, '0')}`;
    }
  }

  const iso = text.match(/\b(20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const us = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\b/);
  if (us) {
    const [, m, d, y] = us;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const usShort = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})\b/);
  if (usShort) {
    const [, m, d, yy] = usShort;
    const y = Number(yy) >= 70 ? `19${yy}` : `20${yy}`;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
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
    if (scoreMerchantCandidate(cand, 99) < 0) continue;
    return cand.slice(0, 100);
  }
  return null;
}

/** Derive a readable merchant from a website/domain on the receipt (no brand hardcodes). */
export function merchantFromWebsite(text: string): string | null {
  const re =
    /(?:https?:\/\/)?(?:www\.)?([a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?)\.(com|net|org|co|io|shop|store|biz|market)\b/gi;
  const skip = new Set([
    'mail',
    'email',
    'support',
    'help',
    'forms',
    'docs',
    'google',
    'apple',
    'microsoft',
    'facebook',
    'instagram',
    'twitter',
  ]);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const host = match[1].toLowerCase();
    if (skip.has(host)) continue;
    const parts = host.split(/[-_]+/).filter((p) => p.length > 1);
    if (!parts.length) continue;
    const name = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    if (name.length >= 3 && !isGarbledMerchant(name) && !isSloganLine(name)) {
      return name.slice(0, 100);
    }
  }
  return null;
}

const STORE_ENTITY =
  /\b(co|inc|llc|ltd|corp|store|market|shop|cafe|coffee|hardware|restaurant|grill|kitchen|bakery|pharmacy|studio|grocer(?:y|ies)?|foods|mart)\b/i;

function scoreMerchantCandidate(line: string, index: number): number {
  if (isGarbledMerchant(line)) return -1;
  if (isSloganLine(line)) return -1;
  // Line-item / price rows (e.g. "Widget kit 22.00") are not merchants
  if (/\d+[.,]\d{2}\b/.test(line)) return -1;
  if (/^(subtotal|tax|total|amount|balance|change|cash|card|visa|paid|qty|item)\b/i.test(line)) {
    return -1;
  }

  let score = 0;
  const tokens = line.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) score += 3;
  else if (line.length >= 5) score += 1;

  if (STORE_ENTITY.test(line)) {
    score += 4;
  }

  // Address / phone noise
  if (
    /\b(st|street|ave|avenue|rd|road|blvd|blvd\.|suite|ste|apt|floor|fl|way|ln|lane|dr|drive|ct|court|pkwy|parkway)\b/i.test(
      line,
    )
  ) {
    score -= 6;
  }
  if (/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(line)) score -= 8;
  if (/\d{5}(?:-\d{4})?\b/.test(line)) score -= 4;
  if (/^\d+\s/.test(line)) score -= 5; // "400 Industrial Way"
  if (/\d{3,}/.test(line) && !/\b(co|inc)\b/i.test(line)) score -= 2;

  // Prefer header region slightly, but never enough to beat a clear later store line
  if (index <= 2) score += 1;
  else if (index <= 6) score += 0.5;

  return score;
}

/** Strong enough to autofill without footer/website corroboration. */
function isStrongStoreName(line: string): boolean {
  if (isSloganLine(line) || isGarbledMerchant(line)) return false;
  if (STORE_ENTITY.test(line) && line.split(/\s+/).length >= 2) return true;
  // ALL CAPS multi-word header (common on receipts), excluding slogan openers
  if (
    /^[A-Z0-9][A-Z0-9\s&'.-]{3,}$/.test(line) &&
    line.split(/\s+/).length >= 2 &&
    !/^(OUR|YOUR|THE)\b/.test(line)
  ) {
    return true;
  }
  return false;
}

/**
 * Merchant heuristic: skip garbled logos and slogans; prefer thank-you footer
 * or website/domain evidence, then strong printed store names. Returns null
 * when evidence is insufficient (blank + Needs review).
 */
export function parseMerchantFromText(text: string): string | null {
  const noise =
    /^(tel|phone|fax|www\.|http|https|receipt|invoice|thank|thanks|visa|mastercard|amex|cash|change|subtotal|tax|total|date|time|qty|item|description|\d+$)/i;

  const labeled = text.match(
    /(?:merchant|store|sold\s*by|vendor|business|payee)\s*[:#-]?\s*([^\n]{3,60})/i,
  );
  if (labeled) {
    const cand = normalizeMerchantLine(labeled[1]);
    if (
      cand &&
      !isGarbledMerchant(cand) &&
      !isSloganLine(cand) &&
      scoreMerchantCandidate(cand, 0) >= 0
    ) {
      return cand.slice(0, 100);
    }
  }

  // Corroborating evidence first (footer / domain) — beats slogans and weak headers
  const fromThanks = merchantFromThankYou(text);
  if (fromThanks) return fromThanks;

  const fromWeb = merchantFromWebsite(text);
  if (fromWeb) return fromWeb;

  const candidates: { line: string; score: number; idx: number }[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const line = normalizeMerchantLine(raw);
    if (line.length < 3 || line.length > 60) return;
    if (noise.test(line)) return;
    if (/^\d/.test(line)) return;
    if (/^\$?\d/.test(line)) return;
    if (isSloganLine(line)) return;
    const score = scoreMerchantCandidate(line, idx);
    if (score < 0) return;
    if (!isStrongStoreName(line) && score < 5) return;
    candidates.push({ line, score, idx });
  });

  candidates.sort((a, b) => b.score - a.score || a.idx - b.idx);

  if (candidates.length && (isStrongStoreName(candidates[0].line) || candidates[0].score >= 5)) {
    return candidates[0].line.slice(0, 100);
  }

  // Insufficient evidence — leave blank rather than slogan / logo garbage
  return null;
}

export function formatOcrAmount(total: number): string {
  return total.toFixed(2);
}

export function parseReceiptText(text: string, confidencePct: number): OcrExtraction {
  const merchant = parseMerchantFromText(text);
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
    const {
      data: { text, confidence },
    } = await worker.recognize(prepared.ocrFile);
    await worker.terminate();
    return {
      extraction: parseReceiptText(text || '', Number(confidence) || 0),
      attachFile: prepared.attachFile,
      previewUrl: prepared.previewUrl,
    };
  } catch (e) {
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
