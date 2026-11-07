/**
 * Protected receipt-extraction request.
 * Live Veryfi runs only when the deployment explicitly allows it.
 * Recorded fixtures are selected by the server, never by a browser header alone.
 */
import { detectReceiptMimeFromMagicBytes } from '../lib/ocr/importFileValidation.ts';
import { resolveVeryfiDocument, type ReceiptReading, type VeryfiDocumentShape } from '../lib/ocr/receiptEvidence.ts';
import { reserveDurableAttempt } from './attemptLedger.ts';
import { persistFieldDiagnostic, sanitizeDiagnostic, shouldRetainTotalTrace, type FieldDiagnostic } from './fieldDiagnostics.ts';
import { ownerCodeMatches } from './ownerAccess.ts';
import {
  DEFAULT_OPENAI_MODEL,
  openaiReaderEnabled,
  OpenAiReceiptError,
  readReceiptWithOpenAi,
} from './openaiReceipt.ts';
import { cloudScanRefusal, providerEnabled } from './veryfiPolicy.ts';
import { processVeryfiDocument, toVeryfiDocument, VeryfiRequestError, type VeryfiCredentials } from './veryfiLive.ts';

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
  VERYFI_PROVIDER?: string;
  PREVIEW_OWNER_CODE?: string;
  RECEIPT_READER?: string;
  OPENAI_API_KEY?: string;
  OPENAI_RECEIPT_MODEL?: string;
  OPENAI_RECEIPT_MONTHLY_CAP?: string;
  OPENAI_RECEIPT_CUSTOMER_CAP?: string;
};

type CacheEntry = { hash: string; body: string; status: number };

const idempotency = new Map<string, CacheEntry>();
const byHash = new Map<string, CacheEntry>();
const pending = new Set<string>();
let liveCount = 0;

const openAiByHash = new Map<string, CacheEntry>();
const openAiPending = new Set<string>();
const openAiCounts = new Map<string, number>();

