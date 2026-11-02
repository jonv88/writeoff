# Writeoff

Subscription web app (App Store / Play later) that organizes expenses and receipts, **suggests possible write-offs** from the customer’s circumstances, and keeps every suggestion easy to review or edit.

The approved prototype in `reference-template/` is the locked visual baseline — do not redesign it.

## Quick start
```bash
npm run verify:template
npm install
cp .env.example .env   # optional until you have a Writeoff Supabase project
npm run dev
```

Without cloud keys: **Local preview with sample expenses** exercises the central product loop on this device.

```bash
npm run test:suggestions
npm run verify:receipt-flow
npm run build
npm run reference:preview
```

Receipt OCR runs through the authenticated `extract-receipt` Edge Function (Mindee on the server). Never put OCR or service-role secrets in `VITE_*` — see [docs/RECEIPT_OCR.md](./docs/RECEIPT_OCR.md).

## Docs
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) — consolidated increments A→D
- [FEATURE_STATUS.md](./FEATURE_STATUS.md)
- [DESIGN_PARITY.md](./DESIGN_PARITY.md)
- [docs/SETUP.md](./docs/SETUP.md) — minimum backend config
- [docs/APPLY_MIGRATIONS.md](./docs/APPLY_MIGRATIONS.md)
- [docs/RECEIPT_OCR.md](./docs/RECEIPT_OCR.md)
- [docs/LEGACY_MIGRATION.md](./docs/LEGACY_MIGRATION.md)

## Rules
Read `AGENTS.md` and `.cursor/rules/preserve-template.mdc`. Never commit secrets, creator financial data, or fake bank/subscription success states.
