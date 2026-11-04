#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom' });
try {
  const { parseReceiptText, parseMerchantFromText, parseDateFromText, parseTotalFromText } =
    await server.ssrLoadModule('/src/lib/ocr/browserOcr.ts');
  const fixtures = [
    {
      name: 'ACME-style footer and short transaction date',
      text: 'U a CM .\nOUR Favorite Local Super marke\nStore 1856\nGROC HONEDIBLE\nYOU SAVED 12.00\nSUBTOTAL 14.98\nTAX 1.20\nBALANCE 25.96\n11 / 02 / 26 18:04\nThank you for shopping Acme!\nacmemarkets.com',
      expected: ['ACME', '2026-11-02', 25.96],
    },
    {
      name: 'chain domain and dated transaction',
      text: 'W A L\nSTORE #138\nDELI\nTOTAL 19.90\n11/01/2026 13:30\nVisit www.walmart.com',
      expected: ['Walmart', '2026-11-01', 19.9],
    },
    {
      name: 'independent coffee shop',
      text: 'DEMO COFFEE CO\n123 Main St\n10/21/2026\nLatte $4.50\nTOTAL USD $4.90',
      expected: ['DEMO COFFEE CO', '2026-10-21', 4.9],
    },
    {
      name: 'no reliable merchant and unrelated domain',
      text: 'U a CM .\nOUR Favorite Local Super marke\nGROC HONEDIBLE\nGARDEN SALAD\nBALANCE 25.96\n11/02/26 18:04\nhttps://walmart.com.example.org',
      expected: [null, '2026-11-02', 25.96],
    },
    {
      name: 'restaurant tip — final is amount paid not tip',
      text: 'Riverbend Bistro\nEntree 18.00\nTIP 5.00\nTOTAL 29.30\nAMOUNT PAID 29.30\nNov 3, 2026',
      expected: ['Riverbend Bistro', '2026-11-03', 29.3],
    },
    {
      name: 'savings larger than paid — no largest-number fallback',
      text: 'Greenfield Foods\nYOU SAVED 48.00\nSUBTOTAL 22.00\nAMOUNT DUE 23.76\n11/02/26 09:11\nThank you for shopping at Greenfield Foods',
      expected: ['Greenfield Foods', '2026-11-02', 23.76],
    },
    {
      name: 'no labeled total — amount stays blank',
      text: 'Corner Newsstand\nMagazine 5.99\nCandy 1.25\nWater 2.00\n11/03/2026',
      expected: ['Corner Newsstand', '2026-11-03', null],
    },
    {
      name: 'conflicting totals — amount stays blank',
      text: 'Harbor Market\nTOTAL 12.50\nGRAND TOTAL 15.00\nAMOUNT DUE 11.00\n11/02/2026',
      expected: ['Harbor Market', '2026-11-02', null],
    },
  ];

  for (const { name, text, expected } of fixtures) {
    const result = parseReceiptText(text, 90);
    assert.deepEqual([result.merchant, result.date, result.total], expected, name);
    assert.equal(result.uncertainFields.includes('merchant'), expected[0] === null, name);
    assert.equal(result.uncertainFields.includes('total'), expected[2] == null, `${name} total uncertain`);
    if (expected[2] == null) {
      assert.equal(result.fieldHints?.total, 'Confirm the final amount paid', `${name} amount hint`);
    }
    console.log('PASS', name);
  }

  assert.equal(parseTotalFromText('SUBTOTAL 99.00\nTAX 1.00\nTOTAL 12.50').total, 12.5);
  assert.equal(parseTotalFromText('Magazine 5.99\nCandy 12.00').total, null);
  assert.equal(parseMerchantFromText('Riverbend\nTOTAL 12.00', [
    { text: 'Riverbend', confidence: 95, bbox: { y0: 40, y1: 85 } },
  ], 1000), 'Riverbend');
  assert.equal(parseMerchantFromText('Receipt\nGROC HONEDIBLE\nBALANCE 25.96'), null);
  assert.equal(parseDateFromText('02/30/26\n11/02/26 18:04'), '2026-11-02');
  assert.equal(parseDateFromText('Valid thru 12/31/2026\n2026-11-02'), '2026-11-02');
  assert.equal(parseDateFromText('11/02/26\n11/03/26'), null);
  assert.equal(parseDateFromText('Nov 31, 2026'), null);
  console.log('PASS header geometry, date validation, total evidence rules');
} finally {
  await server.close();
}