export function resetExtractGuards(): void {
  idempotency.clear();
  byHash.clear();
  pending.clear();
  liveCount = 0;
  openAiByHash.clear();
  openAiPending.clear();
  openAiCounts.clear();
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

function failure(status: number, message: string, provider: 'veryfi' | 'openai' = 'veryfi') {
  return json(status, {
    provider,
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
  const { totalTrace, ...publicReading } = reading;
  return {
    body: {
      provider: 'veryfi',
      mode,
      duplicate,
      documentType: doc.document_type ?? null,
      ...publicReading,
      version: 'veryfi-evidence-2026.11.05',
    },
    totalTrace,
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
    recordDiagnostic?: (entry: FieldDiagnostic) => Promise<void> | void;
    resolveCustomer?: () => Promise<{ ownerId: string; entitled: boolean } | null>;
    consumeAllowance?: (ownerId: string) => Promise<boolean>;
    allowRequest?: (ownerId: string) => boolean;
    readReceipt?: (bytes: Uint8Array, mime: 'image/jpeg' | 'image/png' | 'image/webp') => Promise<ReceiptReading>;
    reserveOpenAi?: (ownerId: string) => Promise<boolean>;
  },
): Promise<Response> {
  const env = options?.env || {};
  if (request.method === 'GET') {
    if (openaiReaderEnabled(env)) {
      return new Response(JSON.stringify({ enabled: true, provider: 'openai' }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    const enabled = providerEnabled(env)
      && env.VERCEL_ENV !== 'production'
      && (!env.VERCEL_GIT_COMMIT_REF || env.VERCEL_GIT_COMMIT_REF === ALLOWED_PREVIEW_BRANCH);
    return new Response(JSON.stringify({ enabled: Boolean(enabled), provider: 'veryfi' }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  if (env.VERCEL_ENV === 'production') return failure(404, 'Receipt reading is not available here.');
  if (openaiReaderEnabled(env)) return handleOpenAiReceipt(request, env, options);
  if (!options?.selectRecorded && env.VERCEL_GIT_COMMIT_REF && env.VERCEL_GIT_COMMIT_REF !== ALLOWED_PREVIEW_BRANCH) {
    if (env.VERYFI_LIVE_CALLS === '1' || env.VERYFI_PROVIDER === 'enabled') {
      return failure(404, 'Receipt reading is not available here.');
    }
    return failure(503, 'Live receipt reading is turned off.');
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
      document = toVeryfiDocument(recorded as unknown as Record<string, unknown>);
    } else if (env.VERYFI_LIVE_CALLS !== '1') {
      return failure(503, 'Live receipt reading is turned off.');
    } else if (!options?.processDocument && !providerEnabled(env)) {
      return failure(503, 'Live receipt reading is turned off.');
    } else if (!options?.processDocument && !env.PREVIEW_OWNER_CODE && !options?.resolveCustomer) {
      return failure(503, 'Live receipt reading is turned off.');
    } else {
      let scanOwner = '';
      if (options?.resolveCustomer) {
        const customer = await options.resolveCustomer();
        if (!customer) return failure(401, 'Sign in from Writeoff to continue.');
        if (!customer.entitled) return failure(402, cloudScanRefusal(false));
        if (options.allowRequest && !options.allowRequest(customer.ownerId)) {
          return failure(429, 'Too many receipt readings were requested. Review the photo on this device.');
        }
        scanOwner = customer.ownerId;
      }
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
      if (options?.consumeAllowance && !(await options.consumeAllowance(scanOwner))) {
        return failure(429, cloudScanRefusal(true));
      }
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

  const packed = readingBody(document, mode, false);
  const trace = packed.totalTrace;
  if (trace && shouldRetainTotalTrace(trace.reason)) {
    const entry = sanitizeDiagnostic({
      requestId: idempotencyKey,
      at: new Date().toISOString(),
      field: 'total',
      decision: trace.decision,
      reason: trace.reason,
      structuredTotal: typeof document.total === 'number' && Number.isFinite(document.total) ? document.total : null,
      candidates: trace.candidates,
      evidence: trace.evidence,
    });
    try {
      if (options?.recordDiagnostic) await options.recordDiagnostic(entry);
      else if (mode === 'live') {
        const token = env.VERYFI_ATTEMPT_TOKEN || env.BLOB_READ_WRITE_TOKEN || '';
        if (token) await persistFieldDiagnostic(token, entry);
      }
    } catch {
      // A diagnostic note must not fail the scan or change the attempt count.
    }
  }
  const body = JSON.stringify(packed.body);
  return remember(idempotencyKey, hash, 200, body);
}

type ExtractOptions = NonNullable<Parameters<typeof handleExtractReceipt>[1]>;

async function handleOpenAiReceipt(request: Request, env: ExtractEnv, options?: ExtractOptions): Promise<Response> {
  if (request.method !== 'POST') return failure(405, 'Send the receipt photo with the review form.', 'openai');
  if (!sameOrigin(request, options?.allowedOrigins || [])) {
    return failure(403, 'Receipt reading is only available from this preview.', 'openai');
  }
  if (!options?.resolveCustomer) return failure(503, 'Receipt reading is turned off.', 'openai');
  const customer = await options.resolveCustomer();
  if (!customer) return failure(401, 'Sign in from Writeoff to continue.', 'openai');
  if (options.allowRequest && !options.allowRequest(customer.ownerId)) {
    return failure(429, 'Too many receipt readings were requested. Review the photo on this device.', 'openai');
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength <= 0) return failure(400, 'That photo is empty.', 'openai');
  if (bytes.byteLength > MAX_RECEIPT_UPLOAD_BYTES) {
    return failure(413, 'This photo is too large to send. Enter the details you can see on it.', 'openai');
  }
  const mime = detectReceiptMimeFromMagicBytes(bytes);
  if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/webp') {
    return failure(415, 'ChatGPT can read a JPEG, PNG, or WebP photo. Enter the details on this file.', 'openai');
  }
  const hash = await sha256(bytes);
  const cached = openAiByHash.get(hash);
  if (cached) {
    const parsed = JSON.parse(cached.body) as { duplicate?: boolean };
    parsed.duplicate = true;
    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  if (openAiPending.has(hash)) {
    return failure(409, 'That photo is already being read. Wait for the first result.', 'openai');
  }

  if (!options.reserveOpenAi && !options.readReceipt) {
    return failure(503, 'Receipt reading is turned off.', 'openai');
  }
  const reserved = options.reserveOpenAi
    ? await options.reserveOpenAi(customer.ownerId)
    : reserveOpenAiInMemory(customer.ownerId);
  if (!reserved) {
    return failure(429, 'This month’s ChatGPT receipt reading allowance is used. Review the photo on this device.', 'openai');
  }

  openAiPending.add(hash);
  try {
    const reading = options.readReceipt
      ? await options.readReceipt(bytes, mime)
      : await readReceiptWithOpenAi(
        bytes,
        mime,
        env.OPENAI_API_KEY || '',
        env.OPENAI_RECEIPT_MODEL || DEFAULT_OPENAI_MODEL,
        fetch,
      );
    const body = JSON.stringify({
      provider: 'openai',
      mode: 'live',
      duplicate: false,
      ...reading,
      version: 'openai-receipt-2026.11.06',
    });
    openAiByHash.set(hash, { hash, body, status: 200 });
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const message = err instanceof OpenAiReceiptError
      ? err.message
      : 'Receipt reading failed before a result came back.';
    return failure(502, message, 'openai');
  } finally {
    openAiPending.delete(hash);
  }
}

function reserveOpenAiInMemory(ownerId: string): boolean {
  const mine = openAiCounts.get(ownerId) || 0;
  const total = [...openAiCounts.values()].reduce((sum, count) => sum + count, 0);
  if (mine >= 20 || total >= 60) return false;
  openAiCounts.set(ownerId, mine + 1);
  return true;
}
