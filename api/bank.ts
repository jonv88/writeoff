import { customerFromRequest, type CustomerRequest } from '../src/server/customerRequest.ts';
import { bankStore, tokenVault } from '../src/server/bankStore.ts';
import { plaidSandbox, PlaidFailure } from '../src/server/plaidSandbox.ts';
type Response = { statusCode: number; setHeader(name: string, value: string): void; end(body?: string): void };
export default async function handler(req: CustomerRequest, res: Response) {
  res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
  const send = (status: number, value: object) => { res.statusCode = status; res.end(JSON.stringify(value)); };
  if (req.method !== 'POST') return send(405, { error: 'Use POST.' });
  if (process.env.PLAID_ENV !== 'sandbox' || !process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET || !process.env.BANK_TOKEN_KEY) return send(503, { error: 'Bank testing is not configured. Receipt capture remains available.' });
  let customer;
  try { customer = await customerFromRequest(req, process.env); }
  catch { return send(401, { error: 'Sign in from Writeoff to continue.' }); }
  let connectionId = '';
  const store = bankStore(customer.client, customer.ownerId);
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== 'object' || JSON.stringify(body).length > 4096) return send(400, { error: 'Invalid bank request.' });
    const input = body as Record<string, unknown>;
    const provider = plaidSandbox(process.env), vault = tokenVault(process.env.BANK_TOKEN_KEY!);
    connectionId = typeof input.connectionId === 'string' ? input.connectionId : '';
    if (input.action === 'list') {
      const connections = await store.list();
      const { data, error } = await customer.client.from('bank_transactions').select('connection_id,provider_id,merchant,amount_cents,currency,transaction_date,pending,kind,removed,expense_id').eq('user_id', customer.ownerId).or('removed.eq.false,expense_id.not.is.null').order('transaction_date', { ascending: false }).limit(200);
      if (error) throw error;
      return send(200, { environment: 'sandbox', connections, transactions: data });
    }
    if (input.action === 'link') {
      const connection = connectionId ? await store.get(connectionId) : null;
      return send(200, await provider.link(customer.ownerId, connection ? vault.open(connection.encrypted_token, customer.ownerId) : undefined));
    }
    if (input.action === 'exchange' && typeof input.publicToken === 'string') {
      const result = await provider.exchange(input.publicToken);
      try { connectionId = await store.add(result.item_id, vault.seal(result.access_token, customer.ownerId)); }
      catch (error) { await provider.remove(result.access_token).catch(() => undefined); throw error; }
      return send(200, { connectionId });
    }
    if (!connectionId || !/^[0-9a-f-]{36}$/i.test(connectionId)) return send(400, { error: 'Choose a bank connection.' });
    const connection = await store.get(connectionId);
    if (input.action === 'sync') {
      const batch = await provider.sync(vault.open(connection.encrypted_token, customer.ownerId), connection.cursor);
      await store.commit(connectionId, connection.cursor, batch);
      return send(200, { synced: true });
    }
    if (input.action === 'disconnect') {
      await provider.remove(vault.open(connection.encrypted_token, customer.ownerId));
      await store.status(connectionId, 'disconnected');
      return send(200, { disconnected: true });
    }
    if (input.action === 'match' && typeof input.transactionId === 'string' && typeof input.expenseId === 'string') {
      const { error } = await customer.client.rpc('match_bank_transaction', { p_owner: customer.ownerId, p_connection: connectionId, p_transaction: input.transactionId, p_expense: input.expenseId });
      if (error) return send(409, { error: 'That expense cannot be matched. Your records were kept.' });
      return send(200, { matched: true });
    }
    if (input.action === 'import' && typeof input.transactionId === 'string') {
      const { data, error } = await customer.client.rpc('import_bank_transaction', { p_owner: customer.ownerId, p_connection: connectionId, p_transaction: input.transactionId });
      if (error) return send(409, { error: 'This transaction needs reconciliation with an existing expense. It was not imported.' });
      return send(200, { expenseId: data });
    }
    return send(400, { error: 'Unknown bank action.' });
  } catch (error) {
    if (error instanceof PlaidFailure && error.code === 'ITEM_LOGIN_REQUIRED' && connectionId) await store.status(connectionId, 'needs_reconnect').catch(() => undefined);
    return send(502, { error: error instanceof PlaidFailure && error.code === 'ITEM_LOGIN_REQUIRED' ? 'Reconnect this test bank to continue.' : 'Bank request could not finish. Your saved expenses are unchanged.' });
  }
}
