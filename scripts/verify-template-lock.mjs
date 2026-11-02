#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(readFileSync(join(root, 'TEMPLATE_LOCK.json'), 'utf8'));
const sums = readFileSync(join(root, 'reference-template', 'SHA256SUMS'), 'utf8')
  .trim()
  .split('\n')
  .map((line) => line.trim().split(/\s+/))
  .reduce((acc, [hash, file]) => {
    acc[file] = hash;
    return acc;
  }, {});

let failed = false;
for (const [file, expected] of Object.entries(lock.sha256)) {
  const bytes = readFileSync(join(root, 'reference-template', file));
  const actual = createHash('sha256').update(bytes).digest('hex');
  const sumsExpected = sums[file];
  const ok = actual === expected && actual === sumsExpected;
  console.log(`${ok ? 'OK' : 'MISMATCH'}  ${file}`);
  console.log(`  lock: ${expected}`);
  console.log(`  sums: ${sumsExpected}`);
  console.log(`  file: ${actual}`);
  if (!ok) failed = true;
}

if (failed) {
  console.error('\nTemplate lock verification failed. Stop and restore reference-template/.');
  process.exit(1);
}
console.log('\nAll reference-template hashes match TEMPLATE_LOCK.json and SHA256SUMS.');
