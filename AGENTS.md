# Writeoff project instructions

This is a customer subscription product for App Store distribution, not a personal finance workspace for its creator.

## Mandatory visual baseline
`reference-template/index.html`, `app.js` and `core.js` are the exact approved prototype source. Verify hashes in TEMPLATE_LOCK.json before work. Keep reference-template immutable. Implement functionality by preserving the existing CSS/structure/visual identity; do not regenerate the app from a generic dashboard or starter UI.

Preserve wordmark, palette, fonts, layout, spacing, navigation and component appearance. New screens must use the same visual language. Functional copy may change to truthfully represent new behavior; responsive/native accessibility changes must be minimal and documented. Do not add a landing page or rebrand.

Capture and compare matching-content reference/application screenshots at 375×812, 390×844, 768×1024 and 1440×900. Do not edit approved baselines to conceal differences.

## Scope and truthfulness
Read CURSOR_PROMPT.md for implementation requirements. Finances connected in ChatGPT is not a banking backend for this product. Never use creator financial data, hardcoded customer records or fake integration success states. Use sandbox providers during development, distinguish tests/mocks from real features, and list credential/tooling blockers. Continue independent authorized work when integrations are blocked.

Do not equate business use with tax deductibility. Protect per-customer ownership for all data and receipts. Never commit secrets or tokens. Do not purchase, charge, submit to Apple or deploy to production without separate authorization. Respect existing unrelated work.

## Core receipt-first requirement
Phone receipt photos are a primary expense-entry path, independent of bank linking. Implement Snap a receipt → camera/library → real OCR/extraction → editable review → save/match, with privacy, safe retry and duplicate reconciliation. Automated extraction is a required MVP capability, not an optional enhancement. Preserve the existing template; the small matching-style Snap a receipt action is expressly authorized. Keep reference-template bytes unchanged.
