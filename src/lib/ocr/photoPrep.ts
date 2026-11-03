/**
 * Prepare a receipt photo for browser OCR: decode, honor EXIF orientation when
 * the browser supports it, and downscale large images while keeping text readable.
 * $0 / no API keys. Never invents OCR fields.
 */

export type PhotoPrepResult =
  | {
      ok: true;
      /** Image prepared for OCR (JPEG). */
      ocrFile: File;
      /** File to keep attached on the expense (prefer prepared JPEG). */
      attachFile: File;
      previewUrl: string;
      width: number;
      height: number;
      note?: string;
    }
  | {
      ok: false;
      message: string;
      /** Still attach when possible so the user can finish manually. */
      attachFile: File | null;
      previewUrl: string | null;
      unscannable: boolean;
    };

const MAX_INPUT_BYTES = 15 * 1024 * 1024;
/** Longest edge for OCR — large enough for receipt text, small enough for phones. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.88;

function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

function isLikelyImage(file: File): boolean {
  return (
    file.type.startsWith('image/') ||
    /\.(jpe?g|png|webp|gif|bmp|hei[cf])$/i.test(file.name)
  );
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  // createImageBitmap applies EXIF orientation in Chromium / modern Safari for JPEG.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, {
        imageOrientation: 'from-image',
      } as ImageBitmapOptions);
    } catch {
      // fall through — older engines may reject options or HEIC
    }
    try {
      return await createImageBitmap(file);
    } catch {
      /* Image() fallback */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode image'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(img, 0, 0);
    return await createImageBitmap(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function scaleDims(w: number, h: number, maxEdge: number): { width: number; height: number } {
  const edge = Math.max(w, h);
  if (edge <= maxEdge) return { width: w, height: h };
  const scale = maxEdge / edge;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

async function canvasToJpegFile(
  canvas: HTMLCanvasElement,
  nameBase: string,
): Promise<File> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('JPEG encode failed'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
  const base = nameBase.replace(/\.[^.]+$/, '') || 'receipt';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

/**
 * Decode + orient + resize a receipt photo for OCR.
 * PDFs / undecodable HEIC return ok:false with attachFile when possible.
 */
export async function prepareReceiptPhoto(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<PhotoPrepResult> {
  if (file.size > MAX_INPUT_BYTES) {
    return {
      ok: false,
      message: `Photo is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Use a photo under 15 MB, or enter details manually.`,
      attachFile: null,
      previewUrl: null,
      unscannable: true,
    };
  }

  if (isPdf(file)) {
    const previewUrl = URL.createObjectURL(file);
    return {
      ok: false,
      message:
        'PDF OCR is limited in this free browser preview. Receipt is attached — enter merchant, date, and amount manually, or use a JPEG/PNG photo.',
      attachFile: file,
      previewUrl,
      unscannable: true,
    };
  }

  if (!isLikelyImage(file)) {
    return {
      ok: false,
      message: 'Choose a receipt photo (JPEG/PNG/WebP) or enter details manually.',
      attachFile: null,
      previewUrl: null,
      unscannable: true,
    };
  }

  onProgress?.('Photo attached — preparing…');

  let bitmap: ImageBitmap;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    const previewUrl = URL.createObjectURL(file);
    const heicHint = isHeic(file)
      ? 'HEIC/HEIF could not be decoded in this browser. On iPhone use Settings → Camera → Formats → Most Compatible, or export as JPEG.'
      : 'This image could not be decoded for OCR.';
    return {
      ok: false,
      message: `${heicHint} Receipt stays attached — enter details manually or retry with JPEG/PNG.`,
      attachFile: file,
      previewUrl,
      unscannable: true,
    };
  }

  try {
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    const { width, height } = scaleDims(srcW, srcH, MAX_EDGE);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return {
        ok: false,
        message: 'Could not prepare the photo for OCR. Enter details manually.',
        attachFile: file,
        previewUrl: URL.createObjectURL(file),
        unscannable: true,
      };
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const ocrFile = await canvasToJpegFile(canvas, file.name || 'receipt');
    const previewUrl = URL.createObjectURL(ocrFile);
    const resized = width !== srcW || height !== srcH || ocrFile.size < file.size;
    return {
      ok: true,
      ocrFile,
      attachFile: ocrFile,
      previewUrl,
      width,
      height,
      note: resized
        ? `Photo prepared for OCR (${width}×${height}).`
        : 'Photo attached.',
    };
  } catch (e) {
    try {
      bitmap.close();
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      message: `Could not prepare photo (${e instanceof Error ? e.message : 'error'}). Enter details manually.`,
      attachFile: file,
      previewUrl: URL.createObjectURL(file),
      unscannable: true,
    };
  }
}
