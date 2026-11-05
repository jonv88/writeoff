/**
 * Branch-only owner check for the private receipt preview.
 * The code stays in the deployment environment. It is never sent to the client bundle.
 */

export const OWNER_COOKIE = 'wo_owner';

export function ownerCodeMatches(cookieHeader: string | null, expected: string | undefined): boolean {
  if (!expected) return false;
  return safeEqual(readCookie(cookieHeader, OWNER_COOKIE), expected);
}

export function ownerCookie(code: string, secure: boolean): string {
  const parts = [
    `${OWNER_COOKIE}=${encodeURIComponent(code)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=43200',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export async function handlePreviewAccess(
  request: Request,
  env: { PREVIEW_OWNER_CODE?: string } = {},
): Promise<Response> {
  const expected = env.PREVIEW_OWNER_CODE || '';
  if (request.method === 'GET') {
    if (!expected) return Response.json({ required: false, ok: true });
    const ok = ownerCodeMatches(request.headers.get('cookie'), expected);
    return Response.json({ required: true, ok }, { status: ok ? 200 : 401 });
  }
  if (request.method !== 'POST') {
    return Response.json({ message: 'Send the access code to continue.' }, { status: 405 });
  }
  if (!expected) return Response.json({ message: 'This preview is not open.' }, { status: 503 });
  let code = '';
  try {
    const body = (await request.json()) as { code?: unknown };
    code = typeof body.code === 'string' ? body.code : '';
  } catch {
    code = '';
  }
  if (!safeEqual(code, expected)) {
    return Response.json({ message: 'That access code is not valid.' }, { status: 401 });
  }
  const secure = new URL(request.url).protocol === 'https:';
  return new Response(null, {
    status: 204,
    headers: { 'set-cookie': ownerCookie(code, secure) },
  });
}

function readCookie(header: string | null, name: string): string {
  if (!header) return '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return '';
    }
  }
  return '';
}

function safeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}
