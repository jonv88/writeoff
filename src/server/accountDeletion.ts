import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteOwnedAccount } from '../lib/account/deletion.ts';
import { bankStore, revokeConnectedTokens, tokenVault } from './bankStore.ts';
import { plaidSandbox, PlaidFailure } from './plaidSandbox.ts';

type Env = Record<string, string | undefined>;

function plaidReady(env: Env): boolean {
  return env.PLAID_ENV === 'sandbox' && Boolean(env.PLAID_CLIENT_ID && env.PLAID_SECRET && env.BANK_TOKEN_KEY);
}

async function deleteRows(client: SupabaseClient, table: string, ownerId: string, optional = false): Promise<void> {
  const { error } = await client.from(table).delete().eq('user_id', ownerId);
  if (!error) return;
  const missing = error.code === '42P01' || error.code === 'PGRST205' || /schema cache|does not exist|Could not find/i.test(error.message || '');
  if (optional && (missing || error.code === '42501')) return;
  throw new Error('Account records could not be removed.');
}

async function removeReceipts(client: SupabaseClient, ownerId: string): Promise<void> {
  const { data, error } = await client.from('receipts').select('storage_path').eq('user_id', ownerId);
  if (error) throw new Error('Receipts could not be removed.');
  const paths = new Set<string>((data || []).map((row: { storage_path: string }) => row.storage_path).filter(Boolean));
  const listed = await client.storage.from('receipts').list(ownerId, { limit: 1000 });
  if (listed.error) throw new Error('Receipt files could not be removed.');
  for (const file of listed.data || []) paths.add(`${ownerId}/${file.name}`);
  if (paths.size) {
    const removed = await client.storage.from('receipts').remove([...paths]);
    if (removed.error) throw new Error('Receipt files could not be removed.');
  }
  await deleteRows(client, 'receipts', ownerId);
}

/** Revokes Sandbox items before records, then closes sessions and removes the Auth identity. */
export async function deleteAuthenticatedCustomer(input: {
  client: SupabaseClient;
  ownerId: string;
  accessToken: string;
  env: Env;
}): Promise<{ revoked: number }> {
  let revoked = 0;
  await deleteOwnedAccount({
    async disconnectProviders(ownerId) {
      try {
        const store = bankStore(input.client, ownerId);
        const rows = await store.connectedTokens();
        if (rows.length && !plaidReady(input.env)) throw new Error('Bank connections were not disconnected. Account records were kept.');
        if (rows.length) {
          const provider = plaidSandbox(input.env);
          const vault = tokenVault(input.env.BANK_TOKEN_KEY!);
          const removed = await revokeConnectedTokens({
            rows, ownerId, open: vault.open,
            remove: async (accessToken) => {
              try { await provider.remove(accessToken); }
              catch (error) { if (!(error instanceof PlaidFailure) || error.code !== 'ITEM_NOT_FOUND') throw error; }
            },
            disconnect: (id) => store.status(id, 'disconnected'),
          });
          revoked = removed.length;
        }
        await store.purge();
      } catch (error) {
        if (error instanceof Error && error.message.includes('were kept')) throw error;
        throw new Error('Bank connections were not disconnected. Account records were kept.');
      }
    },
    async deleteOwned(step, ownerId) {
      if (step === 'delete_receipts') return removeReceipts(input.client, ownerId);
      if (step === 'delete_expenses') return deleteRows(input.client, 'expenses', ownerId);
      if (step === 'delete_rules') return deleteRows(input.client, 'merchant_rules', ownerId);
      if (step === 'delete_bank_items') return deleteRows(input.client, 'bank_items', ownerId, true);
      if (step === 'delete_entitlements') {
        await deleteRows(input.client, 'entitlement_events', ownerId, true);
        await deleteRows(input.client, 'entitlements', ownerId, true);
        return;
      }
      if (step === 'delete_profile') return deleteRows(input.client, 'profiles', ownerId);
      if (step === 'revoke_sessions') {
        const { error } = await input.client.auth.admin.signOut(input.accessToken, 'global');
        if (error) throw new Error('The sign-in session could not be closed.');
        return;
      }
      if (step === 'delete_identity') {
        const { error } = await input.client.auth.admin.deleteUser(ownerId);
        if (error) throw new Error('The sign-in could not be removed.');
      }
    },
  }, input.ownerId);
  return { revoked };
}
