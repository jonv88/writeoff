# Optional bank Sandbox connection

Based on scanner checkpoint 69a6ccb (scanner behavior 5241bc3). The scanner, approved reference files, public alias, Production and OCR attempt ledger are unchanged.

## Setup

Use a dedicated Writeoff database only. Never use Rhev or RHEV Development. Apply the existing three migrations, then `20261106010000_bank_sandbox_security.sql`. It removes client writes to entitlements and creates service-written bank tables. The service role alone can call sync/import functions. Tokens are AES-256-GCM encrypted with customer-bound authenticated data. Do not rotate BANK_TOKEN_KEY without re-encrypting active tokens.

Set server variables in the isolated Preview: PLAID_ENV=sandbox, PLAID_CLIENT_ID, PLAID_SECRET (Sandbox key), BANK_TOKEN_KEY (32 random bytes base64), WRITEOFF_APP_ORIGIN (exact Preview origin), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Keep all out of VITE variables. Browser Auth uses the existing public Supabase configuration. Obtain Sandbox keys at https://dashboard.plaid.com/developers/keys. No real bank credentials are requested by Writeoff.

Sign in, open Accounts, Connect a test bank. Use Plaid's Sandbox institution and test login. Complete Link, then Sync. Initial sync may return no rows while Plaid prepares history; retry Sync. Import explicitly from staged posted purchases. Resync and repeat import to verify idempotency. Disconnect revokes the provider Item and removes its stored token, while retaining saved expenses. Deleting the signed-in account asks the server to revoke every remaining Sandbox item before other records are removed. If that revoke fails, the records stay. Reconnect opens Link update mode after ITEM_LOGIN_REQUIRED.

## Behavior and limits

Sync saves all pages and cursor atomically. Mutation-during-pagination restarts at the original cursor. A stale concurrent sync is refused rather than dropping updates. Pending/posted replacements do not count twice: pending rows are staged only. Transfers, credits, unknown currencies and removed entries cannot be imported as expenses. A same-currency amount/date candidate already in expenses blocks import for reconciliation; the customer can explicitly match an amount/currency/date candidate. The saved receipt and reviewed choices stay unchanged. No receipt is silently merged or modified. Reviewed classifications, receipts, and typed values are never overwritten by sync.

This is a Sandbox integration, not a verified live bank release. Provider changes after import remain visible in staged history; automatic refund allocation, deleted/modified transaction reconciliation, signed webhook processing, scheduled sync, OAuth bank return, full account-deletion token revocation, production approval and operational limits remain release gates before enabling banks for customers. Bank linking may remain disabled for a receipt-first web launch.

## Verification

Run `npm run test:bank`, typecheck, build, receipt evidence, suggestions, template lock. Local injected responses and in-process Postgres verify protocol behavior and database invariants. These are not a live Plaid Link session or hosted isolation evidence. Real Sandbox connect/sync/reconnect/disconnect requires the credentials above and the dedicated project. No paid project is automatically created.

Official protocol: https://plaid.com/docs/transactions/ and https://plaid.com/docs/link/.
