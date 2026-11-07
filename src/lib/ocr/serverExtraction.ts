/**
 * Browser call to the preview receipt endpoint.
 * Credentials stay on the server. This module only calls the preview endpoint.
 */
import type { ReceiptReading } from './receiptEvidence.ts';
import { getSupabase } from '../supabase';

export type ServerExtraction =
  | {
      ok: true;
      /** True only when the live provider processed this photo. */
      processed: boolean;
      reused: boolean;
      reading: ReceiptReading & { provider: string; version: string; mode: string };
    }
  | { ok: false; processed: false; skipped?: boolean; message: string };

const MAX_UPLOAD_BYTES = 2_500_000;

/** Ask whether a photo would be sent. A disabled service returns before any upload. */
export async function cloudReadingEnabled(): Promise<boolean> {
  try {
    const response = await fetch('/api/extract-receipt', { method: 'GET' });
    if (!response.ok) return false;
    const body = (await response.json()) as { enabled?: boolean };
    return body.enabled === true;
  } catch {
    return false;
  }
}

export async function requestServerExtraction(file: File): Promise<ServerExtraction> {
  if (!(await cloudReadingEnabled())) {
    return { ok: false, processed: false, skipped: true, message: '' };
  }
  const session = await getSupabase()?.auth.getSession().then((result) => result.data.session).catch(() => null);
  if (!session?.access_token) {
    return { ok: false, processed: false, message: 'Sign in to read a missing detail.' };
  }
  if (file.size <= 0) return { ok: false, processed: false, message: 'That photo is empty.' };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, processed: false, message: 'This photo is too large to send. Enter the details you can see on it.' };
  }
  const idempotencyKey = crypto.randomUUID();
  let response: Response;
  try {
    response = await fetch('/api/extract-receipt', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'Idempotency-Key': idempotencyKey,
        'X-File-Name': file.name || 'receipt',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: file,
    });
  } catch {
    return {
      ok: false,
      processed: false,
      message: 'Could not reach receipt reading. Your photo is attached; enter the details before saving.',
    };
  }

  const payload = (await response.json().catch(() => null)) as
    | (ReceiptReading & { provider?: string; version?: string; mode?: string; duplicate?: boolean; message?: string })
    | null;
  const message = payload?.message || `Receipt reading failed (${response.status}). Your photo is attached; enter the details before saving.`;
  if (!response.ok || !payload || payload.status === 'failed' || (payload.mode !== 'live' && payload.mode !== 'recorded')) {
    return { ok: false, processed: false, message };
  }
  return {
    ok: true,
    processed: payload.mode === 'live',
    reused: payload.duplicate === true,
    reading: {
      merchant: payload.merchant ?? null,
      date: payload.date ?? null,
      total: payload.total ?? null,
      currency: payload.currency || 'USD',
      uncertainFields: payload.uncertainFields || [],
      fieldHints: payload.fieldHints || {},
      message: payload.message,
      status: payload.status,
      items: (payload.items || [])
        .map((item) => ({ name: item.name?.replace(/\s+/g, ' ').trim() || '' }))
        .filter((item) => item.name)
        .slice(0, 40),
      provider: payload.provider === 'openai' ? 'openai' : 'veryfi',
      version: payload.version || (payload.provider === 'openai' ? 'openai-receipt-2026.11.06' : 'veryfi-evidence-2026.11.05'),
      mode: payload.mode || 'live',
    },
  };
}
