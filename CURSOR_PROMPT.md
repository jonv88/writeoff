# WRITEOFF — BUILD THE SUBSCRIPTION APP; PRESERVE THIS EXACT TEMPLATE

MODE: AGENT — implementation, with phased verification.

## Product-owner instruction

I am creating Writeoff to release in Apple's App Store and sell subscriptions to customers. This is NOT a personal finance project just for me. Do not request or use my personal banking information, financial history, connected ChatGPT accounts, or personal profile as application configuration or seed data.

**The supplied app IS the approved visual template. Keep this exact template. Do not redesign it.**

Read START_HERE.md, AGENTS.md, `.cursor/rules/preserve-template.mdc`, TEMPLATE_LOCK.json, and all three files in `reference-template/` before implementation. Treat the source files as authoritative; the deployed preview is supplemental. If the exact reference files are missing or their hashes do not match, stop and report the missing/mismatched files. Do not invent a replacement template.

Create a real customer-facing application from this prototype, preserving its visual identity while replacing browser-only storage and unavailable integration states with working, tested features. Work on local/dev environments. Do not submit to the App Store, incur charges, purchase services, use live customer banking credentials, change production data, or publish a new production release without separate authorization.

## 1. Mandatory design lock

Preserve the existing Writeoff presentation:
- lowercase `writeoff.` wordmark and dark green rounded `w` mark;
- warm off-white background, white panels, forest green primary buttons, sage accents, muted supporting text, subtle borders and rounded corners;
- Manrope headings and DM Sans body typography; preserve weights, letter spacing, sizes and hierarchy;
- desktop sidebar, workspace breadcrumb/header, current content width and spacing, heading/action arrangement;
- the exact Review, Expenses, Receipts, Accounts and Setup navigation and their visual hierarchy;
- review summary cards, suggestion cards, Business / Personal / Split actions, expense table, receipt cards, dialogs, setup form and mobile responsive treatment;
- existing restrained, friendly product voice. Keep technical implementation details out of customer flows.

The source CSS and structure are the starting point, not inspiration. Do not substitute a UI kit's defaults, dashboard generator, generic finance template, new colors, new fonts, new branding, flashy gradients, illustrations, landing page, extra tabs or a different navigation shell. A React/TypeScript migration must retain the source DOM structure and CSS appearance wherever practical. Do not let a reset stylesheet change the baseline.

New functionality must use the same design tokens, panel styles, spacing, controls and dialog patterns. Adapt for safe areas, keyboard, touch, accessibility and native iOS behavior with the smallest necessary visual change. Functional state copy may change truthfully (for example, 'Connected' after actual provider success). Keep the surrounding layout and style.

Keep `reference-template/` immutable. Preserve its hashes and an independently reproducible reference preview. Capture the unmodified template at 375×812, 390×844, 768×1024 and 1440×900 before changing application code. Use deterministic synthetic fixtures outside the reference source to exercise populated states. Compare the new app with the reference at matching viewport, content, font-loading and scroll states. For unchanged UI, correct visual differences instead of updating the baseline to make a test pass. Record approved additions separately.

## 2. Product objective

Make tracking possible write-offs feel like a short review, not bookkeeping homework:
1. Create an account and complete a brief setup.
2. Choose any starting path: snap a receipt, select an existing receipt photo/PDF, connect a bank/card, or import a statement. No bank account is required to use receipt capture.
3. See transactions in a simple review inbox.
4. See an understandable suggestion and why it was made.
5. Choose Business, Personal or Split; add minimal context when necessary.
6. Photograph a receipt on the phone for immediate processing, review the extracted details and save an expense; match existing bank transactions without creating duplicate expenses.
7. Export clear records for an accountant.

Do not equate 'business', a merchant category, a bank account type, a receipt, or a saved preference with tax deductibility. Clearly distinguish possible records, use reviewed by the customer, and eligible amounts explicitly checked by the customer or their tax professional.

Initial tax-suggestion scope: United States. Do not claim complete support for every entity type, state, tax year or country. Identify unsupported contexts plainly; retain useful record keeping.

