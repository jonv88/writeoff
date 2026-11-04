#!/usr/bin/env node
/**
 * Per-field receipt parse eval against fixtures/receipts/ground-truth-text.json.
 * Reports correct / incorrect / blank for merchant, date, total.
 * Holdout split is never used for tuning decisions in-code — report only.
 *
 * Usage:
 *   node scripts/eval-receipt-reliability.mjs
 *   node scripts/eval-receipt-reliability.mjs --label=before --out=/path/to.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const label = (process.argv.find((a) => a.startsWith('--label=')) || '--label=run').slice(8);
const outArg = process.argv.find((a) => a.startsWith('--out='));
const outPath = outArg
  ? outArg.slice(6)
  : join(root, 'fixtures/receipts/eval-results', `${label}.json`);

const manifest = JSON.parse(
  readFileSync(join(root, 'fixtures/receipts/ground-truth-text.json'), 'utf8'),
);

function classify(expected, got, field) {
  if (got == null || got === '') {
    return expected == null || expected === '' ? 'correct_blank' : 'blank';
  }
  if (expected == null || expected === '') {
    return 'incorrect'; // filled when should be blank
  }
  if (field === 'total') {
    const e = Number(expected);
    const g = Number(got);
    return Number.isFinite(e) && Number.isFinite(g) && Math.abs(e - g) < 0.005
      ? 'correct'
      : 'incorrect';
  }
  if (field === 'merchant') {
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    return norm(expected) === norm(got) ? 'correct' : 'incorrect';
  }
  return String(expected) === String(got) ? 'correct' : 'incorrect';
}

const server = await createServer({
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
});

try {
  const { parseReceiptText } = await server.ssrLoadModule('/src/lib/ocr/browserOcr.ts');
  const rows = [];
  for (const fx of manifest.fixtures) {
    const result = parseReceiptText(fx.text, 90);
    const row = {
      id: fx.id,
      split: fx.split,
      expected: { merchant: fx.merchant, date: fx.date, total: fx.total },
      got: {
        merchant: result.merchant,
        date: result.date,
        total: result.total,
        fieldHints: result.fieldHints || null,
        uncertainFields: result.uncertainFields,
      },
      scores: {
        merchant: classify(fx.merchant, result.merchant, 'merchant'),
        date: classify(fx.date, result.date, 'date'),
        total: classify(fx.total, result.total, 'total'),
      },
    };
    rows.push(row);
  }

  function summarize(subset) {
    const fields = ['merchant', 'date', 'total'];
    const out = {};
    for (const f of fields) {
      const counts = { correct: 0, incorrect: 0, blank: 0, correct_blank: 0 };
      for (const r of subset) {
        const s = r.scores[f];
        if (s === 'correct') counts.correct += 1;
        else if (s === 'correct_blank') counts.correct_blank += 1;
        else if (s === 'blank') counts.blank += 1;
        else counts.incorrect += 1;
      }
      const n = subset.length;
      const filledCorrect = counts.correct;
      const filledIncorrect = counts.incorrect;
      const filled = filledCorrect + filledIncorrect;
      out[f] = {
        ...counts,
        n,
        accuracy_among_fills: filled ? filledCorrect / filled : null,
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
    generatedAt: new Date().toISOString(),
    n: rows.length,
    all: summarize(rows),
    tune: summarize(rows.filter((r) => r.split === 'tune')),
    holdout: summarize(rows.filter((r) => r.split === 'holdout')),
    rows,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ label, outPath, all: report.all, tune: report.tune, holdout: report.holdout }, null, 2));
} finally {
  await server.close();
}
