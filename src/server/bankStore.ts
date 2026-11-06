import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
export function tokenVault(encodedKey: string) {
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32) throw new Error('Bank token encryption is not configured.');
  return {
    seal(token: string, ownerId: string) {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(ownerId));
      const text = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
      return [iv, cipher.getAuthTag(), text].map(v => v.toString('base64')).join('.');
    },
    open(value: string, ownerId: string) {
      const parts = value.split('.').map(v => Buffer.from(v, 'base64'));
      if (parts.length !== 3) throw new Error('Invalid bank token.');
      const cipher = createDecipheriv('aes-256-gcm', key, parts[0]);
      cipher.setAAD(Buffer.from(ownerId)); cipher.setAuthTag(parts[1]);
      return Buffer.concat([cipher.update(parts[2]), cipher.final()]).toString('utf8');
    },
  };
}
/** Revoke each provider item before its stored token is cleared. A failed revoke leaves that token in place. */
export async function revokeConnectedTokens(input: {
  rows: { id: string; encrypted_token: string }[];
  ownerId: string;
  open: (value: string, ownerId: string) => string;
  remove: (accessToken: string) => Promise<unknown>;
  disconnect: (id: string) => Promise<void>;
}): Promise<string[]> {
  const removed: string[] = [];
  for (const row of input.rows) {
    await input.remove(input.open(row.encrypted_token, input.ownerId));
    await input.disconnect(row.id);
    removed.push(row.id);
  }
  return removed;
}
export function bankStore(client: SupabaseClient, ownerId: string) {
  return {
    async list() {
      const { data, error } = await client.from('bank_connections').select('id,status,last_synced_at').eq('user_id', ownerId).order('created_at');
      if (error) throw new Error('Bank connections could not be read.'); return data || [];
    },
    async get(id: string) {
      const { data, error } = await client.from('bank_connections').select('*').eq('id', id).eq('user_id', ownerId).single();
      if (error || !data || data.status === 'disconnected') throw new Error('Bank connection was not found.'); return data;
    },
    async add(itemId: string, token: string) {
      const { data, error } = await client.from('bank_connections').upsert({ user_id: ownerId, provider_item_id: itemId, encrypted_token: token, status: 'connected' }, { onConflict: 'user_id,provider_item_id' }).select('id').single();
      if (error || !data) throw new Error('Bank connection could not be saved.'); return data.id as string;
    },
    async commit(id: string, cursor: string | null, batch: unknown) {
      const { error } = await client.rpc('commit_bank_sync', { p_owner: ownerId, p_connection: id, p_expected_cursor: cursor, p_batch: batch });
      if (error) throw new Error('Bank sync was not saved. Refresh and retry.');
    },
    async connectedTokens() {
      const { data, error } = await client.from('bank_connections').select('id,encrypted_token').eq('user_id', ownerId).neq('status', 'disconnected').not('encrypted_token', 'is', null);
      if (error) throw new Error('Bank connections could not be read.');
      return (data || []).filter((row): row is { id: string; encrypted_token: string } => typeof row.encrypted_token === 'string' && row.encrypted_token.length > 0);
    },
    async status(id: string, status: string) {
      const { error } = await client.from('bank_connections').update({ status, ...(status === 'disconnected' ? { encrypted_token: null } : {}) }).eq('id', id).eq('user_id', ownerId);
      if (error) throw new Error('Bank status could not be saved.');
    },
  };
}
