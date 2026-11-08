import { customerFromRequest, requestHeader, type CustomerRequest } from '../src/server/customerRequest.ts';
import { deleteAuthenticatedCustomer } from '../src/server/accountDeletion.ts';

type Response = { statusCode: number; setHeader(name: string, value: string): void; end(body?: string): void };

/** Deletes the signed-in customer: Sandbox items, records, sessions, and the Auth identity. */
export default async function handler(req: CustomerRequest, res: Response) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  const send = (status: number, value: object) => { res.statusCode = status; res.end(JSON.stringify(value)); };
  if (req.method !== 'POST') return send(405, { error: 'Use POST.' });
  let customer;
  try { customer = await customerFromRequest(req, process.env); }
  catch { return send(401, { error: 'Sign in from Writeoff to continue.' }); }
  const bearer = requestHeader(req, 'authorization');
  const accessToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
  let body: unknown;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return send(400, { error: 'Invalid account request.' }); }
  const action = body && typeof body === 'object' ? (body as { action?: unknown }).action : '';
  if (action !== 'delete') return send(400, { error: 'Unknown account action.' });
  try {
    const result = await deleteAuthenticatedCustomer({ client: customer.client, ownerId: customer.ownerId, accessToken, env: process.env });
    return send(200, { deleted: true, revoked: result.revoked });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Account deletion did not finish.';
    const kept = message.includes('were kept');
    return send(kept ? 409 : 500, { error: kept ? message : 'Account deletion did not finish. Sign in again before retrying.' });
  }
}
