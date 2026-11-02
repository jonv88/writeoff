# Writeoff — Implementation Plan

## Locked baseline
- Template version: `approved-prototype-2026-11-02` (`TEMPLATE_LOCK.json`)
- Immutable source: `reference-template/` (verify with `npm run verify:template`)
- Viewports: 375×812, 390×844, 768×1024, 1440×900
- Baselines captured before app code: `media/phase-a/baselines/`

## Stack (kit defaults)
| Layer | Choice |
| --- | --- |
| UI | React + TypeScript + Vite |
| Native shell | Capacitor (iOS) |
| Auth / DB / Storage | Supabase Auth + Postgres + private Storage |
| Banks (later) | Plaid Transactions adapter — Sandbox first |
| Subscriptions (later) | StoreKit-compatible; RevenueCat adapter if suitable |
| OCR (later) | Server-side adapter — real extraction required in Phase B |

## Phase A — exact template + customer foundation (this PR)
1. Verify hashes vs `TEMPLATE_LOCK.json` / `SHA256SUMS`.
2. Copy kit rules into the repo; keep `reference-template/` immutable.
3. Capture unmodified reference baselines at locked viewports.
4. Scaffold React/TS/Vite/Capacitor preserving DOM/CSS/visual identity.
5. Ship `IMPLEMENTATION_PLAN.md`, `FEATURE_STATUS.md`, `DESIGN_PARITY.md`, `.env.example`, ignores, setup docs.
6. Supabase schema + RLS for profiles, expenses, receipts, merchant rules; private `receipts` bucket.
7. Auth (sign-up / sign-in / reset / session restore) and customer-scoped CRUD.
8. Preserve Review, Expenses, Receipts, Accounts, Setup screens.
9. Document explicit legacy `localStorage` migration path (no silent upload).

**Acceptance:** visual parity evidence, persistence with credentials, validation, two-customer isolation once a Writeoff Supabase project is applied.

## Phase B — receipt-first capture + review
Snap a receipt, camera/library, real OCR, editable draft, save/match, preferences, undo, CSV/export completion, legacy migration UX polish.

## Phase C — banks + receipt reconciliation
Plaid Sandbox link → sync → review; reconcile receipt-origin expenses; honest production-disabled states.

## Phase D — subscriptions + iOS preparation
Entitlements/paywall, StoreKit/RevenueCat sandbox, native project checklist.

## Phase E — release-candidate verification
Automated + manual parity, privacy/deletion, truthful `RELEASE_READINESS.md`.

## Verification commands
```bash
npm run verify:template
npm install
cp .env.example .env   # then fill real keys
# apply supabase/migrations/* to the Writeoff project
npm run dev
npm run build
npm run reference:preview   # locked template on :8080
```

## Non-goals for Phase A
App Store submit, purchases, Plaid production, OCR, creator personal financial data, redesign.
