-- Service-only monthly scan counter. Customers cannot insert or read other people's attempts.
create table public.scan_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month_key text not null,
  created_at timestamptz not null default now()
);
alter table public.scan_attempts enable row level security;
revoke all on public.scan_attempts from anon, authenticated;
grant all on public.scan_attempts to service_role;

create function public.reserve_scan_attempt(p_owner uuid, p_month text, p_customer_cap integer, p_global_cap integer)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  mine integer;
  total integer;
begin
  if p_customer_cap < 1 or p_global_cap < 1 then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtext('writeoff-scan-' || p_month));
  select count(*) into mine from public.scan_attempts where user_id = p_owner and month_key = p_month;
  select count(*) into total from public.scan_attempts where month_key = p_month;
  if mine >= p_customer_cap or total >= p_global_cap then
    return false;
  end if;
  insert into public.scan_attempts (user_id, month_key) values (p_owner, p_month);
  return true;
end;
$$;

revoke all on function public.reserve_scan_attempt(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_scan_attempt(uuid, text, integer, integer) to service_role;
