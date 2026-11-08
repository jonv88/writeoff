-- Dollar reservation for OpenAI receipt reads. Existing attempt rows stay.
-- A failed or timed-out read keeps reserved_cents. Customers cannot call these functions.

alter table public.scan_attempts
  add column if not exists provider text not null default 'legacy',
  add column if not exists reserved_cents integer not null default 0,
  add column if not exists outcome text not null default 'reserved',
  add column if not exists model text,
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists image_tokens integer,
  add column if not exists measured_cents integer,
  add column if not exists latency_ms integer,
  add column if not exists http_status integer,
  add column if not exists byte_length integer;

alter table public.scan_attempts drop constraint if exists scan_attempts_provider_check;
alter table public.scan_attempts
  add constraint scan_attempts_provider_check check (provider in ('legacy', 'openai', 'veryfi'));

alter table public.scan_attempts drop constraint if exists scan_attempts_outcome_check;
alter table public.scan_attempts
  add constraint scan_attempts_outcome_check check (outcome in ('reserved', 'completed', 'failed', 'timeout'));

alter table public.scan_attempts drop constraint if exists scan_attempts_reserved_cents_check;
alter table public.scan_attempts
  add constraint scan_attempts_reserved_cents_check check (reserved_cents >= 0);

create or replace function public.reserve_openai_receipt(
  p_owner uuid,
  p_month text,
  p_customer_cap integer,
  p_global_cap integer,
  p_budget_cents integer,
  p_reserve_cents integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  mine integer;
  total integer;
  spent integer;
  new_id uuid;
begin
  if p_month !~ '^[0-9]{4}-[0-9]{2}$' then
    return jsonb_build_object('ok', false, 'reason', 'unconfigured');
  end if;
  if p_customer_cap < 1 or p_customer_cap > 20 or p_global_cap < 1 or p_global_cap > 60 then
    return jsonb_build_object('ok', false, 'reason', 'cap');
  end if;
  if p_budget_cents is null or p_budget_cents < 1 or p_reserve_cents is null or p_reserve_cents < 1 then
    return jsonb_build_object('ok', false, 'reason', 'unconfigured');
  end if;
  if p_budget_cents < p_reserve_cents then
    return jsonb_build_object('ok', false, 'reason', 'budget');
  end if;

  perform pg_advisory_xact_lock(hashtext('writeoff-scan-' || p_month));
  select count(*) into mine from public.scan_attempts where user_id = p_owner and month_key = p_month;
  select count(*) into total from public.scan_attempts where month_key = p_month;
  select coalesce(sum(reserved_cents), 0) into spent from public.scan_attempts where month_key = p_month;
  if mine >= p_customer_cap or total >= p_global_cap then
    return jsonb_build_object('ok', false, 'reason', 'cap');
  end if;
  if spent + p_reserve_cents > p_budget_cents then
    return jsonb_build_object('ok', false, 'reason', 'budget');
  end if;

  insert into public.scan_attempts (user_id, month_key, provider, reserved_cents, outcome)
  values (p_owner, p_month, 'openai', p_reserve_cents, 'reserved')
  returning id into new_id;
  return jsonb_build_object('ok', true, 'attemptId', new_id, 'reservedCents', p_reserve_cents);
end;
$$;

create or replace function public.record_openai_receipt_usage(
  p_attempt uuid,
  p_outcome text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_image_tokens integer,
  p_measured_cents integer,
  p_latency_ms integer,
  p_http_status integer,
  p_byte_length integer
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_outcome not in ('completed', 'failed', 'timeout') then
    return false;
  end if;
  update public.scan_attempts
  set outcome = p_outcome,
      model = left(coalesce(p_model, ''), 64),
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      image_tokens = p_image_tokens,
      measured_cents = p_measured_cents,
      latency_ms = p_latency_ms,
      http_status = p_http_status,
      byte_length = p_byte_length
  where id = p_attempt
    and provider = 'openai';
  return found;
end;
$$;

revoke all on function public.reserve_openai_receipt(uuid, text, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.record_openai_receipt_usage(uuid, text, text, integer, integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_openai_receipt(uuid, text, integer, integer, integer, integer) to service_role;
grant execute on function public.record_openai_receipt_usage(uuid, text, text, integer, integer, integer, integer, integer, integer, integer) to service_role;
