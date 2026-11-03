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

function isSloganLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (/^(our|your|welcome(\s+to)?|the\s+best|happily|proudly|simply|always)\b/i.test(t)) {
    return true;
  }
  if (
    /\b(favorite|favourite|local\s+super|everyday\s+low|quality\s+you|best\s+deals|fresh\s+daily|shop\s+local|super\s*marke)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /\b(our|your|favorite|favourite|local|best|fresh|quality|everyday)\b/i.test(t) &&
    /\b(market|marke|store|shop|place|choice|deals|savings|prices|produce|grocer)/i.test(t) &&
    t.split(/\s+/).length >= 3
  ) {
    return true;
  }
  return false;
}

function merchantFromThankYou(text) {
  const patterns = [
    /thank(?:s|\s*you)\s+for\s+shopping\s+(?:at\s+)?([^\n.!?]{3,60})/i,
    /thank(?:s|\s*you)\s+for\s+visiting\s+(?:at\s+)?([^\n.!?]{3,60})/i,
    /thanks\s+for\s+choosing\s+([^\n.!?]{3,60})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    let cand = normalizeMerchantLine(m[1]);
    cand = cand.replace(/\b(today|with\s+us|again)\b/gi, '').replace(/\s+/g, ' ').trim();
    if (!cand || isGarbledMerchant(cand) || isSloganLine(cand)) continue;
    if (scoreMerchantCandidate(cand, 99) < 0) continue;
    return cand.slice(0, 100);
  }
  return null;
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
    if (name.length >= 3 && !isGarbledMerchant(name) && !isSloganLine(name)) return name.slice(0, 100);
  }
  return null;
}

const STORE_ENTITY =
  /\b(co|inc|llc|ltd|corp|store|market|shop|cafe|coffee|hardware|restaurant|grill|kitchen|bakery|pharmacy|studio|grocer(?:y|ies)?|foods|mart)\b/i;

function scoreMerchantCandidate(line, index) {
  if (isGarbledMerchant(line)) return -1;
  if (isSloganLine(line)) return -1;
  if (/\d+[.,]\d{2}\b/.test(line)) return -1;
  if (/^(subtotal|tax|total|amount|balance|change|cash|card|visa|paid|qty|item)\b/i.test(line)) {
    return -1;
  }
  let score = 0;
  const tokens = line.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) score += 3;
  else if (line.length >= 5) score += 1;
  if (STORE_ENTITY.test(line)) score += 4;
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

function isStrongStoreName(line) {
  if (isSloganLine(line) || isGarbledMerchant(line)) return false;
  if (STORE_ENTITY.test(line) && line.split(/\s+/).length >= 2) return true;
  if (
    /^[A-Z0-9][A-Z0-9\s&'.-]{3,}$/.test(line) &&
    line.split(/\s+/).length >= 2 &&
    !/^(OUR|YOUR|THE)\b/.test(line)
  ) {
    return true;
  }
  return false;
}

function parseMerchantFromText(text) {
  const noise =
    /^(tel|phone|fax|www\.|http|https|receipt|invoice|thank|thanks|visa|mastercard|amex|cash|change|subtotal|tax|total|date|time|qty|item|description|\d+$)/i;
  const labeled = text.match(
    /(?:merchant|store|sold\s*by|vendor|business|payee)\s*[:#-]?\s*([^\n]{3,60})/i,
  );
  if (labeled) {
    const cand = normalizeMerchantLine(labeled[1]);
    if (
      cand &&
      !isGarbledMerchant(cand) &&
      !isSloganLine(cand) &&
      scoreMerchantCandidate(cand, 0) >= 0
    ) {
      return cand.slice(0, 100);
    }
  }
  const fromThanks = merchantFromThankYou(text);
  if (fromThanks) return fromThanks;
  const fromWeb = merchantFromWebsite(text);
  if (fromWeb) return fromWeb;

  const candidates = [];
  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = normalizeMerchantLine(raw);
    if (line.length < 3 || line.length > 60) return;
    if (noise.test(line)) return;
    if (/^\d/.test(line)) return;
    if (/^\$?\d/.test(line)) return;
    if (isSloganLine(line)) return;
    const score = scoreMerchantCandidate(line, idx);
    if (score < 0) return;
    if (!isStrongStoreName(line) && score < 5) return;
    candidates.push({ line, score, idx });
  });
  candidates.sort((a, b) => b.score - a.score || a.idx - b.idx);
  if (candidates.length && (isStrongStoreName(candidates[0].line) || candidates[0].score >= 5)) {
    return candidates[0].line.slice(0, 100);
  }
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

// Slogan must not become merchant; footer thank-you wins; keep $25.96 / Nov 2, 2026
const sloganFooter = `U a CM .
OUR Favorite Local Super marke
400 Industrial Way
Nov 2, 2026
Produce         $12.00
Dairy            $8.50
Tax              $5.46
TOTAL USD       $25.96
Thank you for shopping at Greenfield Foods`;
assert.equal(isSloganLine('OUR Favorite Local Super marke'), true);
assert.equal(parseMerchantFromText(sloganFooter), 'Greenfield Foods');
assert.equal(parseDateFromText(sloganFooter), '2026-11-02');
assert.equal(parseTotalFromText(sloganFooter), 25.96);

// Slogan alone (no footer / site) → blank merchant, keep total/date
const sloganOnly = `OUR Favorite Local Super marke
Nov 2, 2026
TOTAL $25.96`;
assert.equal(parseMerchantFromText(sloganOnly), null);
assert.equal(parseDateFromText(sloganOnly), '2026-11-02');
assert.equal(parseTotalFromText(sloganOnly), 25.96);

assert.equal(parseMerchantFromText('R i v\nTOTAL $12.00\n01/15/2026'), null);
assert.equal(parseMerchantFromText('TOTAL\n$12.00'), null);
assert.equal(parseDateFromText('no date here'), null);

console.log('PASS  browser-ocr-parse');
