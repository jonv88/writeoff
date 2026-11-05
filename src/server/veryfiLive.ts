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
  const payload = (await response.json()) as Record<string, unknown>;
  return toVeryfiDocument(payload);
}

function numericField(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'value' in value) {
    const inner = (value as { value?: unknown }).value;
    if (typeof inner === 'number' && Number.isFinite(inner)) return inner;
  }
  return null;
}

function boxPosition(box: unknown): { top: number; left: number } | null {
  if (Array.isArray(box) && box.length >= 2 && box.every((item) => typeof item === 'number')) {
    const ys = box.length >= 4 ? [box[1], box[3]] : [box[1]];
    const xs = box.length >= 4 ? [box[0], box[2]] : [box[0]];
    return { top: Math.min(...ys), left: Math.min(...xs) };
  }
  if (!box || typeof box !== 'object') return null;
  const record = box as Record<string, unknown>;
  const top = numericField(record.top ?? record.y ?? record.y0);
  const left = numericField(record.left ?? record.x ?? record.x0);
  if (top == null) return null;
  return { top, left: left ?? 0 };
}

function readLayoutLines(payload: Record<string, unknown>): { text: string; top: number; left: number }[] {
  const meta = payload.meta;
  if (!meta || typeof meta !== 'object') return [];
  const pages = (meta as { pages?: unknown }).pages;
  if (!Array.isArray(pages)) return [];
  const lines: { text: string; top: number; left: number }[] = [];
  for (const page of pages) {
    if (!page || typeof page !== 'object') continue;
    const ocr = (page as { ocr?: unknown; lines?: unknown }).ocr;
    const source = ocr && typeof ocr === 'object' ? (ocr as { lines?: unknown }).lines : (page as { lines?: unknown }).lines;
    if (!Array.isArray(source)) continue;
    for (const line of source) {
      if (!line || typeof line !== 'object') continue;
      const record = line as { text?: unknown; bounding_box?: unknown; boundingBox?: unknown; bbox?: unknown };
      if (typeof record.text !== 'string') continue;
      const position = boxPosition(record.bounding_box ?? record.boundingBox ?? record.bbox);
      if (!position) continue;
      const text = record.text.replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!text) continue;
      lines.push({ text, top: position.top, left: position.left });
      if (lines.length >= 80) return lines;
    }
  }
  return lines;
}

/** Keep totals and line positions. Leave payment and card fields behind. */
export function toVeryfiDocument(payload: Record<string, unknown>): VeryfiDocumentShape {
  const vendor = payload.vendor;
  const vendorRecord = vendor && typeof vendor === 'object' ? (vendor as { name?: unknown; raw_name?: unknown }) : null;
  const layoutLines = readLayoutLines(payload);
  return {
    vendor: vendorRecord
      ? {
          name: typeof vendorRecord.name === 'string' ? vendorRecord.name : null,
          raw_name: typeof vendorRecord.raw_name === 'string' ? vendorRecord.raw_name : null,
        }
      : null,
    date: typeof payload.date === 'string' ? payload.date : null,
    total: numericField(payload.total),
    subtotal: numericField(payload.subtotal),
    tax: numericField(payload.tax),
    tip: numericField(payload.tip),
    discount: numericField(payload.discount),
    cashback: numericField(payload.cashback),
    rounding: numericField(payload.rounding),
    currency_code: typeof payload.currency_code === 'string' ? payload.currency_code : null,
    ocr_text: typeof payload.ocr_text === 'string' ? payload.ocr_text : null,
    document_type: readDocumentType(payload.document_type),
    line_items: lineItemDescriptions(payload),
    layoutLines: layoutLines.length ? layoutLines : null,
  };
}

function lineItemDescriptions(payload: { line_items?: unknown }): { description: string }[] {
  if (!Array.isArray(payload.line_items)) return [];
  const names: { description: string }[] = [];
  for (const row of payload.line_items) {
    if (!row || typeof row !== 'object') continue;
    const raw = (row as { description?: unknown; text?: unknown }).description ?? (row as { text?: unknown }).text;
    if (typeof raw !== 'string') continue;
    const description = raw.replace(/\s+/g, ' ').trim();
    if (!description) continue;
    names.push({ description });
    if (names.length >= 40) break;
  }
  return names;
}
