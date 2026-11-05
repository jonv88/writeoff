import { handleExtractReceipt } from '../src/server/extractReceiptHandler.ts';

export const config = {
  api: {
    bodyParser: false,
  },
};

type NodeRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  [Symbol.asyncIterator]: () => AsyncIterator<Uint8Array | Buffer>;
};

type NodeResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: Buffer): void;
};

export default async function handler(req: NodeRequest, res: NodeResponse): Promise<void> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
  }
  const body = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  const host = header(req, 'host') || 'localhost';
  const proto = header(req, 'x-forwarded-proto') || 'https';
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(', '));
  }
  const request = new Request(`${proto}://${host}${req.url || '/api/extract-receipt'}`, {
    method: req.method || 'GET',
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  });
  const response = await handleExtractReceipt(request, { env: process.env });
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

function header(req: NodeRequest, name: string): string {
  const value = req.headers[name];
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] || '' : '';
}
