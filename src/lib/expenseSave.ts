/**
 * Save helpers for receipt expenses. No OCR, OpenAI, or Veryfi calls.
 * Keeps retries on one expense id and one storage object path.
 */

export const MAX_RECEIPT_UPLOAD_BYTES = 3 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

export type SaveFailureStage =
  | 'auth'
  | 'expense'
  | 'upload'
  | 'receipt_row'
  | 'unknown';

export class ExpenseSaveError extends Error {
  readonly stage: SaveFailureStage;
  readonly expenseId: string | null;
  readonly storagePath: string | null;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      stage: SaveFailureStage;
      expenseId?: string | null;
      storagePath?: string | null;
      retryable?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ExpenseSaveError';
    this.stage = options.stage;
    this.expenseId = options.expenseId ?? null;
    this.storagePath = options.storagePath ?? null;
    this.retryable = options.retryable ?? true;
  }
}

/** Stable object key so a retry replaces the same file instead of leaving orphans. */
export function receiptStoragePath(userId: string, expenseId: string, mimeType: string): string {
  const mime = (mimeType || 'image/jpeg').toLowerCase();
  const ext = mime === 'image/png'
    ? 'png'
    : mime === 'image/webp'
      ? 'webp'
      : mime === 'image/gif'
        ? 'gif'
        : mime === 'application/pdf'
          ? 'pdf'
          : mime === 'image/heic' || mime === 'image/heif'
            ? 'heic'
            : 'jpg';
  return `${userId}/${expenseId}/receipt.${ext}`;
}

export function normalizeReceiptMime(file: { type?: string; name?: string }): string {
  const declared = (file.type || '').toLowerCase().trim();
  if (ALLOWED_MIME.has(declared)) return declared;
  const name = (file.name || '').toLowerCase();
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.webp$/i.test(name)) return 'image/webp';
  if (/\.gif$/i.test(name)) return 'image/gif';
  if (/\.pdf$/i.test(name)) return 'application/pdf';
  if (/\.hei[cf]$/i.test(name)) return 'image/heic';
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
  return declared || 'image/jpeg';
}

export function assertReceiptUploadable(file: { size: number; type?: string; name?: string }): string {
  if (!file || file.size <= 0) {
    throw new ExpenseSaveError('That photo is empty.', { stage: 'upload', retryable: false });
  }
  if (file.size > MAX_RECEIPT_UPLOAD_BYTES) {
    throw new ExpenseSaveError('Choose a receipt smaller than 3 MB.', { stage: 'upload', retryable: false });
  }
  const mime = normalizeReceiptMime(file);
  if (!ALLOWED_MIME.has(mime)) {
    throw new ExpenseSaveError('Choose a photo or PDF receipt.', { stage: 'upload', retryable: false });
  }
  return mime;
}

/** Map provider/network failures to a customer message. Never returns receipt bytes. */
export function describeSaveFailure(err: unknown, stage: SaveFailureStage = 'unknown'): string {
  if (err instanceof ExpenseSaveError) return err.message;
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const code = err && typeof err === 'object' && 'statusCode' in err
    ? String((err as { statusCode?: unknown }).statusCode || '')
    : err && typeof err === 'object' && 'status' in err
      ? String((err as { status?: unknown }).status || '')
      : '';
  const hay = `${message} ${code}`.toLowerCase();

  if (/jwt|session|not authenticated|invalid claim|401|403|unauthorized|expired/.test(hay)) {
    return 'Your session expired. Sign in again, then tap Save expense. Your receipt details are still here.';
  }
  if (/load failed|failed to fetch|networkerror|network request failed|timeout|abort|econnreset|offline/.test(hay)) {
    if (stage === 'upload' || stage === 'receipt_row') {
      return 'The receipt photo did not finish uploading. Check your connection and tap Save expense again. Your details stay on this screen.';
    }
    return 'Saving was interrupted. Check your connection and tap Save expense again. Your details stay on this screen.';
  }
  if (/payload|too large|413|entity too large|maximum allowed size/.test(hay)) {
    return 'Choose a receipt smaller than 3 MB.';
  }
  if (/mime|content type|415|not allowed/.test(hay)) {
    return 'Choose a JPEG, PNG, WebP, or PDF receipt.';
  }
  if (message.trim()) return message;
  return 'Could not save this expense. Your receipt details are still here — try Save expense again.';
}

/** Sanitized note for support logs. No photo bytes, merchant text, or tokens. */
export function sanitizeSaveDiagnostic(input: {
  stage: SaveFailureStage;
  expenseId: string | null;
  storagePath: string | null;
  byteLength: number | null;
  mimeType: string | null;
  httpStatus: number | null;
  errorName: string | null;
  errorMessage: string | null;
}): Record<string, string | number | null> {
  const message = (input.errorMessage || '').slice(0, 160).replace(/\s+/g, ' ').trim();
  return {
    stage: input.stage,
    expenseId: input.expenseId && /^[0-9a-f-]{36}$/i.test(input.expenseId) ? input.expenseId : null,
    storageOwned: input.storagePath ? Number(input.storagePath.includes('/')) : null,
    byteLength: input.byteLength != null && Number.isFinite(input.byteLength) ? Math.max(0, Math.floor(input.byteLength)) : null,
    mimeType: input.mimeType && ALLOWED_MIME.has(input.mimeType) ? input.mimeType : null,
    httpStatus: input.httpStatus,
    errorName: input.errorName ? input.errorName.slice(0, 40) : null,
    errorClass: /load failed|failed to fetch|network/i.test(message)
      ? 'network'
      : /jwt|session|401|unauthorized/i.test(message)
        ? 'auth'
        : message
          ? 'provider'
          : 'unknown',
  };
}
