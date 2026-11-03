#!/usr/bin/env node
/**
 * Lightweight parser checks for browser OCR (no Tesseract runtime).
 */
import assert from 'node:assert/strict';

// Inline mirrors of parse helpers — keep in sync with browserOcr.ts intent.
function parseDateFromText(text) {
  const iso = text.match(/\b(20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const us = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\b/);
  if (us) {
    const [, m, d, y] = us;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function parseTotalFromText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const labeled =
    /(?:total|amount\s*due|balance|grand\s*total|visa|mastercard|paid)\D{0,24}(?:USD\s*)?\$?\s*(\d{1,6}(?:[.,]\d{2}))/i;
  for (const line of lines) {
    const m = line.match(labeled);
    if (m) {
      const n = Number(m[1].replace(',', '.'));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

function parseMerchantFromText(text) {
  const noise =
    /^(tel|phone|www\.|http|receipt|invoice|thank|visa|mastercard|amex|cash|change|subtotal|tax|total|date|time|\d+$)/i;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[^\w\s&'.\-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (line.length < 3 || line.length > 60) continue;
    if (noise.test(line)) continue;
    if (/^\d/.test(line)) continue;
    return line.slice(0, 100);
  }
  return null;
}

const sample = `DEMO COFFEE CO
123 Main St
10/21/2026
Latte        $4.50
Tax          $0.40
TOTAL USD    $4.90
Thank you`;

assert.equal(parseMerchantFromText(sample), 'DEMO COFFEE CO');
assert.equal(parseDateFromText(sample), '2026-10-21');
assert.equal(parseTotalFromText(sample), 4.9);
assert.equal(parseMerchantFromText('TOTAL\n$12.00'), null);
assert.equal(parseDateFromText('no date here'), null);
console.log('PASS  browser-ocr-parse');
