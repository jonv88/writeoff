# Setup guide

## Minimum backend configuration (Writeoff)

Auth, private receipt storage, and customer isolation are **not verified** until all of the following exist:

1. A **dedicated** Supabase project named for Writeoff (do not reuse Rhev / other apps).
2. Migrations applied in order:
   - `supabase/migrations/20261102190000_phase_a_foundation.sql`
   - `supabase/migrations/20261102220000_phase_b_suggestions.sql`
3. Environment variables (never commit real values):
   ```bash
   cp .env.example .env
   # VITE_SUPABASE_URL=
   # VITE_SUPABASE_ANON_KEY=
   ```
4. Auth email settings (confirm / reset redirect to your app origin).
5. Isolation checklist: `docs/RLS_ISOLATION_TEST.md`

Optional for automatic receipt extraction:

```bash
VITE_OCR_ENDPOINT=https://your-edge-or-api/extract
# VITE_OCR_AUTH_TOKEN=   # optional bearer for your own endpoint
```

Without OCR env vars, **Snap a receipt** still works: users review the photo and enter details manually.

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
