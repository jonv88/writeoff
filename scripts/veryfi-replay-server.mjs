/**
 * Local recorded-response server for the receipt endpoint.
 * It never calls Veryfi and never reads credentials.
 * The preview deployment does not run this file.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { handleExtractReceipt } from '../src/server/extractReceiptHandler.ts';
import { handlePreviewAccess } from '../src/server/ownerAccess.ts';

const port = Number(process.env.RECEIPT_REPLAY_PORT || 8787);
const delayMs = Number(process.env.RECEIPT_REPLAY_DELAY_MS || 0);
const fixtures = new Map([
  ['gt-no-total-label.png', JSON.parse(readFileSync('fixtures/veryfi-recorded/gt-no-total-label.json', 'utf8'))],
  ['gt-no-total-label.jpg', JSON.parse(readFileSync('fixtures/veryfi-recorded/gt-no-total-label.json', 'utf8'))],
  ['gt-coffee-digital.png', JSON.parse(readFileSync('fixtures/veryfi-recorded/gt-coffee-digital.json', 'utf8'))],
  ['gt-coffee-digital.jpg', JSON.parse(readFileSync('fixtures/veryfi-recorded/gt-coffee-digital.json', 'utf8'))],
  ['gt-conflicting-totals.png', JSON.parse(readFileSync('fixtures/veryfi-recorded/gt-conflicting-totals.json', 'utf8'))],
  ['gt-conflicting-totals.jpg', JSON.parse(readFileSync('fixtures/veryfi-recorded/gt-conflicting-totals.json', 'utf8'))],
]);

const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const host = req.headers.host || `127.0.0.1:${port}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(', '));
  }
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  const request = new Request(`http://${host}${req.url || '/api/extract-receipt'}`, {
    method: req.method || 'GET',
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  });
  const path = new URL(request.url).pathname;
  const response = path === '/api/preview-access'
    ? await handlePreviewAccess(request, process.env)
    : await handleExtractReceipt(request, {
    allowedOrigins: ['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:5174', 'http://localhost:5174', 'http://127.0.0.1:5176', 'http://localhost:5176'],
    selectRecorded(fileName) {
      return fixtures.get(fileName) || null;
    },
  });
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`recorded receipt server http://127.0.0.1:${port}`);
});
