/**
 * Receipt upload allowlist + magic-byte MIME checks.
 * Pattern adapted from RHEV Smart Import (`importFileValidation`) — generic
 * ingest hygiene, not casting-document UI. $0 / no network.
 */

export const MAX_RECEIPT_BYTES = 15 * 1024 * 1024;

export const ALLOWED_RECEIPT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedReceiptMime = (typeof ALLOWED_RECEIPT_MIME_TYPES)[number];

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP_WEBP = [0x57, 0x45, 0x42, 0x50];

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((value, index) => bytes[index] === value);
}

export function isAllowedReceiptMimeType(mime: string): mime is AllowedReceiptMime {
  return (ALLOWED_RECEIPT_MIME_TYPES as readonly string[]).includes(mime);
}

/** Detect JPEG/PNG/WebP/PDF from magic bytes. Returns null when unrecognized. */
export function detectReceiptMimeFromMagicBytes(bytes: Uint8Array): AllowedReceiptMime | 'image/heic' | null {
  if (startsWith(bytes, PDF_MAGIC)) return 'application/pdf';
  if (startsWith(bytes, JPEG_MAGIC)) return 'image/jpeg';
  if (startsWith(bytes, PNG_MAGIC)) return 'image/png';
  if (
    bytes.length >= 12 &&
    startsWith(bytes, WEBP_RIFF) &&
    bytes[8] === WEBP_WEBP[0] &&
    bytes[9] === WEBP_WEBP[1] &&
    bytes[10] === WEBP_WEBP[2] &&
    bytes[11] === WEBP_WEBP[3]
  ) {
    return 'image/webp';
  }
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
    if (brand === 'heic' || brand === 'heif' || brand === 'mif1' || brand === 'msf1') return 'image/heic';
  }
  return null;
}

export type ReceiptFileValidation =
  | { ok: true; mime: AllowedReceiptMime | string }
  | { ok: false; error: string };

/**
 * Validate a picked receipt file: size, allowlist, and magic-byte agreement
 * when bytes are available. Declared MIME may be empty on some mobile picks —
 * magic bytes then decide.
 */
export function validateReceiptFileSelection(
  file: File,
  headerBytes?: Uint8Array | null,
): ReceiptFileValidation {
  if (!file) return { ok: false, error: 'Choose a receipt photo or PDF first.' };
  if (file.size <= 0) return { ok: false, error: 'That file is empty.' };
  if (file.size > MAX_RECEIPT_BYTES) {
    return {
      ok: false,
      error: `Photo is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Use a file under 15 MB.`,
    };
  }

  const declared = (file.type || '').toLowerCase();
  const magic = headerBytes?.length
    ? detectReceiptMimeFromMagicBytes(headerBytes)
    : null;

  const declaredNorm =
    declared === 'image/jpg' ? 'image/jpeg' : declared;

  if (magic) {
    if (declaredNorm && isAllowedReceiptMimeType(declaredNorm) && declaredNorm !== magic) {
      return {
        ok: false,
        error: 'File type does not match its contents. Use a JPEG, PNG, WebP, or PDF receipt.',
      };
    }
    return { ok: true, mime: magic };
  }

  if (declaredNorm && isAllowedReceiptMimeType(declaredNorm)) {
    return { ok: true, mime: declaredNorm };
  }

  // Extension fallback when browser omits MIME (common on iPhone library picks).
  if (/\.jpe?g$/i.test(file.name)) return { ok: true, mime: 'image/jpeg' };
  if (/\.png$/i.test(file.name)) return { ok: true, mime: 'image/png' };
  if (/\.webp$/i.test(file.name)) return { ok: true, mime: 'image/webp' };
  if (/\.pdf$/i.test(file.name)) return { ok: true, mime: 'application/pdf' };
  if (/\.hei[cf]$/i.test(file.name) || declaredNorm === 'image/heic' || declaredNorm === 'image/heif') {
    return { ok: true, mime: 'image/heic' };
  }

  return {
    ok: false,
    error: 'Choose a receipt photo (JPEG/PNG/WebP) or PDF.',
  };
}

/** Read enough leading bytes for magic-byte detection. */
export async function readFileHeaderBytes(file: File, length = 16): Promise<Uint8Array> {
  const slice = file.slice(0, length);
  const buffer = await slice.arrayBuffer();
  return new Uint8Array(buffer);
}
