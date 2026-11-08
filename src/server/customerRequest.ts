import { createClient } from '@supabase/supabase-js';
export type CustomerRequest = { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown };
export function requestHeader(req: CustomerRequest, name: string): string {
  const value = req.headers[name]; return Array.isArray(value) ? value[0] || '' : value || '';
}
/** Never trust a customer id supplied by the browser. Verify the bearer token with Auth. */
export async function customerFromRequest(req: CustomerRequest, env: Record<string, string | undefined>) {
  const origin = requestHeader(req, 'origin');
  const allowed = env.WRITEOFF_APP_ORIGIN;
  if (!allowed || origin !== new URL(allowed).origin) throw new Error('Request origin is not allowed.');
  const bearer = requestHeader(req, 'authorization');
  if (!bearer.startsWith('Bearer ') || bearer.length > 8192) throw new Error('Sign in to continue.');
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Customer accounts are not configured.');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(bearer.slice(7));
  if (error || !data.user || data.user.is_anonymous) throw new Error('Sign in to continue.');
  return { ownerId: data.user.id, client };
}
