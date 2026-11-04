#!/usr/bin/env node
/**
 * Image OCR eval: photo → parseReceiptText on Tesseract output.
 * Uses fixtures/receipts/ground-truth.json (synthetic PNGs).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorker } from 'tesseract.js';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const label = (process.argv.find((a) => a.startsWith('--label=')) || '--label=images').slice(8);
const outArg = process.argv.find((a) => a.startsWith('--out='));
const outPath = outArg
  ? outArg.slice(6)
  : join(root, 'fixtures/receipts/eval-results', `${label}.json`);

const manifest = JSON.parse(readFileSync(join(root, 'fixtures/receipts/ground-truth.json'), 'utf8'));

function classify(expected, got, field) {
  if (got == null || got === '') {
    return expected == null || expected === '' ? 'correct_blank' : 'blank';
  }
  if (expected == null || expected === '') return 'incorrect';
  if (field === 'total') {
    const e = Number(expected);
    const g = Number(got);
    return Number.isFinite(e) && Number.isFinite(g) && Math.abs(e - g) < 0.02 ? 'correct' : 'incorrect';
  }
  if (field === 'merchant') {
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const en = norm(expected);
    const gn = norm(got);
    return gn === en || gn.includes(en) || en.includes(gn) ? 'correct' : 'incorrect';
  }
  return String(expected) === String(got) ? 'correct' : 'incorrect';
}

const server = await createServer({
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
});

const worker = await createWorker('eng');
try {
  const { parseReceiptText } = await server.ssrLoadModule('/src/lib/ocr/browserOcr.ts');
  const rows = [];
  for (const fx of manifest.fixtures) {
    const path = join(root, 'fixtures/receipts', fx.file);
    const { data } = await worker.recognize(path);
    const result = parseReceiptText(data.text || '', data.confidence || 0, data.lines);
    const row = {
      id: fx.id,
      split: fx.split,
      kind: fx.kind,
      ocrPreview: (data.text || '').replace(/\s+/g, ' ').trim().slice(0, 220),
      confidence: data.confidence,
      expected: { merchant: fx.merchant, date: fx.date, total: fx.total },
      got: { merchant: result.merchant, date: result.date, total: result.total },
      scores: {
        merchant: classify(fx.merchant, result.merchant, 'merchant'),
        date: classify(fx.date, result.date, 'date'),
        total: classify(fx.total, result.total, 'total'),
      },
    };
    rows.push(row);
    console.error(
      `${fx.id}: merchant=${row.scores.merchant} date=${row.scores.date} total=${row.scores.total} got=`,
      row.got,
    );
  }

  function summarize(subset) {
    const out = {};
    for (const f of ['merchant', 'date', 'total']) {
      const counts = { correct: 0, incorrect: 0, blank: 0, correct_blank: 0 };
      for (const r of subset) {
        const s = r.scores[f];
        if (s === 'correct') counts.correct += 1;
        else if (s === 'correct_blank') counts.correct_blank += 1;
        else if (s === 'blank') counts.blank += 1;
        else counts.incorrect += 1;
      }
      const n = subset.length;
      const filled = counts.correct + counts.incorrect;
      out[f] = {
        ...counts,
        n,
        accuracy_among_fills: filled ? counts.correct / filled : null,
        correct_including_blank_ok: (counts.correct + counts.correct_blank) / n,
        incorrect_rate: counts.incorrect / n,
        blank_when_expected_rate: counts.blank / n,
      };
    }
    return out;
  }

  const report = {
    label,
    version: manifest.version,
    engine: 'tesseract.js',
    generatedAt: new Date().toISOString(),
    n: rows.length,
    all: summarize(rows),
    tune: summarize(rows.filter((r) => r.split === 'tune')),
    holdout: summarize(rows.filter((r) => r.split === 'holdout')),
    rows,
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ label, outPath, all: report.all, holdout: report.holdout }, null, 2));
} finally {
  await worker.terminate();
  await server.close();
}
