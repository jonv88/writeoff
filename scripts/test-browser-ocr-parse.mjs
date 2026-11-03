#!/usr/bin/env node
/**
 * Parser checks for browser OCR merchant/date/total heuristics (no Tesseract).
 * Keep logic aligned with src/lib/ocr/browserOcr.ts.
 */
import assert from 'node:assert/strict';

function normalizeMerchantLine(raw) {
  return raw.replace(/[^\w\s&'.\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function isGarbledMerchant(line) {
  const t = line.trim();
  if (t.length < 3) return true;
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  if (letters < 3) return true;
  if (letters / Math.max(t.length, 1) < 0.5) return true;
  const tokens = t.split(/\s+/).filter(Boolean);
  const letterLen = (tok) => (tok.match(/[A-Za-z]/g) || []).length;
  const tiny = tokens.filter((tok) => letterLen(tok) <= 1).length;
  if (tokens.length >= 2 && tiny >= Math.ceil(tokens.length * 0.5)) return true;
  if (/^([A-Za-z]\s+){2,}[A-Za-z]?\.?$/.test(t)) return true;
  const compact = t.replace(/[\s.]+/g, '');
  if (compact.length <= 4 && !/^[A-Z]{2,4}$/.test(compact)) return true;
  return false;
}

function merchantFromWebsite(text) {
  const re =
    /(?:https?:\/\/)?(?:www\.)?([a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?)\.(com|net|org|co|io|shop|store|biz|market)\b/gi;
  const skip = new Set(['mail', 'email', 'support', 'help', 'forms', 'docs', 'google', 'apple']);
  let match;
  while ((match = re.exec(text))) {
    const host = match[1].toLowerCase();
    if (skip.has(host)) continue;
    const parts = host.split(/[-_]+/).filter((p) => p.length > 1);
    if (!parts.length) continue;
    const name = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    if (name.length >= 3 && !isGarbledMerchant(name)) return name.slice(0, 100);
  }
  return null;
}

function scoreMerchantCandidate(line, index) {
  if (isGarbledMerchant(line)) return -1;
  if (/\d+[.,]\d{2}\b/.test(line)) return -1;
  if (/^(subtotal|tax|total|amount|balance|change|cash|card|visa|paid|qty|item)\b/i.test(line)) {
    return -1;
  }
  let score = 0;
  const tokens = line.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) score += 3;
  else if (line.length >= 5) score += 1;
  if (
    /\b(co|inc|llc|ltd|corp|store|market|shop|cafe|coffee|hardware|restaurant|grill|kitchen|bakery|pharmacy|studio)\b/i.test(
      line,
    )
  ) {
    score += 4;
  }
  if (
    /\b(st|street|ave|avenue|rd|road|blvd|blvd\.|suite|ste|apt|floor|fl|way|ln|lane|dr|drive|ct|court|pkwy|parkway)\b/i.test(
      line,
    )
  ) {
    score -= 6;
  }
  if (/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(line)) score -= 8;
  if (/\d{5}(?:-\d{4})?\b/.test(line)) score -= 4;
  if (/^\d+\s/.test(line)) score -= 5;
  if (/\d{3,}/.test(line) && !/\b(co|inc)\b/i.test(line)) score -= 2;
  if (index <= 2) score += 1;
  else if (index <= 6) score += 0.5;
  return score;
}

function parseMerchantFromText(text) {
  const noise =
    /^(tel|phone|fax|www\.|http|https|receipt|invoice|thank|thanks|visa|mastercard|amex|cash|change|subtotal|tax|total|date|time|qty|item|description|\d+$)/i;
  const labeled = text.match(
    /(?:merchant|store|sold\s*by|vendor|business|payee)\s*[:#-]?\s*([^\n]{3,60})/i,
  );
  if (labeled) {
    const cand = normalizeMerchantLine(labeled[1]);
    if (cand && !isGarbledMerchant(cand) && scoreMerchantCandidate(cand, 0) >= 0) {
      return cand.slice(0, 100);
    }
  }
  const candidates = [];
  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = normalizeMerchantLine(raw);
    if (line.length < 3 || line.length > 60) return;
    if (noise.test(line)) return;
    if (/^\d/.test(line)) return;
    if (/^\$?\d/.test(line)) return;
    const score = scoreMerchantCandidate(line, idx);
    if (score < 0) return;
    candidates.push({ line, score, idx });
  });
  candidates.sort((a, b) => b.score - a.score || a.idx - b.idx);
  if (candidates.length && candidates[0].score >= 2) return candidates[0].line.slice(0, 100);
  const fromWeb = merchantFromWebsite(text);
  if (fromWeb) return fromWeb;
  return null;
}

function parseDateFromText(text) {
  const MONTHS = {
    jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
    apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07',
    aug: '08', august: '08', sep: '09', sept: '09', september: '09',
    oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12',
  };
  const named = text.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2})\b/i,
  );
  if (named) {
    const mon = MONTHS[named[1].toLowerCase()];
    if (mon) return `${named[3]}-${mon}-${named[2].padStart(2, '0')}`;
  }
  const us = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\b/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
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

const coffee = `DEMO COFFEE CO
123 Main St
10/21/2026
Latte        $4.50
Tax          $0.40
TOTAL USD    $4.90
Thank you`;
assert.equal(parseMerchantFromText(coffee), 'DEMO COFFEE CO');
assert.equal(parseDateFromText(coffee), '2026-10-21');
assert.equal(parseTotalFromText(coffee), 4.9);

const jonathan = `U a CM .
400 Industrial Way
Nov 2, 2026
Widget kit     $22.00
Tax             $3.95
TOTAL USD      $25.95
Thank you`;
assert.equal(parseMerchantFromText(jonathan), null);
assert.equal(isGarbledMerchant('U a CM .'), true);
assert.equal(parseDateFromText(jonathan), '2026-11-02');
assert.equal(parseTotalFromText(jonathan), 25.95);

const printed = `U a CM .
NORTHSIDE HARDWARE
400 Industrial Way
Nov 2, 2026
TOTAL $25.95`;
assert.equal(parseMerchantFromText(printed), 'NORTHSIDE HARDWARE');

const web = `A C M E
www.northside-hardware.com
Nov 2, 2026
TOTAL $25.95`;
assert.equal(parseMerchantFromText(web), 'Northside Hardware');

assert.equal(parseMerchantFromText('R i v\nTOTAL $12.00\n01/15/2026'), null);
assert.equal(parseMerchantFromText('TOTAL\n$12.00'), null);
assert.equal(parseDateFromText('no date here'), null);

console.log('PASS  browser-ocr-parse');
