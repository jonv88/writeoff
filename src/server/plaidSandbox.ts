/** Plaid credentials and access tokens must remain on the server. Production is refused. */
export type BankTransaction = {
  transaction_id: string; account_id: string; pending_transaction_id?: string | null;
  name: string; merchant_name?: string | null; amount: number; iso_currency_code?: string | null;
  date: string; pending: boolean; personal_finance_category?: { primary?: string; detailed?: string } | null;
};
export type SyncPage = { added: BankTransaction[]; modified: BankTransaction[]; removed: { transaction_id: string }[]; next_cursor: string; has_more: boolean };
export class PlaidFailure extends Error {
  code: string;
  constructor(code: string) { super('The bank connection could not complete.'); this.code = code; }
}
export function plaidSandbox(env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch) {
  if (env.PLAID_ENV !== 'sandbox' || !env.PLAID_CLIENT_ID || !env.PLAID_SECRET) throw new Error('Plaid Sandbox is not configured.');
  async function call<T>(path: string, body: object): Promise<T> {
    const response = await fetchImpl(`https://sandbox.plaid.com${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Plaid-Version': '2020-09-14' },
      body: JSON.stringify({ client_id: env.PLAID_CLIENT_ID, secret: env.PLAID_SECRET, ...body }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();
    if (!response.ok) throw new PlaidFailure(typeof data.error_code === 'string' ? data.error_code : 'PROVIDER_ERROR');
    return data as T;
  }
  return {
    link(ownerId: string, accessToken?: string) {
      return call<{ link_token: string }>('/link/token/create', {
        user: { client_user_id: ownerId }, client_name: 'Writeoff', country_codes: ['US'], language: 'en',
        ...(accessToken ? { access_token: accessToken } : { products: ['transactions'], transactions: { days_requested: 90 } }),
      });
    },
    exchange(publicToken: string) {
      if (!publicToken.startsWith('public-sandbox-') || publicToken.length > 500) throw new Error('Invalid Sandbox token.');
      return call<{ access_token: string; item_id: string }>('/item/public_token/exchange', { public_token: publicToken });
    },
    remove(accessToken: string) { return call('/item/remove', { access_token: accessToken }); },
    /** Sandbox-only. Moves previously pending dynamic transactions to posted. */
    refresh(accessToken: string) { return call('/transactions/refresh', { access_token: accessToken }); },
    /** Sandbox-only. Forces the next sync to require Link update mode. */
    resetLogin(accessToken: string) { return call('/sandbox/item/reset_login', { access_token: accessToken }); },
    async sync(accessToken: string, startCursor: string | null) {
      // Nothing is committed until every page completes. Mutation restarts at the original cursor.
      for (let attempt = 0; attempt < 3; attempt++) {
        let cursor = startCursor;
        const added: BankTransaction[] = [], modified: BankTransaction[] = [], removed: { transaction_id: string }[] = [];
        try {
          for (let page = 0; page < 100; page++) {
            const result: SyncPage = await call('/transactions/sync', { access_token: accessToken, count: 500, ...(cursor ? { cursor } : {}) });
            added.push(...result.added); modified.push(...result.modified); removed.push(...result.removed);
            if (typeof result.next_cursor !== 'string') throw new Error('Invalid sync response.');
            if (!result.has_more) return { added, modified, removed, next_cursor: result.next_cursor };
            if (result.next_cursor === cursor) throw new Error('Sync cursor did not advance.');
            cursor = result.next_cursor;
          }
          throw new Error('Bank history is too large for this sync.');
        } catch (error) {
          if (!(error instanceof PlaidFailure) || error.code !== 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' || attempt === 2) throw error;
        }
      }
      throw new Error('Bank sync could not finish.');
    },
  };
}
