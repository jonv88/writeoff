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
