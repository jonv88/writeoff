/**
 * Protected receipt-extraction request.
 * Live Veryfi runs only when the deployment explicitly allows it.
 * Recorded fixtures are selected by the server, never by a browser header alone.
 */
import { detectReceiptMimeFromMagicBytes } from '../lib/ocr/importFileValidation.ts';
import { resolveVeryfiDocument, type VeryfiDocumentShape } from '../lib/ocr/receiptEvidence.ts';
import { processVeryfiDocument, VeryfiRequestError, type VeryfiCredentials } from './veryfiLive.ts';

export const ALLOWED_PREVIEW_BRANCH = 'cursor/veryfi-live-scan-9e74';
export const MAX_RECEIPT_UPLOAD_BYTES = 2_500_000;
export const DEFAULT_DOC_CAP = 6;

export type ExtractEnv = {
  VERCEL_ENV?: string;
  VERCEL_GIT_COMMIT_REF?: string;
  VERYFI_LIVE_CALLS?: string;
  VERYFI_PREVIEW_DOC_CAP?: string;
  VERYFI_CLIENT_ID?: string;
  VERYFI_USERNAME?: string;
  VERYFI_API_KEY?: string;
};

type CacheEntry = { hash: string; body: string };

const idempotency = new Map<string, CacheEntry>();
const byHash = new Map<string, string>();
let liveCount = 0;

export function resetExtractGuards(): void {
  idempotency.clear();
  byHash.clear();
  liveCount = 0;
}

export function liveDocumentCount(): number {
  return liveCount;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function failure(status: number, message: string) {
  return json(status, {
    provider: 'veryfi',
    mode: 'off',
    status: 'failed',
    merchant: null,
    date: null,
    total: null,
    currency: 'USD',
    uncertainFields: ['merchant', 'date', 'total'],
    fieldHints: {
      merchant: 'Confirm the merchant name',
      date: 'Confirm the purchase date',
      total: 'Confirm the final amount paid',
    },
    message,
    duplicate: false,
  });
}

function sameOrigin(request: Request, allowedOrigins: string[]): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  let originHost = '';
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  if (allowedOrigins.some((item) => {
    try {
      return new URL(item).host === originHost;
    } catch {
      return item === originHost;
    }
  })) {
    return true;
  }
  const host = request.headers.get('host');
  return Boolean(host) && host === originHost;
}

function readingBody(doc: VeryfiDocumentShape, mode: 'live' | 'recorded', duplicate: boolean) {
  const reading = resolveVeryfiDocument(doc);
  return {
    provider: 'veryfi',
    mode,
    duplicate,
    ...reading,
    version: 'veryfi-evidence-2026.11.05',
  };
}

export async function handleExtractReceipt(
  request: Request,
  options?: {
    env?: ExtractEnv;
    processDocument?: (bytes: Uint8Array, mime: string) => Promise<VeryfiDocumentShape>;
    selectRecorded?: (fileName: string) => VeryfiDocumentShape | null;
    allowedOrigins?: string[];
  },
): Promise<Response> {
  const env = options?.env || {};
  if (env.VERCEL_ENV === 'production') return failure(404, 'Receipt reading is not available here.');
  if (env.VERCEL_GIT_COMMIT_REF && env.VERCEL_GIT_COMMIT_REF !== ALLOWED_PREVIEW_BRANCH) {
    return failure(404, 'Receipt reading is not available here.');
  }
  if (request.method !== 'POST') return failure(405, 'Send the receipt photo with the review form.');
  if (!sameOrigin(request, options?.allowedOrigins || [])) {
    return failure(403, 'Receipt reading is only available from this preview.');
  }

  const idempotencyKey = (request.headers.get('idempotency-key') || '').trim();
  if (!/^[A-Za-z0-9._:-]{8,80}$/.test(idempotencyKey)) {
    return failure(400, 'The receipt upload was missing a request id. Try the photo again.');
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength <= 0) return failure(400, 'That photo is empty.');
  if (bytes.byteLength > MAX_RECEIPT_UPLOAD_BYTES) {
    return failure(413, 'This photo is too large to send. Enter the details you can see on it.');
  }
  const mime = detectReceiptMimeFromMagicBytes(bytes);
  if (!mime) return failure(415, 'Use a JPEG, PNG, WebP, or PDF receipt.');

  const hash = await sha256(bytes);
  const priorKey = idempotency.get(idempotencyKey);
  if (priorKey && priorKey.hash !== hash) {
    return failure(409, 'That request id was already used for a different photo.');
  }
  if (priorKey) return new Response(priorKey.body, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  const cached = byHash.get(hash);
  if (cached) {
    idempotency.set(idempotencyKey, { hash, body: cached });
    const parsed = JSON.parse(cached) as { duplicate?: boolean };
    parsed.duplicate = true;
    const body = JSON.stringify(parsed);
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

  let document: VeryfiDocumentShape;
  let mode: 'live' | 'recorded' = 'recorded';
  try {
    if (options?.selectRecorded) {
      const fileName = request.headers.get('x-file-name') || '';
      const recorded = options.selectRecorded(fileName);
      if (!recorded) return failure(422, 'No receipt reading is available for this photo.');
      document = recorded;
    } else if (env.VERYFI_LIVE_CALLS !== '1') {
      return failure(503, 'Live receipt reading is off until the free allowance is confirmed.');
    } else if (options?.processDocument) {
      const cap = Number(env.VERYFI_PREVIEW_DOC_CAP || DEFAULT_DOC_CAP);
      if (!Number.isFinite(cap) || liveCount >= cap) {
        return failure(429, 'This preview has reached its receipt reading limit.');
      }
      document = await options.processDocument(bytes, mime);
      liveCount += 1;
      mode = 'live';
    } else {
      const cap = Number(env.VERYFI_PREVIEW_DOC_CAP || DEFAULT_DOC_CAP);
      if (!Number.isFinite(cap) || liveCount >= cap) {
        return failure(429, 'This preview has reached its receipt reading limit.');
      }
      const credentials: VeryfiCredentials = {
        clientId: env.VERYFI_CLIENT_ID || '',
        username: env.VERYFI_USERNAME || '',
        apiKey: env.VERYFI_API_KEY || '',
      };
      if (!credentials.clientId || !credentials.username || !credentials.apiKey) {
        return failure(503, 'Live receipt reading is off until the free allowance is confirmed.');
      }
      document = await processVeryfiDocument(bytes, mime, credentials);
      liveCount += 1;
      mode = 'live';
    }
  } catch (err) {
    const message = err instanceof VeryfiRequestError
      ? err.message
      : 'Receipt reading failed before a result came back.';
    return failure(502, message);
  }

  const body = JSON.stringify(readingBody(document, mode, false));
  idempotency.set(idempotencyKey, { hash, body });
  byHash.set(hash, body);
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
