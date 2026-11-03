/**
 * Free, in-browser receipt OCR via Tesseract.js (WASM).
 * No API keys, no Supabase, no paid services.
 * Accuracy varies — fields remain editable after extraction.
 */
import type { OcrExtraction } from './adapter';
import { prepareReceiptPhoto } from './photoPrep';

const VERSION = 'browser-tesseract-2026.11.03';

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
  // Compact US: 10/21/26
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
        'Browser OCR could not read usable fields from this image. Enter merchant, date, and amount manually — fields stay editable. Receipt stays attached.',
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
      ? 'Details filled in where possible — please check highlighted fields. Accuracy varies by photo quality.'
      : 'Details filled in. Please confirm the fields before saving.',
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
        message: prepared.message,
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
    const extraction = parseReceiptText(text || '', Number(confidence) || 0);
    if (prepared.note && extraction.status === 'ready') {
      extraction.message = `Details filled in. ${prepared.note} Please confirm before saving.`;
    } else if (prepared.note && !extraction.message.includes('Photo')) {
      extraction.message = `${extraction.message} (${prepared.note})`;
    }
    return {
      extraction,
      attachFile: prepared.attachFile,
      previewUrl: prepared.previewUrl,
    };
  } catch (e) {
    return {
      extraction: base({
        status: 'failed',
        message: `Browser OCR failed (${e instanceof Error ? e.message : 'unknown error'}). Receipt stays attached — enter details manually.`,
      }),
      attachFile: prepared.attachFile,
      previewUrl: prepared.previewUrl,
    };
  }
}