## 3. First inspect and establish the baseline

Before coding:
- Inspect the repository and any applicable instructions. Do not overwrite unrelated work.
- Verify reference-template hashes against TEMPLATE_LOCK.json and SHA256SUMS.
- Report what actually exists and what is missing. The supplied prototype has no backend, live bank sync, OCR or subscription system.
- Create IMPLEMENTATION_PLAN.md, FEATURE_STATUS.md and DESIGN_PARITY.md with concrete phases, current state, dependencies and verification steps.
- Initialize a clean project structure with `.env.example`, appropriate ignores, migrations, setup instructions and a runnable reference preview. Never commit secrets, generated personal data or provider access tokens.
- Preserve the original template unchanged and migrate functionality incrementally.

Proceed with authorized local implementation rather than stopping after a plan. Ask only for a material product choice that cannot safely be inferred. Complete all independent work before reporting a credential, platform or approval blocker. Do not call a phase complete based only on mock responses.

## 4. Architecture and delivery target

Default implementation, unless the existing repo already has a compatible established stack:
- React + TypeScript + Vite for the application UI.
- Capacitor for the iOS application shell so the approved web template can remain visually faithful.
- Supabase Auth, Postgres and private Storage for customer accounts, records and receipts.
- Server-side functions/API routes for bank-provider operations, receipt OCR/extraction and subscription validation. Keep service credentials server-side.
- Plaid Transactions behind a provider adapter for bank/card linking and synchronization; use Sandbox during development. Reconfirm current official requirements and available products before integrating. A different provider needs a documented reason and product-owner agreement.
- StoreKit-compatible subscription handling, with RevenueCat as the default entitlement adapter if suitable. Recheck current Apple/SDK requirements and avoid outdated API patterns. Never assume external web billing is acceptable for an in-app subscription.
- Backend, bank and entitlement adapters so the UI is not coupled to one vendor.

Use current official documentation for provider APIs and App Store requirements. Document meaningful architecture decisions. Do not introduce extra frameworks/services for speculative future features.

A Capacitor wrapper and a successful web build do not establish App Store readiness. Account for native functionality, signed-in state, safe areas, keyboard, camera/file access, accessibility, subscription lifecycle and real-device testing. Record the Apple tooling and developer-account steps that require the owner.

## 5. Customer onboarding and accounts

Implement sign-up, sign-in, sign-out, email verification, password reset, session restoration, authenticated routes and useful loading/error states. Use established secure SDK flows; do not implement ad hoc auth.

Brief setup:
- Personal, Business or Both.
- Work arrangement: self-employed / business owner, employee or both.
- Business/activity name and industry only when useful.
- Country and relevant tax-year context.

Support separate business/activity profiles for customers with multiple income streams, with expenses assigned to the appropriate profile. Do not silently apply sole-proprietor treatment to a corporation, partnership or employee. Keep account creation short; collect details progressively.

Store records per authenticated customer. Enforce ownership in the database and every server endpoint. Test that one customer cannot read or mutate another's expenses, receipts, connections, rules, exports or entitlements.

Implement data export and account-deletion flows, including linked-provider disconnection and receipt/data cleanup with truthful retention information. Do not confuse subscription cancellation with account deletion.

## 6. Bank and card connections — real integration, honest states

Each subscriber must be able to connect THEIR OWN supported institution/account through the provider's official flow. Do not embed the creator's ChatGPT Finances connection. Do not ask customers to enter bank credentials directly into Writeoff.

Implement:
- authenticated server-created link tokens;
- official provider link flow and server-side public-token exchange;
- protected per-customer connection records and encrypted/restricted token storage;
- account selection and user-assigned Personal / Business / Mixed labels;
- initial transaction sync, pagination/cursors and incremental updates;
- idempotent transaction ingestion using provider IDs;
- added/modified/removed transactions, pending-to-posted reconciliation and webhook validation;
- reconnect/expired-consent states, disconnect, deletion and permission revocation;
- last successful sync time and honest available-history/coverage messaging;
- scheduled sync only through supported backend infrastructure, not an open-tab timer;
- proper handling of currencies, credits/refunds, payments/transfers and duplicate imports.

