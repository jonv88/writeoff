-- Trigger-only privileged function: never expose it as a callable customer RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Updating a receipt must preserve expense ownership, not merely its path prefix.
drop policy if exists "receipts_update_own" on public.receipts;
create policy "receipts_update_own" on public.receipts
for update to authenticated
using ((select auth.uid()) = user_id)
with check (
 (select auth.uid()) = user_id
 and storage_path like (select auth.uid())::text || '/%'
 and exists(select 1 from public.expenses e where e.id=expense_id and e.user_id=(select auth.uid()))
);
