import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';

const db = new PGlite();
await db.exec(`
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create schema if not exists storage;
  create table if not exists storage.buckets (
    id text primary key,
    name text,
    public boolean,
    file_size_limit integer,
    allowed_mime_types text[]
  );
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text,
    name text,
    owner uuid
  );
  create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$ select string_to_array(name, '/') $$;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon;
    end if;
  end $$;
  grant usage on schema auth, storage, public to authenticated;
  grant execute on function auth.uid() to authenticated;
  grant execute on function storage.foldername(text) to authenticated;
`);

for (const file of [
  'supabase/migrations/20261102190000_phase_a_foundation.sql',
  'supabase/migrations/20261102220000_phase_b_suggestions.sql',
  'supabase/migrations/20261105160000_phase_cd_sandbox.sql',
]) {
  const sql = readFileSync(file, 'utf8').replace(/create extension if not exists "pgcrypto";\s*/i, '');
  await db.exec(sql);
}

await db.exec(`
  insert into auth.users (id) values ('${userA}'), ('${userB}');
  grant usage on schema public, storage to authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
  alter table public.expenses force row level security;
  alter table public.receipts force row level security;
  alter table public.profiles force row level security;
  alter table public.merchant_rules force row level security;
  alter table storage.objects force row level security;
`);

async function asUser(userId, sql) {
  const result = await db.exec(`
    select set_config('request.jwt.claim.sub', '${userId}', false);
    set role authenticated;
    ${sql};
    reset role;
  `);
  const selected = [...result].reverse().find((item) => Array.isArray(item.rows) && item.fields?.length);
  return selected || { rows: [] };
}

await asUser(
  userA,
  `insert into public.expenses (id, user_id, merchant, amount_cents, expense_date, category)
   values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${userA}', 'Market Street', 1597, '2026-11-04', 'Other')`,
);
await asUser(
  userA,
  `insert into public.receipts (user_id, expense_id, file_name, storage_path)
   values ('${userA}', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'receipt.jpg', '${userA}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/receipt.jpg')`,
);
await asUser(
  userA,
  `insert into storage.objects (bucket_id, name, owner)
   values ('receipts', '${userA}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/receipt.jpg', '${userA}')`,
);

const hiddenExpenses = await asUser(userB, 'select id from public.expenses');
assert.equal(hiddenExpenses.rows.length, 0);
const hiddenReceipts = await asUser(userB, 'select id from public.receipts');
assert.equal(hiddenReceipts.rows.length, 0);
const hiddenFiles = await asUser(userB, "select name from storage.objects where bucket_id = 'receipts'");
assert.equal(hiddenFiles.rows.length, 0);
const deleted = await asUser(
  userB,
  `delete from public.expenses where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning id`,
);
assert.equal(deleted.rows.length, 0);

const own = await asUser(userA, 'select merchant, amount_cents from public.expenses');
assert.equal(own.rows.length, 1);
assert.equal(own.rows[0].merchant, 'Market Street');
assert.equal(Number(own.rows[0].amount_cents), 1597);

const crossInsert = await asUser(
  userB,
  `insert into public.expenses (user_id, merchant, amount_cents, expense_date, category)
   values ('${userA}', 'Stolen', 100, '2026-11-04', 'Other')`,
).then(
  () => 'inserted',
  (error) => error.message,
);
assert.match(String(crossInsert), /row-level security|new row violates/i);

console.log('PASS two-customer RLS: expenses, receipts, and receipt files stay with their owner');
await db.close();