A transfer/card payment is not a new expense simply because money left an account. A refund should not inflate spend. Pending transactions must not double-count after posting. Preserve customer classifications when provider details are updated, and flag material changes for review.

Persist neither bank passwords nor raw access tokens in the browser, logs, analytics, exports or source control. Validate all server inputs and ownership. Apply appropriate rate limits and avoid unnecessary sensitive data collection.

If production approval or credentials are missing, finish Sandbox integration and test it. Production stays visibly unavailable. Never label sandbox fixtures as a real bank, display a false 'connected' status, or claim successful synchronization without returned data. Write precise outstanding requirements to FEATURE_STATUS.md.

## 7. Low-effort review and possible write-offs

Preserve the approved Review screen and enhance its existing interactions:
- primary task: 'You have N expenses to review';
- large Business / Personal / Split actions;
- reasonable category/use suggestions with plain-language reasoning;
- save confirmed merchant preferences with customer opt-in;
- safe undo and easy corrections;
- progress persisted across sessions/devices;
- receipt missing states and useful purpose notes;
- no repeated questions when existing confirmed information is sufficient.

Start with transparent, versioned merchant/category rules. No AI claims unless an actual configured model is used. Suggestions consider activity, employee/self-employed status, jurisdiction, purchase category, purpose and split use. They must not convert an ambiguous purchase into a certain deduction.

Handle ordinary personal spending, commuting, mixed travel, meals, education, equipment/capital treatment, home office, medical records, charitable giving, reimbursements and employee expenses conservatively. Consult current primary tax sources and attach source/version/effective-tax-year metadata to rules. Mark ambiguous contexts as needing information or professional review; do not apply a generic 100% business deduction or a fixed meal percentage to every transaction.

Keep separate fields for full expense amount, business-use percentage, reviewed use, proposed tax category, eligibility-review state and explicitly checked eligible amount. Use integer cents/decimal-safe arithmetic with currency codes. Personal medical/donation records are not automatically business deductions. A candidate expense total is not tax savings or a deduction total.

Minimize input without losing correctness. Remember use/category, not an irreversible determination that every purchase from a merchant qualifies. Allow deleting preferences.

## 8. Receipt-first capture, imports, exports and migration


### A primary path: Snap a receipt

Receipt capture must work independently of bank linking and subscriptions setup. A new customer should be able to capture an expense without connecting an institution or completing a long form.

- Add a prominent **Snap a receipt** action to the existing Review heading/action area and Receipts screen. Keep **Import expenses** available as a secondary action. Use the existing button, color, typography, panel and dialog styles; preserve the original visual template and navigation. This is an explicitly authorized small functional addition, not authorization for a redesign.
- On iPhone, open native camera capture using supported permission flows. Offer photo library and PDF/file selection as alternatives. On desktop, support image/PDF selection and camera capture only when actually supported.
- Let the customer preview, retake, rotate/crop if supported and accept the photo. Handle camera denial/cancellation with a clear photo-library/manual alternative. Do not create blank expenses when capture is cancelled.
- Accept common phone formats including HEIC/HEIF through a supported conversion pipeline; correct orientation, resize/compress for processing while preserving a readable receipt, validate content/type/size and handle multi-page documents deliberately. Do not reject ordinary iPhone photos silently.
- Start real extraction immediately after the customer accepts the photo. Show truthful Uploading / Reading receipt / Ready to review or Retry / Needs details states. 'Instant' means prompt processing and feedback, not a promise of perfect or zero-latency extraction.
- Extract merchant, purchase date, total and currency; extract subtotal, tax, tip and line items when reliably available. Distinguish total from subtotal, tendered amount, change and card last-four digits. Never assume dollars when currency is ambiguous.
- Display an editable draft in the approved expense-dialog visual language, with the receipt preview and a suggested category/possible tax-record explanation. Highlight missing, ambiguous and low-confidence fields rather than inventing values. A customer should mostly review and tap **Save**, not retype the entire receipt.
- For mixed purchases, allow useful item-level personal/business allocation without forcing every user to classify every line item. The sum of line-item allocations must reconcile with the final total, including tax/tip handling. Keep eligible deduction amounts separate from these use allocations.
- Before saving, check existing receipt fingerprints and customer transactions for possible matches using merchant/date/amount/currency and available provider IDs. Suggest a match; do not silently merge ambiguous records. Attach to a confirmed existing transaction, or create one receipt-origin expense if there is no match.
- If a matching bank transaction arrives later, reconcile it with the receipt-origin expense without double-counting or discarding user decisions. Preserve provenance and audit metadata.
- Save the image privately with the expense, searchable extracted fields, extraction status/confidence, processing version and source='receipt'. Permit correcting the draft and saving even when OCR fails; keep retry and manual entry available.
- Preserve an accepted photo/draft safely through interrupted uploads, poor connectivity, navigation and recoverable app restarts. Use protected local draft storage and an idempotent retry queue; never claim cloud persistence before server confirmation. Clean up local/remote draft artifacts on completion or explicit discard under a documented retention policy.
- No customer receipt images in logs, analytics, public URLs or another customer's session. Send images only to the configured processing service under the app's disclosed privacy flow; do not send them to arbitrary model providers.

