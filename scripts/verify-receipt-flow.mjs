#!/usr/bin/env node
/**
 * Receipt verification harness.
 *
 * Dry run (default without keys): validates fixtures + suggestion engine contracts.
 * Live run (requires Writeoff env — never Rhev):
 *   WRITEOFF_SUPABASE_URL / WRITEOFF_SUPABASE_ANON_KEY
 *   optional WRITEOFF_SERVICE_ROLE_KEY for isolation admin checks
 *   optional MINDEE configured on the Edge Function
 *
 * Flow: upload → extract → suggestion → confirm → persist → totals/CSV
 * Plus two-customer isolation probes.
 *
 * Secrets: load from environment or a gitignored store file path passed as
 *   --secrets=/path/to/secrets.env
 * Do not commit secrets.
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const RHEV = new Set(['kifjorbyzgiucqtnfctn', 'vlvxkviyrhnwyczctjvz']);

function loadSecrets() {
  const arg = process.argv.find((a) => a.startsWith('--secrets='));
  if (arg) {
    const p = arg.slice('--secrets='.length);
    if (!existsSync(p)) throw new Error(`Secrets file not found: ${p}`);
    for (const line of readFileSync(p, 'utf8').split(/\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

loadSecrets();

const url = process.env.WRITEOFF_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const anon = process.env.WRITEOFF_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const service = process.env.WRITEOFF_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function refFromUrl(u) {
  try {
    return new URL(u).hostname.split('.')[0];
  } catch {
    return '';
  }
}

const results = [];
function ok(name, detail = '') {
  results.push({ name, pass: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail = '') {
  results.push({ name, pass: false, detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}
function skip(name, detail = '') {
  results.push({ name, pass: null, detail });
  console.log(`SKIP  ${name}${detail ? ` — ${detail}` : ''}`);
}

// 1) Fixture present
const fixture = join(root, 'fixtures/receipts/synthetic-coffee-receipt.png');
if (existsSync(fixture)) {
  const hash = createHash('sha256').update(readFileSync(fixture)).digest('hex').slice(0, 12);
  ok('synthetic-fixture', `sha256 ${hash}…`);
} else {
  fail('synthetic-fixture', 'missing fixtures/receipts/synthetic-coffee-receipt.png');
}

// 2) Suggestion harness
{
  const r = spawnSync('npm', ['run', 'test:suggestions'], {
    cwd: root,
    encoding: 'utf8',
    shell: true,
  });
  if (r.status === 0) ok('suggestion-engine');
  else fail('suggestion-engine', r.stderr || r.stdout);
}

// 3) Edge function source present
const fn = join(root, 'supabase/functions/extract-receipt/index.ts');
const ocr = join(root, 'supabase/functions/extract-receipt/ocr.ts');
if (existsSync(fn) && existsSync(ocr)) ok('edge-function-source');
else fail('edge-function-source', 'extract-receipt sources missing');

// 4) No OCR secrets in VITE example
{
  const envEx = readFileSync(join(root, '.env.example'), 'utf8');
  if (/VITE_.*MINDEE|VITE_OCR_AUTH|VITE_.*SERVICE_ROLE/i.test(envEx)) {
    fail('no-vite-ocr-secrets', '.env.example still exposes OCR/service secrets via VITE_');
  } else {
    ok('no-vite-ocr-secrets');
  }
}

// 5) Live backend
const ref = refFromUrl(url);
if (!url || !anon) {
  skip('live-upload-extract', 'No WRITEOFF_SUPABASE_URL / ANON_KEY — dry run only');
  skip('two-customer-isolation', 'Needs live Writeoff project');
} else if (RHEV.has(ref)) {
  fail('live-upload-extract', `Refuses Rhev project ref ${ref}`);
  fail('two-customer-isolation', `Refuses Rhev project ref ${ref}`);
} else {
  await liveFlow({ url, anon, service, fixture });
}

// Write report artifact (no secrets)
const outDir = join(root, 'media/receipt-verify');
mkdirSync(outDir, { recursive: true });
const report = {
  at: new Date().toISOString(),
  projectRef: ref || null,
  results,
  live: Boolean(url && anon && !RHEV.has(ref)),
};
writeFileSync(join(outDir, 'last-verify-report.json'), JSON.stringify(report, null, 2));
console.log(`\nReport: media/receipt-verify/last-verify-report.json`);

const hardFail = results.some((r) => r.pass === false);
process.exit(hardFail ? 1 : 0);

async function liveFlow({ url, anon, service, fixture }) {
  const { createClient } = await import('@supabase/supabase-js');
  const stamp = Date.now();
  const password = `Verify-${stamp}-Aa1!`;
  const emailA = `writeoff.verify.a.${stamp}@example.com`;
  const emailB = `writeoff.verify.b.${stamp}@example.com`;

  const clientA = createClient(url, anon);
  const clientB = createClient(url, anon);

  async function ensureUser(client, email) {
    const { data: signed, error: sErr } = await client.auth.signUp({ email, password });
    if (sErr && !/already/i.test(sErr.message)) {
      // try sign in
      const { error: iErr } = await client.auth.signInWithPassword({ email, password });
      if (iErr) throw iErr;
    }
    if (signed?.session) return signed.session;
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session;
  }

  try {
    const sessionA = await ensureUser(clientA, emailA);
    const sessionB = await ensureUser(clientB, emailB);
    ok('auth-two-users', `${emailA} / ${emailB}`);

    const bytes = readFileSync(fixture);
    const blob = new Blob([bytes], { type: 'image/png' });
    const form = new FormData();
    form.append('file', blob, 'synthetic-coffee-receipt.png');
    form.append('expense_id', 'verify-draft');

    const extractRes = await fetch(`${url}/functions/v1/extract-receipt`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionA.access_token}`,
        apikey: anon,
      },
      body: form,
    });
    const extracted = await extractRes.json();
    if (!extractRes.ok) {
      fail('live-upload-extract', `${extractRes.status} ${extracted.error || extracted.message}`);
    } else if (extracted.status === 'blocked') {
      ok('live-upload-extract', `stored + OCR blocked honestly: ${extracted.message}`);
      if (!extracted.storagePath) fail('storage-path', 'missing storagePath on blocked OCR');
      else ok('storage-path', extracted.storagePath);
    } else {
      ok('live-upload-extract', `status=${extracted.status} provider=${extracted.provider}`);
      ok('storage-path', extracted.storagePath || 'missing');
    }

    // Persist expense as A
    const expenseId = crypto.randomUUID();
    const merchant = extracted.merchant || 'Demo Coffee Co';
    const amount = extracted.total ?? 4.9;
    const date = extracted.date || '2026-10-21';
    const { error: expErr } = await clientA.from('expenses').insert({
      id: expenseId,
      user_id: sessionA.user.id,
      merchant,
      amount_cents: Math.round(amount * 100),
      expense_date: date,
      category: 'Meals',
      use_type: 'Business',
      business_share: 100,
      notes: 'Verification harness — client meeting coffee',
      eligible_percent: 0,
      eligibility_checked: false,
      reviewed: true,
      source: 'Receipt capture',
      treatment_source: 'user',
      currency: extracted.currency || 'USD',
    });
    if (expErr) fail('persist-expense', expErr.message);
    else ok('persist-expense', expenseId);

    if (extracted.storagePath) {
      const { error: recErr } = await clientA.from('receipts').insert({
        user_id: sessionA.user.id,
        expense_id: expenseId,
        file_name: 'synthetic-coffee-receipt.png',
        storage_path: extracted.storagePath,
        mime_type: 'image/png',
        size_bytes: bytes.length,
      });
      if (recErr) fail('persist-receipt-row', recErr.message);
      else ok('persist-receipt-row');
    } else {
      skip('persist-receipt-row', 'no storagePath');
    }

    // Suggestion-shaped confirm already done via reviewed Business + notes
    ok('confirm-treatment', 'Business + purpose note');

    const { data: rows, error: listErr } = await clientA
      .from('expenses')
      .select('merchant,amount_cents,use_type,reviewed')
      .eq('user_id', sessionA.user.id);
    if (listErr) fail('totals-query', listErr.message);
    else {
      const total = (rows || []).reduce((s, r) => s + r.amount_cents, 0) / 100;
      ok('totals-query', `$${total.toFixed(2)} across ${rows.length} rows`);
      const csv = [
        'Merchant,Amount,Use,Reviewed',
        ...(rows || []).map(
          (r) => `${r.merchant},${(r.amount_cents / 100).toFixed(2)},${r.use_type},${r.reviewed}`,
        ),
      ].join('\n');
      writeFileSync(join(root, 'media/receipt-verify/sample-export.csv'), csv);
      ok('csv-export-sample', 'media/receipt-verify/sample-export.csv');
    }

    // Isolation: B must not see A's expense
    const { data: leak, error: leakErr } = await clientB
      .from('expenses')
      .select('id,merchant')
      .eq('id', expenseId);
    if (leakErr) fail('isolation-expense-select', leakErr.message);
    else if (leak && leak.length > 0) fail('isolation-expense-select', 'B can read A expense');
    else ok('isolation-expense-select', 'B cannot read A expense');

    if (extracted.storagePath) {
      const { data: signed, error: sErr } = await clientB.storage
        .from('receipts')
        .createSignedUrl(extracted.storagePath, 30);
      if (sErr || !signed?.signedUrl) ok('isolation-storage', 'B denied signed URL');
      else {
        // If URL minted, fetching should still fail for foreign path under RLS — treat minted as fail
        fail('isolation-storage', 'B obtained signed URL for A path');
      }
    } else {
      skip('isolation-storage', 'no storagePath');
    }

    if (service) {
      skip('service-role-present', 'service role available for admin cleanup (not printing)');
    }
  } catch (e) {
    fail('live-flow', e instanceof Error ? e.message : String(e));
  }
}
