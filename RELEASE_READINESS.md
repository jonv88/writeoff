# Writeoff — release readiness

Date: 2026-11-05, America/New_York. Branch `cursor/veryfi-live-scan-9e74`. This is a development MVP with a private receipt preview. It is not a web launch and not an App Store or Play release.

## Attempt counter

Read from the private ledger without uploading a photo or calling Veryfi. Count is 3 of 3. No attempts remain. The counter was not reset.

## What a customer can do

On the local preview, without a bank or a subscription:

- Start an empty workspace or load labeled sample expenses.
- Snap or choose a receipt, review merchant, date, and amount, and save.
- Keep an unsaved review, including the photo, in this browser and continue it without sending the photo again. Discard removes both. The photo is in origin-private IndexedDB, not a public URL.
- Review Business, Personal, or Split suggestions. A pharmacy name alone does not become a medical tax suggestion.
- Import a CSV, export a spreadsheet-safe CSV that separates the expense amount, business-use amount, and an eligible amount only when the customer checked it.
- Reset the browser workspace. Signed-in deletion is implemented to run only after the server confirms, and it is separate from canceling a subscription.

On the owner-protected private preview, Veryfi can fill a missing or uncertain field when the receipt text supports it. A physical iPhone confirmed merchant, date, and amount autofill. Save and reload on that phone were not confirmed. No document attempts remain. Recorded responses are not live provider calls.

A customer cannot yet create a cloud account, sync a phone with a desktop, buy a subscription, or install an iOS or Android build. Bank linking stays unavailable on purpose.

## Checked here

- Recorded receipt review still fills merchant, date, and 15.97, and continuing a closed review restores that photo without a second extraction request.
- Postgres row-level security, run in-process and not on Rhev or RHEV Development: a second role cannot read or delete the first customer’s expense, receipt row, or receipt file.
- Stripe test checkout refuses a live secret. A signed test webhook grants access; a bad signature does not. No Stripe API call was made.
- Password recovery UI is ready for a Supabase recovery link. No reset email was sent.

## Not checked

- Hosted sign-up, email verification, password email, cloud save, or phone/desktop sync.
- A browser Stripe checkout or a paid charge.
- Save and reload of the physical iPhone receipt. Merchant, date, and amount autofill were confirmed on that phone.

## Template

`npm run verify:template` matches `reference-template/` to `TEMPLATE_LOCK.json`. Setup gained a Subscription panel and deletion copy in the existing panel, button, and badge styles. Accounts still says bank linking is unavailable and does not show a connected bank.

## Sandbox and blocked

| Area | State |
| --- | --- |
| Receipt amount rules, including a labeled total beside a generic balance | Verified with recorded responses and the review form. Physical iPhone confirmed merchant, date, and amount autofill. |
| Field diagnostic | `structuredTotal` and `reason` are stored even when eight evidence lines fill the note. |
| Bank ingestion rules | Tested in `src/lib/bank/sandboxLedger.ts`. No Plaid call. The Accounts screen stays unavailable. |
| Entitlements | A verified event can be written through an injected store. Hosted rows are not verified. The Setup panel says purchases are unavailable. |
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


## Bank Sandbox implementation — Nov 6, 2026

Built on 69a6ccb, preserving scanner checkpoint 5241bc3. Optional authenticated Plaid Sandbox Link, token exchange, encrypted token persistence, paginated sync, staged transactions, explicit posted-purchase import, confirmed receipt matching, reconnect and disconnect are implemented. Production provider use is refused. Missing credentials return unavailable, never a fake connection.

Local bank tests execute the migration on in-process Postgres and cover RLS isolation, token-column denial, service-only functions, duplicate holds, pending replacement, idempotent import, customer-bound encryption and pagination restart. Build and server typecheck pass. Receipt evidence/OCR/isolation, suggestions, launch checks and reference hashes pass. No live Plaid or Veryfi call, physical-phone bank test, hosted database application or new visual-parity screenshot was performed. Existing scanner files and template bytes are unchanged.

Subscription security: migration revokes customer writes to entitlements/events; checkout now verifies bearer authentication and an exact configured Origin instead of trusting a supplied customer id. These changes must be applied before hosted billing testing.

Not launch-ready: dedicated hosted Writeoff database and Plaid Sandbox/Stripe test credentials are absent. Banks additionally need live Sandbox end-to-end validation, signed update webhooks/scheduling, reconciliation of provider corrections/refunds, account-deletion revocation, production product approval and device OAuth checks. Banks can stay unavailable for a receipt-first web launch. Hosted auth/storage/deletion/billing and native store/device gates remain. No recurring purchase, merge, public-alias move or Production deployment was performed. Setup: docs/BANK_CONNECTION.md.
