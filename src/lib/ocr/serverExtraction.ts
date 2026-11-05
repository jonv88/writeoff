/**
 * Browser call to the preview receipt endpoint.
 * Credentials stay on the server. This module only calls the preview endpoint.
 */
import type { ReceiptReading } from './receiptEvidence.ts';

export type ServerExtraction =
  | {
      ok: true;
      processed: true;
      reused: boolean;
      reading: ReceiptReading & { provider: string; version: string; mode: string };
    }
  | { ok: false; processed: false; message: string };

const MAX_UPLOAD_BYTES = 2_500_000;

export async function requestServerExtraction(file: File): Promise<ServerExtraction> {
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
  if (!response.ok || !payload || payload.status === 'failed' || payload.mode !== 'live') {
    return { ok: false, processed: false, message };
  }
  return {
    ok: true,
    processed: true,
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
      provider: 'veryfi',
      version: payload.version || 'veryfi-evidence-2026.11.05',
      mode: payload.mode || 'live',
    },
  };
}