**Required receipt flow:** Snap photo → preview/accept → real extraction → editable review → possible write-off suggestion → save/match → expense and receipt visible together. Photo-library and PDF inputs use the same pipeline. No bank account is required.

**Acceptance checks:** camera and library selection; denied permission; capture cancellation; HEIC orientation; blurry/partial receipt; OCR failure; subtotal/tip/total ambiguity; ambiguous currency; duplicate scan; matching existing transaction; bank transaction arriving after receipt; offline/retry/app restart; correction and successful save; other-customer denial. Use synthetic/nonpersonal receipt fixtures. Report actual-device capture separately from browser file-input tests. Missing native tooling or OCR credentials must remain explicit release blockers for unverified parts.

Keep and complete existing receipt/CSV behavior within the same template:
- camera/photo library/PDF upload to private, customer-scoped storage;
- clear file type/size validation and useful upload progress/retry;
- attach to an existing transaction without duplicating spend;
- editable suggested receipt match; require confirmation when uncertain;
- Real OCR/extraction is a core MVP requirement, not a nice-to-have. Implement a configured OCR adapter and an immediately useful editable review flow. Missing credentials are a reported blocker to automated extraction, not permission to replace it with a fake success or call the receipt feature complete.
- CSV header mapping, expense sign configuration, preview, strict date/amount/currency validation, duplicate handling and clear row errors;
- transfer/refund reconciliation and human confirmation for ambiguous matches;
- filtered/year/business reports separating possible records from checked eligible amounts;
- CSV export and full records/receipts export with spreadsheet-formula injection protection.

Migrate the original browser records safely. Detect `writeoff.workspace.v2` and legacy `writeoff.records.v1`. Offer explicit import into the signed-in account with a preview and idempotency. Retain receipts and existing decisions; do not clear browser data until the server confirms completion. Preserve the prototype's existing data on failures. Never silently upload browser financial data to a newly signed-in account.

## 9. Subscriptions for paying customers

Implement a subscription entitlement model for an App Store product. Use configurable product identifiers, pricing copy and limits; do not invent approved prices or purchase products. Keep the paywall in the approved Writeoff visual language.

Support purchase, restore, active entitlement, renewal, cancellation, expiration, grace/billing-retry state and verified backend/provider notifications as applicable. Validate entitlements through supported server/provider mechanisms; a client-side boolean cannot unlock paid access. Deduplicate webhook events and handle out-of-order delivery safely.

Set reasonable configurable feature flags/limits, with no destructive data loss on downgrade. Do not lock customers out of account management, subscription management, account deletion or export of their own records. Clearly show actual price/period/trial terms from the store, plus required privacy/terms links. No fabricated discounts, trials or subscription success states.

