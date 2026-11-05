# Writeoff — release readiness

Date: 2026-11-05, America/New_York. Branch `cursor/veryfi-live-scan-9e74`. This is a development MVP with a private receipt preview. It is not an App Store release candidate.

## What a customer can do

On the local preview, without a bank or a subscription:

- Start an empty workspace or load labeled sample expenses.
- Snap or choose a receipt, review merchant, date, and amount, and save.
- Keep an unsaved review as text in this browser and continue or discard it. The photo itself is not kept in that draft.
- Review Business, Personal, or Split suggestions. A pharmacy name alone does not become a medical tax suggestion.
- Import a CSV, export a spreadsheet-safe CSV that separates the expense amount, business-use amount, and an eligible amount only when the customer checked it.
- Reset the browser workspace. Signed-in deletion is implemented to run only after the server confirms, and it is separate from canceling a subscription.

On the owner-protected private preview, Veryfi can fill a missing or uncertain field when the receipt text supports it. One document attempt remains and is reserved for a physical iPhone photo. Recorded responses are not live provider calls.

A customer cannot yet create a cloud account in this environment, connect a bank, buy a subscription, or install an iOS build from this machine.

## Template

`npm run verify:template` matches `reference-template/` to `TEMPLATE_LOCK.json`. Setup gained a Subscription panel and deletion copy in the existing panel, button, and badge styles. Accounts still says bank linking is unavailable and does not show a connected bank.

## Sandbox and blocked

| Area | State |
| --- | --- |
| Receipt amount rules, including a labeled total beside a generic balance | Verified with recorded responses and the review form. Physical iPhone not retested. |
| Field diagnostic | `structuredTotal` and `reason` are stored even when eight evidence lines fill the note. |
| Bank ingestion rules | Tested in `src/lib/bank/sandboxLedger.ts`. No Plaid call. The Accounts screen stays unavailable. |
| Entitlements | Tested reducer only. The Setup panel says purchases are unavailable. No store price is invented. |
| Database ownership | RLS SQL covers customer tables, receipts storage, bank rows, and entitlements. It has not been applied or isolation-tested against a live project here. |
| iOS | Capacitor config exists. This machine has no Xcode. |

## Checks run here

```bash
npm run test:receipt-evidence
npm run test:ocr-parse
npm run test:suggestions
npm run test:launch
npm run verify:template
npm run typecheck
```

Browser, recorded replay only, at `http://127.0.0.1:5181`: amount 15.97 for the retained label pattern, draft continue and discard, a second read of 15.97, save and reload, split-line 17.60, cash rounding 4.92, rewards 12.34, conflicting totals blank, typed 3.33 kept. No live Veryfi POST.

## Result

Development MVP. Not a verified release candidate and not App Store-ready.
