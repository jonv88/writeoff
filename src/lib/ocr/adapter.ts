/**
 * Receipt OCR adapter.
 *
 * - Local / unconfigured preview: free in-browser Tesseract.js (no API keys).
 * - Cloud: authenticated `extract-receipt` Edge Function (Mindee server-side).
 *
 * Never put MINDEE_API_KEY, service_role, or other OCR secrets in VITE_* vars.
 */

import { getSupabase } from '../supabase';
import { config, isSupabaseConfigured } from '../config';
import { extractWithBrowserOcr, type BrowserOcrBundle } from './browserOcr';

export interface OcrFieldHints {
  merchant?: string;
  date?: string;
  total?: string;
}

export interface OcrExtraction {
  merchant: string | null;
  date: string | null;
  total: number | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  confidence: number;
  rawTextPreview?: string;
  uncertainFields: string[];
  /** Specific review prompts for blank/uncertain fields (e.g. confirm final amount paid). */
  fieldHints?: OcrFieldHints;
  status: 'ready' | 'needs_details' | 'failed' | 'blocked';
  message: string;
  version: string;
  storagePath?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  provider?: string;
}

export type ReceiptExtractBundle = {
  extraction: OcrExtraction;
  /** Prepared/attachable file for the expense (may differ from the raw pick). */
  attachFile: File | null;
  previewUrl: string | null;
};

const VERSION = 'ocr-client-2026.11.02';

function blocked(message: string): OcrExtraction {
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
    status: 'blocked',
    message,
    version: VERSION,
  };
}

/** True when cloud Edge Function OCR is available (Supabase configured). */
export function isCloudOcrConfigured(): boolean {
  return isSupabaseConfigured();
}

/** @deprecated Prefer isCloudOcrConfigured — browser OCR works without Supabase. */
export function isOcrConfigured(): boolean {
  return isCloudOcrConfigured();
}

/** Browser OCR (Tesseract.js) is always available in this build — no secrets. */
export function isBrowserOcrAvailable(): boolean {
  return true;
}

export async function extractReceipt(
  file: File,
  options?: { expenseId?: string; onProgress?: (msg: string) => void; preferBrowser?: boolean },
): Promise<ReceiptExtractBundle> {
  // Local preview / no Supabase: free on-device OCR only.
  if (options?.preferBrowser || !isSupabaseConfigured()) {
    return toBundle(await extractWithBrowserOcr(file, options?.onProgress));
  }

  const sb = getSupabase();
  if (!sb) {
    return toBundle(await extractWithBrowserOcr(file, options?.onProgress));
  }

  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session?.access_token) {
    options?.onProgress?.('Using on-device OCR (sign in for cloud extraction)…');
    return toBundle(await extractWithBrowserOcr(file, options?.onProgress));
  }

  const body = new FormData();
  body.append('file', file);
  if (options?.expenseId) body.append('expense_id', options.expenseId);

  const url = `${config.supabaseUrl}/functions/v1/extract-receipt`;
  options?.onProgress?.('Uploading & reading receipt…');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: config.supabaseAnonKey,
      },
      body,
    });

    const payload = (await res.json().catch(() => ({}))) as Partial<OcrExtraction> & {
      error?: string;
    };

    if (!res.ok) {
      return {
        extraction: {
          ...blocked(
            payload.error ||
              payload.message ||
              `Reading the receipt failed (${res.status}). You can still enter details manually.`,
          ),
          status: res.status === 401 || res.status === 403 ? 'blocked' : 'failed',
          version: payload.version || VERSION,
        },
        attachFile: file,
        previewUrl: URL.createObjectURL(file),
      };
    }

    return {
      extraction: normalize(payload),
      attachFile: file,
      previewUrl: URL.createObjectURL(file),
    };
  } catch {
    return {
      extraction: {
        ...blocked('Could not reach the extraction service. Enter details manually and retry later.'),
        status: 'failed',
      },
      attachFile: file,
      previewUrl: URL.createObjectURL(file),
    };
  }
}

function toBundle(bundle: BrowserOcrBundle): ReceiptExtractBundle {
  return {
    extraction: bundle.extraction,
    attachFile: bundle.attachFile,
    previewUrl: bundle.previewUrl,
  };
}

function normalize(data: Partial<OcrExtraction>): OcrExtraction {
  const uncertain = [...(data.uncertainFields || [])];
  if (!data.merchant) uncertain.push('merchant');
  if (!data.date) uncertain.push('date');
  if (data.total == null || !Number.isFinite(Number(data.total))) uncertain.push('total');
  const unique = [...new Set(uncertain)];
  const status = (data.status || (unique.length ? 'needs_details' : 'ready')) as OcrExtraction['status'];
  const fieldHints = data.fieldHints || {
    ...(unique.includes('merchant') ? { merchant: 'Confirm the merchant name' } : {}),
    ...(unique.includes('date') ? { date: 'Confirm the purchase date' } : {}),
    ...(unique.includes('total') ? { total: 'Confirm the final amount paid' } : {}),
  };
  return {
    merchant: data.merchant ?? null,
    date: data.date ?? null,
    total: data.total ?? null,
    currency: data.currency ?? 'USD',
    subtotal: data.subtotal ?? null,
    tax: data.tax ?? null,
    tip: data.tip ?? null,
    confidence: data.confidence ?? 0,
    rawTextPreview: data.rawTextPreview,
    uncertainFields: unique,
    fieldHints: Object.keys(fieldHints).length ? fieldHints : undefined,
    status,
    message:
      data.message ||
      (unique.length
        ? 'Some fields need a quick check before saving.'
        : 'Ready to review.'),
    version: data.version || VERSION,
    storagePath: data.storagePath,
    fileName: data.fileName,
    mimeType: data.mimeType,
    sizeBytes: data.sizeBytes,
    provider: data.provider,
  };
}
