import { customerFromRequest } from '../src/server/customerRequest.ts';
import { createSandboxCheckout } from '../src/server/stripeBilling.ts';

type NodeRequest = { method?: string; headers: Record<string, string | string[] | undefined> };
type NodeResponse = { statusCode: number; setHeader(name: string, value: string): void; end(body?: string): void };

function header(req: NodeRequest, name: string): string {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

/** Opens a Stripe test checkout only. Live secret keys are refused. */
export default async function handler(req: NodeRequest, res: NodeResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Send a checkout request.' }));
    return;
  }
  const secret = process.env.STRIPE_SECRET_KEY || '';
  const priceId = process.env.STRIPE_PRICE_ID || '';
  let ownerId: string;
  try { ownerId = (await customerFromRequest(req, process.env)).ownerId; }
  catch { res.statusCode = 401; res.end(JSON.stringify({ error: 'Sign in from Writeoff to continue.' })); return; }
  if (process.env.STRIPE_PRICE_INTERVAL && process.env.STRIPE_PRICE_INTERVAL !== 'month') {
    res.statusCode = 403;
    res.end(JSON.stringify({ error: 'Only the approved monthly price can be checked out.' }));
    return;
  }
  if (!secret || !priceId) {
    res.statusCode = 503;
    res.end(JSON.stringify({ error: 'Sandbox checkout is not configured.' }));
    return;
  }
  try {
    const origin = header(req, 'origin');
    if (!origin) {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: 'Checkout must start from the private preview.' }));
      return;
    }
    const session = await createSandboxCheckout({
      secretKey: secret,
      priceId,
      ownerId,
      successUrl: `${origin}/?checkout=return`,
      cancelUrl: `${origin}/?checkout=cancel`,
    });
    res.statusCode = 200;
    res.end(JSON.stringify({ url: session.url }));
  } catch (error) {
    res.statusCode = 403;
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Checkout was refused.' }));
  }
}
