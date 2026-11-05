/**
 * Durable count of receipt-processing attempts.
 * A retry counts. The count survives a new server instance.
 */
import { BlobNotFoundError, BlobPreconditionFailedError, get, put } from '@vercel/blob';

const PATH = 'veryfi-iphone-attempts.json';

async function readCount(token: string): Promise<{ count: number; etag?: string }> {
  try {
    const result = await get(PATH, { access: 'private', token, useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return { count: 0 };
    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text) as { count?: unknown };
    const count = Number(parsed.count);
    return {
      count: Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0,
      etag: result.blob.etag,
    };
  } catch (err) {
    if (err instanceof BlobNotFoundError) return { count: 0 };
    throw err;
  }
}

/** Returns true only after one new attempt is stored. Never calls the provider. */
export async function reserveDurableAttempt(token: string, cap: number): Promise<boolean> {
  if (!Number.isFinite(cap) || cap < 1) return false;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await readCount(token);
    if (current.count >= cap) return false;
    try {
      await put(PATH, JSON.stringify({ count: current.count + 1 }), {
        access: 'private',
        token,
        addRandomSuffix: false,
        allowOverwrite: Boolean(current.etag),
        contentType: 'application/json',
        cacheControlMaxAge: 0,
        ...(current.etag ? { ifMatch: current.etag } : {}),
      });
      return true;
    } catch (err) {
      if (err instanceof BlobPreconditionFailedError) continue;
      const message = err instanceof Error ? err.message : '';
      if (/already exists|precondition|conflict|412|409/i.test(message)) continue;
      throw err;
    }
  }
  return false;
}
