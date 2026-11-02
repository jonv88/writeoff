/**
 * Browser OCR client — calls the authenticated `extract-receipt` Edge Function.
 *
 * Public only: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (or publishable key).
 * Never put MINDEE_API_KEY, service_role, or other OCR secrets in VITE_* vars.
 */

import { getSupabase } from '../supabase';
import { config, isSupabaseConfigured } from '../config';

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
  status: 'ready' | 'needs_details' | 'failed' | 'blocked';
  message: string;
  version: string;
  storagePath?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  provider?: string;
}

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

/** True when the public Supabase app is configured (function URL is derived). */
export function isOcrConfigured(): boolean {
  return isSupabaseConfigured();
}

export async function extractReceipt(
  file: File,
  options?: { expenseId?: string },
): Promise<OcrExtraction> {
  if (!isSupabaseConfigured()) {
    return blocked(
      'Cloud backend is not configured. Enter details from the photo — OCR runs through the extract-receipt Edge Function once Supabase is connected.',
    );
  }

  const sb = getSupabase();
  if (!sb) return blocked('Supabase client unavailable.');

  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session?.access_token) {
    return blocked(
      'Sign in to run receipt extraction. Local preview supports manual entry only (OCR requires an authenticated session).',
    );
  }

  const body = new FormData();
  body.append('file', file);
  if (options?.expenseId) body.append('expense_id', options.expenseId);

  const url = `${config.supabaseUrl}/functions/v1/extract-receipt`;

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
        ...blocked(
          payload.error ||
            payload.message ||
            `Reading the receipt failed (${res.status}). You can still enter details manually.`,
        ),
        status: res.status === 401 || res.status === 403 ? 'blocked' : 'failed',
        version: payload.version || VERSION,
      };
    }

    return normalize(payload);
  } catch {
    return {
      ...blocked('Could not reach the extraction service. Enter details manually and retry later.'),
      status: 'failed',
    };
  }
}

function normalize(data: Partial<OcrExtraction>): OcrExtraction {
  const uncertain = [...(data.uncertainFields || [])];
  if (!data.merchant) uncertain.push('merchant');
  if (!data.date) uncertain.push('date');
  if (data.total == null || !Number.isFinite(Number(data.total))) uncertain.push('total');
  const unique = [...new Set(uncertain)];
  const status = (data.status || (unique.length ? 'needs_details' : 'ready')) as OcrExtraction['status'];
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
