# Writeoff

Customer subscription product for organizing possible write-offs. The approved browser prototype in `reference-template/` is the locked visual baseline — do not redesign it.

## Quick start
```bash
npm run verify:template
npm install
cp .env.example .env   # add Writeoff Supabase URL + anon key
# Apply supabase/migrations/*.sql to that project (SQL editor or CLI)
npm run dev
```

Reference (immutable) preview:
```bash
npm run reference:preview
# http://localhost:8080
```

With the Vite app running, the same files are also at `/reference-preview/`.

## Phase docs
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)
- [FEATURE_STATUS.md](./FEATURE_STATUS.md)
- [DESIGN_PARITY.md](./DESIGN_PARITY.md)
- [docs/SETUP.md](./docs/SETUP.md)
- [docs/LEGACY_MIGRATION.md](./docs/LEGACY_MIGRATION.md)

## Capsule
- React + TypeScript + Vite UI
- Capacitor iOS shell (`capacitor.config.ts`; native project requires macOS)
- Supabase Auth, Postgres, private Storage

## Rules
Read `AGENTS.md` and `.cursor/rules/preserve-template.mdc` before changing UI.
Never commit secrets, creator financial data, or fake “connected” bank/subscription states.
