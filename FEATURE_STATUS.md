# Writeoff — Feature Status

Last updated: 2026-11-05

Legend: **Done** · **Partial** · **Blocked** · **Not started**

## A — Foundation

| Capability | Status | Notes |
| --- | --- | --- |
| Template lock / five screens | Done | `npm run verify:template` |
| Supabase migrations | Done (SQL) | Not applied in this environment. Includes sandbox bank and entitlement tables. |
| Auth / live isolation | Blocked | `VITE_SUPABASE_URL` and anon key are missing here |
| Capacitor iOS | Partial | Config only. This machine has no Xcode |

## B — Receipts and review

| Capability | Status | Notes |
| --- | --- | --- |
| Suggestions, Business / Personal / Split, CSV | Done (client) | Eligible amount stays empty until the customer checks it |
| Snap a receipt, local save/reload, text draft | Done (browser) | Photo bytes are not in the text draft |
| Veryfi evidence totals | Done (recorded) | Physical iPhone retest still open. One live attempt reserved |
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
