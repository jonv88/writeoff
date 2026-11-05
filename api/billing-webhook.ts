import { applyVerifiedStripeEvent } from '../src/server/stripeBilling.ts';

type NodeRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  [Symbol.asyncIterator]: () => AsyncIterator<Uint8Array | Buffer>;
};
type NodeResponse = { statusCode: number; setHeader(name: string, value: string): void; end(body?: string): void };

/** Verifies a Stripe signature before any entitlement change. Does not grant access from the request body alone. */
export default async function handler(req: NodeRequest, res: NodeResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Stripe events are posted here.' }));
    return;
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!secret) {
    res.statusCode = 503;
    res.end(JSON.stringify({ error: 'Sandbox billing webhooks are not configured.' }));
    return;
  }
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
  const payload = Buffer.concat(chunks).toString('utf8');
  const header = req.headers['stripe-signature'];
  const signature = Array.isArray(header) ? header[0] || '' : header || '';
  try {
    const result = applyVerifiedStripeEvent({
      payload,
      header: signature,
      secret,
      nowSec: Math.floor(Date.now() / 1000),
      productId: process.env.STRIPE_PRODUCT_ID || 'writeoff-sandbox',
      current: null,
    });
    res.statusCode = 200;
    res.end(JSON.stringify({ received: true, state: result.entitlement?.state || 'none' }));
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Stripe event was rejected.' }));
  }
}
