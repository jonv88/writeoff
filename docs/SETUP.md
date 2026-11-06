# Setup guide

## Minimum backend configuration (Writeoff)

Hosted accounts, receipt storage, sync, and subscription persistence are waiting on the project in `docs/APPLY_MIGRATIONS.md`. The quoted price is $10 per month. The project has not been created. Rhev and RHEV Development stay active.

1. Approve that configuration, then create the Writeoff project.
2. Apply the three SQL files in the order in that document.
3. Set the Preview-only variables named there, on branch `cursor/veryfi-live-scan-9e74`, and redeploy the private preview.
4. Point Auth site URL and the recovery redirect at the private preview, not the public alias.
5. Add the Stripe test-mode values and webhook in that document. Use `sk_test_` only.

Receipt reading stays the private-preview scanner. Do not add a second OCR function. Isolation on a hosted project is still open; `docs/RLS_ISOLATION_TEST.md` is the checklist for after the project exists.

## Install & run
```bash
npm run verify:template
npm install
npm run dev
```

Without Supabase keys, use **Local preview with sample expenses** to exercise the central product loop on-device.

```bash
npm run build
npm run test:suggestions
npm run reference:preview
```

## Capacitor / iOS
Requires macOS + Xcode. `capacitor.config.ts` is present; `npx cap add ios` was not run on Linux.
