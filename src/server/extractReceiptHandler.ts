/**
 * Protected receipt-extraction request.
 * Live Veryfi runs only when the deployment explicitly allows it.
 * Recorded fixtures are selected by the server, never by a browser header alone.
 */
import { detectReceiptMimeFromMagicBytes } from '../lib/ocr/importFileValidation.ts';
import { resolveVeryfiDocument, type VeryfiDocumentShape } from '../lib/ocr/receiptEvidence.ts';
import { reserveDurableAttempt } from './attemptLedger.ts';
import { ownerCodeMatches } from './ownerAccess.ts';
import { processVeryfiDocument, VeryfiRequestError, type VeryfiCredentials } from './veryfiLive.ts';

export const ALLOWED_PREVIEW_BRANCH = 'cursor/veryfi-live-scan-9e74';
export const MAX_RECEIPT_UPLOAD_BYTES = 2_500_000;
export const DEFAULT_DOC_CAP = 3;

export type ExtractEnv = {
  VERCEL_ENV?: string;
  VERCEL_GIT_COMMIT_REF?: string;
  VERYFI_LIVE_CALLS?: string;
  VERYFI_PREVIEW_DOC_CAP?: string;
  VERYFI_ATTEMPT_TOKEN?: string;
  BLOB_READ_WRITE_TOKEN?: string;
  VERYFI_CLIENT_ID?: string;
  VERYFI_USERNAME?: string;
  VERYFI_API_KEY?: string;
  PREVIEW_OWNER_CODE?: string;
};

type CacheEntry = { hash: string; body: string; status: number };

const idempotency = new Map<string, CacheEntry>();
const byHash = new Map<string, CacheEntry>();
const pending = new Set<string>();
let liveCount = 0;

export function resetExtractGuards(): void {
  idempotency.clear();
  byHash.clear();
  pending.clear();
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
    documentType: doc.document_type ?? null,
    ...reading,
    version: 'veryfi-evidence-2026.11.05',
  };
}

function remember(key: string, hash: string, status: number, body: string): Response {
  const entry = { hash, body, status };
  idempotency.set(key, entry);
  byHash.set(hash, entry);
  return new Response(body, { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function replay(entry: CacheEntry): Response {
  if (entry.status !== 200) {
    return new Response(entry.body, { status: entry.status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  const parsed = JSON.parse(entry.body) as { duplicate?: boolean };
  parsed.duplicate = true;
  return new Response(JSON.stringify(parsed), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function handleExtractReceipt(
  request: Request,
  options?: {
    env?: ExtractEnv;
    processDocument?: (bytes: Uint8Array, mime: string) => Promise<VeryfiDocumentShape>;
    selectRecorded?: (fileName: string) => VeryfiDocumentShape | null;
    allowedOrigins?: string[];
    reserveAttempt?: (cap: number) => Promise<boolean>;
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
  if (env.PREVIEW_OWNER_CODE && !ownerCodeMatches(request.headers.get('cookie'), env.PREVIEW_OWNER_CODE)) {
    return failure(401, 'This preview is limited to its owner.');
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
  if (priorKey) return replay(priorKey);
  const cached = byHash.get(hash);
  if (cached) {
    idempotency.set(idempotencyKey, cached);
    return replay(cached);
  }
  if (pending.has(hash)) {
    return failure(409, 'That photo is already being read. Wait for the first result.');
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
      return failure(503, 'Live receipt reading is turned off.');
    } else if (!options?.processDocument && !env.PREVIEW_OWNER_CODE) {
      return failure(503, 'Live receipt reading is turned off.');
    } else {
      const credentials: VeryfiCredentials = {
        clientId: env.VERYFI_CLIENT_ID || '',
        username: env.VERYFI_USERNAME || '',
        apiKey: env.VERYFI_API_KEY || '',
      };
      if (!options?.processDocument && (!credentials.clientId || !credentials.username || !credentials.apiKey)) {
        return failure(503, 'Live receipt reading is turned off.');
      }
      const cap = Number(env.VERYFI_PREVIEW_DOC_CAP || DEFAULT_DOC_CAP);
      if (!Number.isFinite(cap) || cap < 1) {
        return failure(429, 'This preview has reached its receipt reading limit.');
      }
      let reserved = false;
      if (options?.reserveAttempt) {
        reserved = await options.reserveAttempt(cap);
      } else if (options?.processDocument) {
        if (liveCount < cap) {
          liveCount += 1;
          reserved = true;
        }
      } else if (!env.VERYFI_ATTEMPT_TOKEN && !env.BLOB_READ_WRITE_TOKEN) {
        return failure(503, 'Live receipt reading is turned off.');
      } else {
        try {
          reserved = await reserveDurableAttempt(env.VERYFI_ATTEMPT_TOKEN || env.BLOB_READ_WRITE_TOKEN || '', cap);
        } catch {
          return failure(503, 'Live receipt reading is turned off.');
        }
      }
      if (!reserved) return failure(429, 'This preview has reached its receipt reading limit.');
      pending.add(hash);
      mode = 'live';
      try {
        document = options?.processDocument
          ? await options.processDocument(bytes, mime)
          : await processVeryfiDocument(bytes, mime, credentials, fetch, hash);
      } finally {
        pending.delete(hash);
      }
    }
  } catch (err) {
    const message = err instanceof VeryfiRequestError
      ? err.message
      : 'Receipt reading failed before a result came back.';
    return failure(502, message);
  }

  const body = JSON.stringify(readingBody(document, mode, false));
  return remember(idempotencyKey, hash, 200, body);
}
