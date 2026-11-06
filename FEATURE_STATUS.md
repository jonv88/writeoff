# Writeoff — Feature Status

Last updated: 2026-11-05

Legend: **Done** · **Partial** · **Blocked** · **Not started**

## A — Foundation

| Capability | Status | Notes |
| --- | --- | --- |
| Template lock / five screens | Done | `npm run verify:template` |
| Supabase migrations | Done (SQL) | Not applied in this environment. Includes sandbox bank and entitlement tables. |
| Auth / hosted sync | Blocked | jonv88's Universe is already Pro. A new Writeoff project is quoted at $10/month and was not created. Rhev and RHEV Development stay active. |
| Two-customer RLS | Done (local Postgres) | Not applied to a hosted Writeoff project |
| Capacitor iOS | Partial | Config only. This machine has no Xcode |

## B — Receipts and review

| Capability | Status | Notes |
| --- | --- | --- |
| Suggestions, Business / Personal / Split, CSV | Done (client) | Eligible amount stays empty until the customer checks it |
| Snap a receipt, local save/reload, photo draft | Done (browser) | Closing review keeps the photo privately and does not spend an OCR attempt |
| Veryfi evidence totals | Done | Physical iPhone confirmed merchant, date, and amount autofill. Save/reload on that phone was not confirmed. Ledger is 3 of 3. |
| Diagnostics | Done (code) | `structuredTotal` and `reason` survive an eight-line evidence cap |
| Pharmacy categorization | Done | Merchant name alone does not suggest medical |

## C — Banks

| Capability | Status | Notes |
| --- | --- | --- |
| Sandbox ingestion rules | Done (unit) | Pending, posted, duplicate, refund, transfer, and other-customer denial |
| Plaid link and sync | Blocked | `PLAID_CLIENT_ID` and `PLAID_SECRET` are missing. Accounts stays unavailable |
| Production bank linking | Blocked | Not approved and not labeled connected |

## D — Subscriptions

| Capability | Status | Notes |
| --- | --- | --- |
| Entitlement reducer | Done (unit) | Purchase, restore, renew, cancel, grace, billing retry, expire, duplicates, and stale events |
| Store purchase | Blocked | No RevenueCat or App Store credentials. UI shows “No subscription” |
| Account deletion vs cancel | Partial | Cancel does not delete records. Cloud deletion needs the Supabase project |

## Commands

```bash
npm run verify:template
npm run test:suggestions
npm run test:receipt-evidence
npm run test:launch
npm run typecheck
```


## Bank Sandbox implementation — Nov 6, 2026

Built on 69a6ccb, preserving scanner checkpoint 5241bc3. Optional authenticated Plaid Sandbox Link, token exchange, encrypted token persistence, paginated sync, staged transactions, explicit posted-purchase import, confirmed receipt matching, reconnect and disconnect are implemented. Production provider use is refused. Missing credentials return unavailable, never a fake connection.

Local bank tests execute the migration on in-process Postgres and cover RLS isolation, token-column denial, service-only functions, duplicate holds, pending replacement, idempotent import, customer-bound encryption and pagination restart. Build and server typecheck pass. Receipt evidence/OCR/isolation, suggestions, launch checks and reference hashes pass. No live Plaid or Veryfi call, physical-phone bank test, hosted database application or new visual-parity screenshot was performed. Existing scanner files and template bytes are unchanged.

Subscription security: migration revokes customer writes to entitlements/events; checkout now verifies bearer authentication and an exact configured Origin instead of trusting a supplied customer id. These changes must be applied before hosted billing testing.

Not launch-ready: dedicated hosted Writeoff database and Plaid Sandbox/Stripe test credentials are absent. Banks additionally need live Sandbox end-to-end validation, signed update webhooks/scheduling, reconciliation of provider corrections/refunds, account-deletion revocation, production product approval and device OAuth checks. Banks can stay unavailable for a receipt-first web launch. Hosted auth/storage/deletion/billing and native store/device gates remain. No recurring purchase, merge, public-alias move or Production deployment was performed. Setup: docs/BANK_CONNECTION.md.
