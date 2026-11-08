-- Dedicated Writeoff project only. Service-only writes; clients can read their own rows.
revoke insert, update, delete on public.entitlements, public.entitlement_events from authenticated;
drop policy if exists entitlements_insert_own on public.entitlements;
drop policy if exists entitlements_update_own on public.entitlements;
drop policy if exists entitlements_delete_own on public.entitlements;
drop policy if exists entitlement_events_insert_own on public.entitlement_events;
drop policy if exists entitlement_events_delete_own on public.entitlement_events;

create table public.bank_connections (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 provider_item_id text not null, encrypted_token text, cursor text,
 status text not null default 'connected' check(status in ('connected','needs_reconnect','disconnected')),
 last_synced_at timestamptz, created_at timestamptz not null default now(), unique(user_id,provider_item_id), unique(id,user_id)
);
create table public.bank_transactions (
 connection_id uuid not null, user_id uuid not null references auth.users on delete cascade, provider_id text not null,
 account_id text not null, merchant text not null, amount_cents bigint not null, currency text,
 transaction_date date not null, pending boolean not null, kind text not null,
 removed boolean not null default false, expense_id uuid references public.expenses on delete set null,
 primary key(connection_id,provider_id), foreign key(connection_id,user_id) references public.bank_connections(id,user_id) on delete cascade
);
alter table public.bank_connections enable row level security;
alter table public.bank_transactions enable row level security;
revoke all on public.bank_connections, public.bank_transactions from anon, authenticated;
-- Tokens and cursors are not readable through the client Data API.
grant select(id,user_id,status,last_synced_at,created_at) on public.bank_connections to authenticated;
grant select on public.bank_transactions to authenticated;
create policy bank_connections_read on public.bank_connections for select to authenticated using ((select auth.uid())=user_id);
create policy bank_transactions_read on public.bank_transactions for select to authenticated using ((select auth.uid())=user_id);
grant all on public.bank_connections, public.bank_transactions to service_role;
grant all on public.entitlements, public.entitlement_events to service_role;

-- Entire pagination batch + cursor saved atomically; concurrent stale syncs are rejected.
create function public.commit_bank_sync(p_owner uuid,p_connection uuid,p_expected_cursor text,p_batch jsonb) returns void
language plpgsql security invoker set search_path=public as $$
declare c bank_connections; t jsonb; cents bigint; kind text;
begin
 select * into strict c from bank_connections where id=p_connection and user_id=p_owner for update;
 if c.status='disconnected' or c.cursor is distinct from p_expected_cursor then raise exception 'stale sync'; end if;
 for t in select value from jsonb_array_elements(p_batch->'removed') loop
  update bank_transactions set removed=true where connection_id=p_connection and provider_id=t->>'transaction_id';
 end loop;
 for t in select value from jsonb_array_elements((p_batch->'added') || (p_batch->'modified')) loop
  cents:=round((t->>'amount')::numeric*100)::bigint;
  kind:=case when t->'personal_finance_category'->>'primary' in ('TRANSFER_IN','TRANSFER_OUT','LOAN_PAYMENTS') then 'transfer' when cents<0 then 'credit' else 'purchase' end;
  -- Pending and posted remain staged, never both counted as expenses.
  if t->>'pending_transaction_id' is not null then
   update bank_transactions set removed=true where connection_id=p_connection and provider_id=t->>'pending_transaction_id';
  end if;
  insert into bank_transactions(connection_id,user_id,provider_id,account_id,merchant,amount_cents,currency,transaction_date,pending,kind)
  values(p_connection,p_owner,t->>'transaction_id',t->>'account_id',left(coalesce(nullif(t->>'merchant_name',''),t->>'name'),100),cents,t->>'iso_currency_code',(t->>'date')::date,(t->>'pending')::boolean,kind)
  on conflict(connection_id,provider_id) do update set merchant=excluded.merchant,amount_cents=excluded.amount_cents,currency=excluded.currency,transaction_date=excluded.transaction_date,pending=excluded.pending,kind=excluded.kind,removed=false;
 end loop;
 update bank_connections set cursor=p_batch->>'next_cursor',last_synced_at=now(),status='connected' where id=p_connection;
end $$;
revoke all on function public.commit_bank_sync(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.commit_bank_sync(uuid,uuid,text,jsonb) to service_role;

-- Explicit import only. Potential receipt duplicates stay staged for reconciliation.
create function public.import_bank_transaction(p_owner uuid,p_connection uuid,p_transaction text) returns uuid
language plpgsql security invoker set search_path=public as $$
declare t bank_transactions; result uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 perform 1 from bank_connections where id=p_connection and user_id=p_owner and status<>'disconnected' for update;
 if not found then raise exception 'connection unavailable'; end if;
 select * into strict t from bank_transactions where connection_id=p_connection and provider_id=p_transaction and user_id=p_owner for update;
 if t.expense_id is not null then return t.expense_id; end if;
 if t.pending or t.removed or t.kind<>'purchase' or t.amount_cents<=0 or t.currency is null then raise exception 'not importable'; end if;
 if exists(select 1 from expenses where user_id=p_owner and amount_cents=t.amount_cents and currency=t.currency and abs(expense_date-t.transaction_date)<=3) then raise exception 'possible duplicate'; end if;
 insert into expenses(user_id,merchant,amount_cents,expense_date,category,currency,source,account_label)
 values(p_owner,t.merchant,t.amount_cents,t.transaction_date,'Other',t.currency,'Plaid Sandbox','Sandbox sample · not your bank') returning id into result;
 update bank_transactions set expense_id=result where connection_id=p_connection and provider_id=p_transaction;
 return result;
end $$;
revoke all on function public.import_bank_transaction(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.import_bank_transaction(uuid,uuid,text) to service_role;

create function public.match_bank_transaction(p_owner uuid,p_connection uuid,p_transaction text,p_expense uuid) returns void
language plpgsql security invoker set search_path=public as $$
declare t bank_transactions;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 perform 1 from bank_connections where id=p_connection and user_id=p_owner and status<>'disconnected' for update;
 if not found then raise exception 'connection unavailable'; end if;
 select * into strict t from bank_transactions where connection_id=p_connection and provider_id=p_transaction and user_id=p_owner for update;
 if t.pending or t.removed or t.kind<>'purchase' or t.expense_id is not null then raise exception 'not matchable'; end if;
 perform 1 from expenses where id=p_expense and user_id=p_owner and currency=t.currency and abs(amount_cents-t.amount_cents)<=2 and abs(expense_date-t.transaction_date)<=3 for update;
 if not found then raise exception 'expense mismatch'; end if;
 if exists(select 1 from bank_transactions where user_id=p_owner and expense_id=p_expense and not removed) then raise exception 'already matched'; end if;
 update bank_transactions set expense_id=p_expense where connection_id=p_connection and provider_id=p_transaction;
end $$;
revoke all on function public.match_bank_transaction(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.match_bank_transaction(uuid,uuid,text,uuid) to service_role;
