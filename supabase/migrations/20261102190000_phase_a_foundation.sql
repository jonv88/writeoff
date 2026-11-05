-- Writeoff Phase A: customer accounts, profiles, expenses, receipts, merchant rules
-- Ownership enforced via RLS. Receipts stored in private Storage bucket.

-- Extensions
create extension if not exists "pgcrypto";

-- Profiles (1:1 with auth.users)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  mode text not null default 'Both' check (mode in ('Both', 'Business', 'Personal')),
  worktype text not null default 'self' check (worktype in ('self', 'employee', 'mixed', 'personal')),
  industry text not null default 'general' check (industry in ('general', 'creative', 'consulting', 'retail', 'trades')),
  country text not null default 'US',
  name text not null default '',
  complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Expenses (integer cents; USD assumed in Phase A UI)
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  merchant text not null check (char_length(merchant) between 1 and 100),
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 99999999900),
  expense_date date not null,
  category text not null,
  use_type text not null default 'Unsorted' check (use_type in ('Business', 'Personal', 'Split', 'Unsorted')),
  business_share integer not null default 0 check (business_share >= 0 and business_share <= 100),
  entity text,
  notes text,
  eligible_percent numeric(6,2) not null default 0 check (eligible_percent >= 0 and eligible_percent <= 100),
  eligibility_checked boolean not null default false,
  reviewed boolean not null default false,
  source text not null default 'Manual expense',
  account_label text,
  fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_user_date_idx on public.expenses (user_id, expense_date desc);
create index if not exists expenses_user_fingerprint_idx on public.expenses (user_id, fingerprint);

-- Receipt metadata (files live in Storage; path must start with owner uid)
create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expense_id uuid not null references public.expenses (id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes integer check (size_bytes is null or (size_bytes > 0 and size_bytes <= 3145728)),
  created_at timestamptz not null default now(),
  unique (expense_id)
);

create index if not exists receipts_user_idx on public.receipts (user_id);

-- Merchant preferences (suggestions only; never silent tax determinations)
create table if not exists public.merchant_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  merchant_key text not null,
  use_type text not null check (use_type in ('Business', 'Personal', 'Split', 'Unsorted')),
  business_share integer not null default 50 check (business_share >= 0 and business_share <= 100),
  category text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, merchant_key)
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.expenses enable row level security;
alter table public.receipts enable row level security;
alter table public.merchant_rules enable row level security;

-- Profiles policies
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Expenses policies
drop policy if exists "expenses_select_own" on public.expenses;
create policy "expenses_select_own" on public.expenses
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "expenses_insert_own" on public.expenses;
create policy "expenses_insert_own" on public.expenses
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "expenses_update_own" on public.expenses;
create policy "expenses_update_own" on public.expenses
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "expenses_delete_own" on public.expenses;
create policy "expenses_delete_own" on public.expenses
  for delete to authenticated using (auth.uid() = user_id);

-- Receipts policies
drop policy if exists "receipts_select_own" on public.receipts;
create policy "receipts_select_own" on public.receipts
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "receipts_insert_own" on public.receipts;
create policy "receipts_insert_own" on public.receipts
  for insert to authenticated with check (
    auth.uid() = user_id
    and storage_path like auth.uid()::text || '/%'
    and exists (
      select 1 from public.expenses e
      where e.id = expense_id and e.user_id = auth.uid()
    )
  );

drop policy if exists "receipts_update_own" on public.receipts;
create policy "receipts_update_own" on public.receipts
  for update to authenticated using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and storage_path like auth.uid()::text || '/%'
  );

drop policy if exists "receipts_delete_own" on public.receipts;
create policy "receipts_delete_own" on public.receipts
  for delete to authenticated using (auth.uid() = user_id);

-- Merchant rules policies
drop policy if exists "rules_select_own" on public.merchant_rules;
create policy "rules_select_own" on public.merchant_rules
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "rules_insert_own" on public.merchant_rules;
create policy "rules_insert_own" on public.merchant_rules
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "rules_update_own" on public.merchant_rules;
create policy "rules_update_own" on public.merchant_rules
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "rules_delete_own" on public.merchant_rules;
create policy "rules_delete_own" on public.merchant_rules
  for delete to authenticated using (auth.uid() = user_id);

-- Private receipts bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies: path must be {uid}/...
alter table storage.objects enable row level security;
drop policy if exists "receipts_storage_select_own" on storage.objects;
create policy "receipts_storage_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "receipts_storage_insert_own" on storage.objects;
create policy "receipts_storage_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "receipts_storage_update_own" on storage.objects;
create policy "receipts_storage_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "receipts_storage_delete_own" on storage.objects;
create policy "receipts_storage_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

-- Revoke anon access to tables (authenticated only via RLS)
revoke all on public.profiles from anon;
revoke all on public.expenses from anon;
revoke all on public.receipts from anon;
revoke all on public.merchant_rules from anon;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.receipts to authenticated;
grant select, insert, update, delete on public.merchant_rules to authenticated;
