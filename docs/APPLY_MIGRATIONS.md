# Writeoff hosted database

Created with product-owner approval at approximately $10/month additional Micro compute. No paid add-ons. Organization Spend Cap was shown enabled in the owner screenshot; it was not changed. Project `bmmoaticogacrsqztafq` is Writeoff in `us-east-1`. Rhev and RHEV Development were not modified.

## Applied and verified

All five migrations below are applied on Writeoff only:

1. `20261102190000_phase_a_foundation.sql`
2. `20261102220000_phase_b_suggestions.sql`
3. `20261105160000_phase_cd_sandbox.sql`
4. `20261106010000_bank_sandbox_security.sql`
5. `20261106050918_hosted_security.sql`

The foundation migration no longer tries to alter the Supabase-owned Storage table; its RLS was already enabled. The older entitlement migration now starts with customer read-only access. Automatic review rejected its former write grants; those grants were removed before applying it. Trigger function execution is revoked from customer roles; receipt updates must retain ownership of the linked expense.

Hosted checks: all nine app tables have RLS, receipt bucket is private, authenticated users cannot insert entitlements or select encrypted bank tokens. A transaction-scoped hosted two-customer fixture checked own-row visibility and cross-customer denial, then rolled back all synthetic rows. Security advisor returned no findings. This is SQL-role evidence, not a browser signup, emailed recovery or phone/desktop sync test.

## Preview configuration

Public URL and publishable key plus server URL are set only for `feat/plaid-sandbox` on Vercel `writeoff-preview`, target Preview. No service-role key has been retrieved or set. The existing scanner preview branch and Production configuration are unchanged. New environment variables require a fresh deployment to take effect.

Pending owner configuration in Writeoff's Auth dashboard: Site URL and allowed redirect URLs for the isolated Preview, including `/?type=recovery`. Do not disable email verification. The available Supabase connector cannot change Auth settings or retrieve server secrets.

Bank server: add a server-only Supabase service-role key, Plaid Sandbox client id/secret, bank encryption key and exact app origin as described in `BANK_CONNECTION.md`. Never use a RHEV key or put a server key under `VITE_`.

Stripe test-mode variables remain required: `STRIPE_SECRET_KEY` (`sk_test_`), `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` for `/api/billing-webhook`. No paid checkout or real bank is enabled.

## Budget

Approved spend is the prior bill plus approximately $10/month for this project. No larger compute, replicas, paid branches, IPv4, custom domains, recovery add-ons or extra provider charges are authorized. Spend Cap covers specified metered usage, not compute/add-ons; it is not an exact overall invoice ceiling. Shared organization quotas mean excess usage may restrict multiple projects. Current screenshot projected $34.97 before Writeoff, about $45 with an additional full month of Micro compute. No protection setting was changed on RHEV.
