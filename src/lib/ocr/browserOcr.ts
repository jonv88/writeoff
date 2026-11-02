/**
 * Free, in-browser receipt OCR via Tesseract.js (WASM).
 * No API keys, no Supabase, no paid services.
 * Accuracy varies — fields remain editable after extraction.
 */
import type { OcrExtraction } from './adapter';

const VERSION = 'browser-tesseract-2026.11.02';

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

/** Pull likely dates (ISO or US) from OCR text. */
export function parseDateFromText(text: string): string | null {
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
  return null;
}

/** Prefer TOTAL / amount-due style lines; fall back to largest money-like number. */
export function parseTotalFromText(text: string): { total: number | null; currency: string } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const moneyRe = /(?:USD\s*)?\$?\s*(\d{1,6}(?:[.,]\d{2}))\b/gi;
  const labeled =
    /(?:total|amount\s*due|balance|grand\s*total|visa|mastercard|paid)\D{0,20}(?:USD\s*)?\$?\s*(\d{1,6}(?:[.,]\d{2}))/i;

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

/** Heuristic merchant: first substantial non-noise line. */
export function parseMerchantFromText(text: string): string | null {
  const noise =
    /^(tel|phone|www\.|http|receipt|invoice|thank|visa|mastercard|amex|cash|change|subtotal|tax|total|date|time|\d+$)/i;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[^\w\s&'.\-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (line.length < 3 || line.length > 60) continue;
    if (noise.test(line)) continue;
    if (/^\d/.test(line)) continue;
    return line.slice(0, 100);
  }
  return null;
}

export function parseReceiptText(text: string, confidencePct: number): OcrExtraction {
  const merchant = parseMerchantFromText(text);
  const date = parseDateFromText(text);
  const { total, currency } = parseTotalFromText(text);
  const uncertain: string[] = [];
  if (!merchant) uncertain.push('merchant');
  if (!date) uncertain.push('date');
  if (total == null) uncertain.push('total');
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
      message:
        'Browser OCR could not read usable fields from this image. Enter merchant, date, and amount manually — fields stay editable.',
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
    message: unique.length
      ? 'Browser OCR filled what it could — please check highlighted fields. Accuracy varies by photo quality.'
      : 'Browser OCR finished. Please confirm the fields before saving.',
  });
}

function isHeic(file: File): boolean {
  return (
    /image\/hei[cf]/i.test(file.type) ||
    /\.hei[cf]$/i.test(file.name)
  );
}

/**
 * Run Tesseract.js in the browser. Returns honest needs_details/failed states — never invents values.
 */
export async function extractWithBrowserOcr(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<OcrExtraction> {
  if (isHeic(file)) {
    return base({
      status: 'needs_details',
      message:
        'HEIC/HEIF photos are not converted in this free browser preview. Use a JPEG/PNG (or iPhone “Most Compatible”), or enter details manually.',
      uncertainFields: ['merchant', 'date', 'total'],
    });
  }

  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    return base({
      status: 'needs_details',
      message:
        'PDF OCR is limited in this free browser preview. Prefer a photo (JPEG/PNG), or enter details manually.',
      uncertainFields: ['merchant', 'date', 'total'],
    });
  }

  if (!file.type.startsWith('image/')) {
    return base({
      status: 'needs_details',
      message: 'Choose a receipt photo (JPEG/PNG/WebP) for browser OCR, or enter details manually.',
    });
  }

  onProgress?.('Loading on-device OCR…');
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text' && typeof m.progress === 'number') {
          onProgress?.(`Reading receipt… ${Math.round(m.progress * 100)}%`);
        }
      },
    });
    onProgress?.('Reading receipt…');
    const {
      data: { text, confidence },
    } = await worker.recognize(file);
    await worker.terminate();
    return parseReceiptText(text || '', Number(confidence) || 0);
  } catch (e) {
    return base({
      status: 'failed',
      message: `Browser OCR failed (${e instanceof Error ? e.message : 'unknown error'}). Enter details manually.`,
    });
  }
}
