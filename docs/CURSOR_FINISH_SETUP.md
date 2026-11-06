# Finish Writeoff's private bank Sandbox configuration

## Authorization

The owner authorized completing routine implementation, configuration, tests and isolated Preview deployments without repeated approval. The only approved additional recurring cost is approximately $10/month for the existing Writeoff Micro project. No additional charges, paid services, real banks, account purchases, production releases, public alias changes, PR merges or store submissions are authorized. Spend Cap stays enabled. Do not weaken authentication or disable email verification to pass a test.

User action needed once: after checking out this branch, open Cursor Settings > Tools & MCP and authenticate writeoff-supabase and writeoff-vercel when Needs login appears. If equivalent existing authenticated servers are already available, verify their target and reuse them rather than adding duplicate access. The Supabase URL in .cursor/mcp.json is scoped to Writeoff. Vercel OAuth permissions must be reviewed by the owner; do not broaden an existing grant automatically.

## Exact targets

- Repository: jonv88/writeoff, branch feat/plaid-sandbox, draft PR6. Fetch current head; do not overwrite uncommitted work.
- Supabase: Writeoff, ref bmmoaticogacrsqztafq, organization oaxqxktiifeedoxsbrgp, us-east-1.
- Vercel: writeoff-preview, project prj_l6ICiuLnL2X0jw5ljfCeOvXQLKMs, team team_ArhABluVL02MhbvwzDWacDwZ.
- Only target Preview, restricted to git branch feat/plaid-sandbox.
- Stable origin: https://writeoff-preview-git-feat-plaid-sandbox-jonathan-villanueva8.vercel.app
- Protected: Rhev kifjorbyzgiucqtnfctn, RHEV Development vlvxkviyrhnwyczctjvz. Do not read their secrets or change either project.

## Existing configuration — do not rotate

Verified Preview branch names already present: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, PLAID_ENV, WRITEOFF_APP_ORIGIN, BANK_TOKEN_KEY. PLAID_ENV is sandbox. The bank encryption key is already generated and saved as a sensitive variable. Do not replace it. Do not request these values from the owner again.

All five migrations in docs/APPLY_MIGRATIONS.md have been applied. All app tables have RLS; receipt bucket is private; entitlement writes and encrypted token reads are denied to customers. Security advisors were clear. Hosted two-role SQL tests passed using rolled-back synthetic rows. Do not reapply migrations blindly.

## Finish configuration

1. Verify tools/authentication and resource identity using read-only checks. Stop for owner OAuth/login only if needed. Never claim a tool can change Auth settings or retrieve private keys unless it actually advertises those capabilities.
2. Missing server-only variables: SUPABASE_SERVICE_ROLE_KEY (this name currently accepts the new sb_secret_ server key), PLAID_CLIENT_ID, PLAID_SECRET (Sandbox). Use an already-authorized CLI or signed-in dashboard to transfer Writeoff-only values directly to Vercel's sensitive variables. Never print, echo, screenshot, paste into chat, commit or put secrets in VITE variables. Do not retrieve unrelated secrets. If secret transfer cannot be done securely, ask the owner to enter only the missing values directly in the Vercel form. Never use SQL or an Edge Function to extract platform credentials.
3. In Writeoff Auth URL Configuration, use the stable origin above as Site URL and allow both that origin and that origin + /?type=recovery. Use available management tools or the signed-in browser. Keep email verification enabled. Do not use an immutable deployment URL as the sole redirect/origin because redeploys change it.
4. Before deploying, verify branch variables by presence only and key format without logging values. Confirm server-only secrets are absent from built browser assets. Keep production provider URLs disabled.
5. Deploy the isolated Preview branch and verify its stable alias. Do not move writeoff-preview.vercel.app, change the original scanner preview or promote to Production.
6. Test hosted signup/confirmation/sign-in/session restoration/recovery, a synthetic expense save/reload, private receipt storage, cross-customer denial, and account deletion with explicitly disposable test accounts. Do not use the owner's bank data. Do not invent a test email address that cannot receive confirmation; owner email access or a managed test inbox may be needed.
7. Once Plaid Sandbox keys exist, complete real Sandbox Link -> exchange -> sync -> review/import -> resync -> explicit receipt matching -> reconnect -> disconnect. Use simulated Sandbox accounts, never a real financial login. Verify no duplicate spend, typed/reviewed fields remain, pending/posted replacement works, token revocation succeeds and customer isolation holds. Inspect saved responses through redacted assertions only.
8. Finish independent bank lifecycle work if required: signed webhook/update handling, safe scheduling, provider corrections/refunds and token revocation on hosted account deletion. Keep unverified features honestly disabled. Do not substitute mocked passing tests for a real Sandbox session.
9. Run relevant tests, server/client typecheck, build and immutable template checks. Do not edit scanner logic, pharmacy categorization, receipt drafts or approved template files to accomplish bank configuration. Capture matching viewport UI evidence for Accounts additions.

## Preserve the verified scanner

Scanner checkpoint 5241bc3 and amount fix 7fe1dda must remain. The Veryfi attempt ledger is 3/3: do not upload receipts, reset the counter, enable extra calls or spend more. Production and the public on-device preview stay unchanged. PR1 and PR5 stay open. Do not merge PR6 automatically.

## Report truthfully

Return completed configuration names without values, exact deployment/commit, actual hosted and actual Sandbox test evidence, any failed checks, and remaining owner-only blockers. Continue independent work instead of stopping after a plan. Ask only for missing account access/credentials, acceptance of legal terms, extra spending or final release actions. Do not describe the app as launch-ready until hosted flows and applicable bank/device gates pass.
