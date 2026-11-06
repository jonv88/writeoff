# Writeoff database — review before creation

Do not create this project until the $10 monthly price below is approved. Do not pause, transfer, or query Rhev (`kifjorbyzgiucqtnfctn`) or RHEV Development (`vlvxkviyrhnwyczctjvz`). Both stay active.

## Price shown for this account

Read from Supabase `get_cost` for organization `oaxqxktiifeedoxsbrgp` (`jonv88's Universe`):

- Type: project
- Recurrence: monthly
- Amount: **10**

That organization is already on the Pro plan (`tier_pro`). The quote is the additional project. It is not a new Pro subscription. Supabase documents that a Pro organization includes $10 of compute credits, enough for one Micro project, and that each additional project on the default Micro size is about $10 per month, billed by the hour in arrears. Compute is not covered by the spend cap. No invoice total for the existing projects was read.

A Free project cannot be added inside this Pro organization. The two free-project allowance applies to Free-plan organizations. Pausing Rhev is not part of this proposal.

## Exact project configuration

Send this only after approval. No compute upgrade, IPv4 address, point-in-time recovery, custom domain, or read replica.

| Field | Value |
| --- | --- |
| name | `Writeoff` |
| organization_id | `oaxqxktiifeedoxsbrgp` |
| region | `us-east-1` |
| plan | The organization’s existing Pro plan |
| compute | Default Micro, the size in the $10 quote |

`us-east-1` matches the private preview region. Rhev stays in `ca-central-1`.

## Migrations, in order, on the Writeoff ref only

1. `supabase/migrations/20261102190000_phase_a_foundation.sql` — profiles, expenses, receipts, merchant rules, row-level security, private `receipts` bucket
2. `supabase/migrations/20261102220000_phase_b_suggestions.sql` — suggestion and profile columns
3. `supabase/migrations/20261105160000_phase_cd_sandbox.sql` — bank rows, entitlements, entitlement events

`scripts/apply-migrations.sh` lists those files and refuses both Rhev refs. It pushes SQL only. Receipt reading stays on the private preview; do not deploy another OCR function.

## Private Preview configuration

Set these on Vercel project `writeoff-preview`, environment **Preview**, git branch `cursor/veryfi-live-scan-9e74` only. Then redeploy that preview. Do not set them on Production, and do not move `writeoff-preview.vercel.app`.

`VITE_` values are baked into the browser build. The service-role key must never use a `VITE_` name.

| Name | Where it is used |
| --- | --- |
| `VITE_SUPABASE_URL` | Browser. `https://<writeoff-ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser. Publishable or anon key |
| `SUPABASE_URL` | Server. Same project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Webhook entitlement writes |

Auth, in the Writeoff project only:

- Site URL: `https://writeoff-preview-git-cursor-veryfi-80cc29-jonathan-villanueva8.vercel.app`
- Redirect URLs: that origin, and that origin with `/?type=recovery`

## Stripe test mode

Dashboard test mode only. Refuse any key that starts with `sk_live_`.

| Name | Source |
| --- | --- |
| `STRIPE_SECRET_KEY` | Test secret, `sk_test_…` |
| `STRIPE_PRICE_ID` | Test price, `price_…` |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the endpoint below |
| `STRIPE_PRODUCT_ID` | Optional. Defaults to `writeoff-sandbox` |

Webhook endpoint:

`https://writeoff-preview-git-cursor-veryfi-80cc29-jonathan-villanueva8.vercel.app/api/billing-webhook`

Events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.

Checkout must start from that private preview. The signed-in Supabase user id is the Stripe `client_reference_id`. The webhook verifies the signature, then writes `entitlements` and `entitlement_events`. Until the service-role key is set, the webhook answers that entitlements are not stored. No charge is part of this setup.
