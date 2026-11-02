/**
 * Receipt OCR / extraction adapter.
 *
 * Production path: POST the image to a configured server endpoint that holds
 * provider credentials. Never put OCR API keys in the Vite client.
 *
 * If VITE_OCR_ENDPOINT is unset, extraction returns an honest blocker result
 * so the UI can still collect a manual editable draft from the same Snap flow.
 */

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
}

const VERSION = 'ocr-adapter-2026.11.02';

export function isOcrConfigured(): boolean {
  return Boolean((import.meta.env.VITE_OCR_ENDPOINT as string | undefined)?.trim());
}

export async function extractReceipt(file: File): Promise<OcrExtraction> {
  const endpoint = (import.meta.env.VITE_OCR_ENDPOINT as string | undefined)?.trim();

  if (!endpoint) {
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
      message:
        'Receipt OCR is not configured (missing VITE_OCR_ENDPOINT). Enter details from the photo — extraction will run automatically once a server endpoint is set.',
      version: VERSION,
    };
  }

  const body = new FormData();
  body.append('file', file);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      body,
      headers: {
        // Optional bearer for the app’s own edge function — not a third-party key in the client.
        ...(import.meta.env.VITE_OCR_AUTH_TOKEN
          ? { Authorization: `Bearer ${import.meta.env.VITE_OCR_AUTH_TOKEN}` }
          : {}),
      },
    });
    if (!res.ok) {
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
        status: 'failed',
        message: `Reading the receipt failed (${res.status}). You can still enter the details manually.`,
        version: VERSION,
      };
    }
    const data = (await res.json()) as Partial<OcrExtraction>;
    const uncertain: string[] = [...(data.uncertainFields || [])];
    if (!data.merchant) uncertain.push('merchant');
    if (!data.date) uncertain.push('date');
    if (data.total == null || !Number.isFinite(data.total)) uncertain.push('total');
    const unique = [...new Set(uncertain)];
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
      status: unique.length ? 'needs_details' : 'ready',
      message: unique.length
        ? 'Some fields need a quick check before saving.'
        : 'Ready to review.',
      version: data.version || VERSION,
    };
  } catch {
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
      status: 'failed',
      message: 'Could not reach the extraction service. Enter details manually and retry later.',
      version: VERSION,
    };
  }
}
