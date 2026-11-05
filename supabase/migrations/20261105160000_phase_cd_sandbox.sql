-- Sandbox bank rows and subscription entitlements.
-- These tables do not connect a live bank or complete a store purchase.
-- Apply only to the Writeoff project. Production data is unchanged by this file alone.

create table if not exists public.bank_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider_id text not null,
  account_label text not null,
  merchant text not null,
  amount_cents integer not null,
  currency text not null default 'USD',
  item_date date not null,
  pending boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, provider_id)
);

create table if not exists public.entitlements (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id text not null,
  state text not null check (state in ('none', 'active', 'grace', 'billing_retry', 'cancelled', 'expired')),
  expires_at timestamptz,
  last_event_id text not null,
  last_event_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists public.entitlement_events (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id text not null,
  event_type text not null,
  event_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.bank_items enable row level security;
alter table public.entitlements enable row level security;
alter table public.entitlement_events enable row level security;

drop policy if exists "bank_items_select_own" on public.bank_items;
create policy "bank_items_select_own" on public.bank_items
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "bank_items_insert_own" on public.bank_items;
create policy "bank_items_insert_own" on public.bank_items
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "bank_items_update_own" on public.bank_items;
create policy "bank_items_update_own" on public.bank_items
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "bank_items_delete_own" on public.bank_items;
create policy "bank_items_delete_own" on public.bank_items
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "entitlements_select_own" on public.entitlements;
create policy "entitlements_select_own" on public.entitlements
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "entitlements_insert_own" on public.entitlements;
create policy "entitlements_insert_own" on public.entitlements
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "entitlements_update_own" on public.entitlements;
create policy "entitlements_update_own" on public.entitlements
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "entitlements_delete_own" on public.entitlements;
create policy "entitlements_delete_own" on public.entitlements
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "entitlement_events_select_own" on public.entitlement_events;
create policy "entitlement_events_select_own" on public.entitlement_events
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "entitlement_events_insert_own" on public.entitlement_events;
create policy "entitlement_events_insert_own" on public.entitlement_events
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "entitlement_events_delete_own" on public.entitlement_events;
create policy "entitlement_events_delete_own" on public.entitlement_events
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.bank_items from anon;
revoke all on public.entitlements from anon;
revoke all on public.entitlement_events from anon;

grant select, insert, update, delete on public.bank_items to authenticated;
grant select, insert, update, delete on public.entitlements to authenticated;
grant select, insert, delete on public.entitlement_events to authenticated;
grant delete on public.profiles to authenticated;