Complete sandbox purchase flows when credentials/tooling allow. Mark any untested native lifecycle explicitly. Do not charge the owner or a customer during development.

## 10. Engineering, privacy and operational requirements

- Database migrations, ownership/RLS policies, private receipt access and tenant-isolation tests.
- Validated APIs, safe error handling, loading/empty/partial/offline states and no silent data loss.
- Duplicate request protection for imports, purchases and bank sync.
- Secret-safe logs and error monitoring; no raw bank transactions or receipts in analytics.
- Minimize data collected and document retention, deletion, provider dependencies and permissions.
- Environment separation for local/dev, sandbox/staging and production.
- Repository setup guide, provider configuration guide and release checklist.
- Accessibility: usable focus order, labeled controls, modal focus management, contrast, text scaling and adequate touch targets while preserving the visual template.
- Native iOS integration: safe areas, keyboard, camera/photo permissions, secure session handling, deep-link return flows and native purchase/restore behavior.
- If the current environment lacks macOS/Xcode/signing, implement what can be verified and clearly list native checks still needed. Never claim an iOS build or App Store approval that did not occur.

## 11. Phases and acceptance gates

Work in bounded phases; use reviewable local commits/checkpoints. Do not stop after scaffolding.

### Phase A — exact template + customer foundation
Verify locked source, capture baselines, establish the React/TypeScript/Capacitor app, preserve all five current screens, implement secure accounts and customer-scoped records/receipt CRUD, and document migration. Verify visual parity, data persistence, validation and two-customer isolation.

### Phase B — receipt-first capture + frictionless expense review
Implement the complete receipt-first capture/extraction/edit/save flow as a core feature, plus profile-aware suggestions, Business / Personal / Split, context questions, saved preferences, undo, imports/exports and safe legacy-data migration. Verify receipt-only onboarding without a bank connection, native capture permissions, actual OCR, editable low-confidence fields, duplicate matching and interrupted-upload recovery. Verify that use classification never silently creates checked eligible totals. Test CSV dates/signs/duplicates, refunds/transfers, amounts/currencies and migration failures.

### Phase C — banks + receipt reconciliation
Implement the real Sandbox bank flow and backend sync lifecycle. Complete automatic matching/reconciliation between bank transactions and the receipt-origin records built in Phase B. OCR must not be deferred as an optional feature. Verify connect → sync → review → correct → resync, no duplication, disconnect, revoked access and other-customer denial. Keep any unavailable production capability honestly disabled.

### Phase D — subscriptions + iOS preparation
Implement configurable entitlements/paywall, native purchase/restore and backend validation. Test relevant subscription states in Sandbox. Produce native project setup and current App Store/privacy/deletion requirements. Verify an actual iOS build/device flow where tooling allows; otherwise report the exact unverified steps.

### Phase E — release-candidate verification
Run meaningful automated checks and full browser/native flows. Compare visual parity at all reference sizes. Check screenshots of empty/populated/error/modal/paywall states without exposing real financial data. Fix regressions; do not change locked baselines to hide them. Produce a truthful release-readiness report separating implemented, verified, sandbox-only, blocked and not implemented.

## 12. Required deliverables and final report

Deliver the runnable source, immutable reference template, migrations and security policies, provider adapters, environment example, tests, setup guide, DESIGN_PARITY.md, FEATURE_STATUS.md and RELEASE_READINESS.md. Include exact commands and environments used for verification and any material failures/limits.

Final report must identify:
1. What a new paying customer can actually do end to end.
2. Which screens retain the approved visual template, and evidence of parity.
3. What is sandbox-only or blocked and why.
4. Which credentials (including OCR), product IDs, provider approvals or Apple-owner steps remain.
5. Whether the result is a prototype, development MVP or verified release candidate.

Do not describe a dashboard demo, stubbed bank connection, mocked purchase or successful web build as an App Store-ready app.

Start now with repository inspection and locked-template verification, then continue Phase A implementation.
