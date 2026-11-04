# Writeoff — Implementation Plan

**Authoritative scope:** consolidated product direction (web-first subscription app that organizes expenses/receipts, suggests possible write-offs, and keeps every suggestion editable). This supersedes earlier “Phase A only / manual tracker” framing.

## Locked baseline
- Template version: `approved-prototype-2026-11-02` (`TEMPLATE_LOCK.json`)
- Immutable source: `reference-template/` (`npm run verify:template`)
- Viewports: 375×812, 390×844, 768×1024, 1440×900
- Baselines: `media/phase-a/baselines/`
- Delivery: **responsive web first**; Capacitor shells for later App Store / Play

## Stack
| Layer | Choice |
| --- | --- |
| UI | React + TypeScript + Vite (exact template CSS/DOM) |
| Native shells (later) | Capacitor |
| Auth / DB / Storage | Supabase Auth + Postgres + private Storage |
| OCR | Supabase Edge Function `extract-receipt` + Mindee (server secrets) |
| Banks (secondary) | Plaid Sandbox → production later |
| Subscriptions (secondary) | Provider-agnostic entitlements; web MVP before store billing |

## Increment A — foundation (verify / finish)
- Template lock, kit rules, five screens, migrations, auth/CRUD client
- **Not verified** until a dedicated Writeoff Supabase project is configured and isolation is tested
- Minimum backend config: see `docs/SETUP.md` and `.env.example`

## Increment B — central product loop (current build focus)
**Add expense → organize → suggest possible write-off → confirm/edit → summary/export**

Includes:
- Profile-aware suggestion engine (`src/lib/writeoffEngine.ts`, rule pack `us-common` 2026.11.02)
- Editable treatments (`treatmentSource`: suggestion / user / tax_pro); business-use % ≠ eligible %
- Snap a receipt + authenticated `extract-receipt` Edge Function (Mindee server-side; honest blocker when key missing; manual review always available)
- Notes, filters (incl. suggestion status), summaries distinguishing total / possible write-offs / eligible %
- CSV export with classifications
- Local preview mode for independent demos without cloud credentials

Demonstrate: receipt / manual / CSV → suggestion → confirm/edit → summary/export.

## Increment C — optional bank ingestion
Plaid Sandbox link/sync into the same expense + suggestion system; receipt match; no double-count.

## Increment D — subscription web MVP
Entitlements, paywall in template language, export/deletion; native store releases afterward.

## Verification
```bash
npm run verify:template
npm run build
npm run test:suggestions
npm run dev
# Local preview: open app → “Local preview with sample expenses”
```

## Non-goals (without separate authorization)
Merge to production deploy, purchases/charges, App Store/Play submit, creator personal financial data, redesign.
