#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const harness = join(root, 'scripts/suggestion-harness.ts');
const r = spawnSync('npx', ['--yes', 'tsx', harness], {
  cwd: root,
  encoding: 'utf8',
  shell: true,
});
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
process.exit(r.status ?? 1);
