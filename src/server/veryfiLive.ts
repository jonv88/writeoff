/**
 * Server-only Veryfi document call.
 * Callers pass credentials in. This module never reads VITE_* and never logs secrets.
 */
import type { VeryfiDocumentShape } from '../lib/ocr/receiptEvidence.ts';

export class VeryfiRequestError extends Error {
  status: number;
  constructor(status: number) {
    super(
      status === 402
        ? 'The receipt service declined this photo.'
        : `Receipt reading failed (${status}).`,
    );
    this.name = 'VeryfiRequestError';
    this.status = status;
  }
}

export type VeryfiCredentials = {
  clientId: string;
  username: string;
  apiKey: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size));
  }
  return btoa(binary);
}

function readDocumentType(value: unknown): string | null {
  if (typeof value === 'string') return value.slice(0, 40);
  if (value && typeof value === 'object' && 'value' in value) {
    const inner = (value as { value?: unknown }).value;
    return typeof inner === 'string' ? inner.slice(0, 40) : null;
  }
  return null;
}

export async function processVeryfiDocument(
  bytes: Uint8Array,
  mime: string,
  credentials: VeryfiCredentials,
  fetchImpl: typeof fetch = fetch,
  idempotencyKey?: string,
): Promise<VeryfiDocumentShape> {
  if (!credentials.clientId || !credentials.username || !credentials.apiKey) {
    throw new VeryfiRequestError(503);
  }
  const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'application/pdf' ? 'pdf' : 'jpg';
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'CLIENT-ID': credentials.clientId,
    AUTHORIZATION: `apikey ${credentials.username}:${credentials.apiKey}`,
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const response = await fetchImpl('https://api.veryfi.com/api/v8/partner/documents', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      file_name: `receipt.${extension}`,
      file_data: bytesToBase64(bytes),
      auto_delete: true,
      boost_mode: false,
    }),
  });
  if (!response.ok) throw new VeryfiRequestError(response.status);
  const payload = (await response.json()) as VeryfiDocumentShape & { document_type?: unknown };
  return {
    vendor: payload.vendor
      ? { name: payload.vendor.name ?? null, raw_name: payload.vendor.raw_name ?? null }
      : null,
    date: payload.date ?? null,
    total: payload.total ?? null,
    tip: payload.tip ?? null,
    currency_code: payload.currency_code ?? null,
    ocr_text: payload.ocr_text ?? null,
    document_type: readDocumentType(payload.document_type),
  };
}
