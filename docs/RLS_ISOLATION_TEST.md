# Two-customer isolation checklist (Phase A)

Run after applying `supabase/migrations/20261102190000_phase_a_foundation.sql` and configuring `.env`.

## Steps
1. Create User A and User B (separate emails) via the app sign-up flow.
2. Sign in as A: add an expense, attach a receipt image &lt; 3 MB.
3. Note A’s expense id and receipt storage path (`{uid}/{expenseId}/…`).
4. Sign out; sign in as B.
5. Confirm B’s Review/Expenses lists do **not** show A’s merchant/amount.
6. In the browser console as B (or via SQL as authenticated B), attempt:
   - `select * from expenses` — only B’s rows
   - `select * from receipts` — only B’s rows
   - Storage download of A’s `storage_path` — must fail
7. Sign in as A again — data intact.

## Record
Date, project ref, pass/fail, and any policy advisories from Supabase `get_advisors` → update `FEATURE_STATUS.md`.
