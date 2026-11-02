# Writeoff — Feature Status (Phase A)

Last updated: 2026-11-02

Legend: **Done** · **Partial** · **Blocked** · **Not started** (later phase)

## Phase A scope

| Capability | Status | Notes |
| --- | --- | --- |
| Template hash lock verified | Done | Matches `TEMPLATE_LOCK.json` + `SHA256SUMS` |
| Kit rules in repo | Done | `AGENTS.md`, `.cursor/rules/preserve-template.mdc`, lock, immutable `reference-template/` |
| Baseline screenshots (4 viewports) | Done | `media/phase-a/baselines/` (+ parent store copies) |
| React + TS + Vite scaffold | Done | Preserves template CSS/DOM classes |
| Capacitor iOS shell wiring | Partial | `@capacitor/*` + `capacitor.config.ts`; `npx cap add ios` needs macOS/Xcode — **not run here** |
| Five screens visual shell | Done | Review, Expenses, Receipts, Accounts, Setup |
| Auth (sign-up / in / out / reset / session) | Partial | Implemented against Supabase JS; **runtime blocked** without Writeoff project keys |
| Profiles + expenses + rules CRUD | Partial | Client + migration ready; needs applied DB |
| Private receipt Storage upload | Partial | Upload/signed URL code + RLS policies in migration; needs bucket on project |
| RLS ownership policies | Done (in migration) | Not yet applied to a live Writeoff project in this environment |
| Two-customer isolation test | Blocked | Requires two auth users on a live project |
| Legacy localStorage migration | Partial | Detection + explicit import in Setup; receipt data-URLs not auto-uploaded |
| CSV import / export | Done (app-level) | Same rules as prototype; persists to Supabase when configured |
| Bank linking | Not started | Honest “pending” copy on Accounts (Phase C) |
| OCR / Snap a receipt | Not started | Phase B; Accounts/Receipts copy stays truthful |
| Subscriptions / StoreKit | Not started | Phase D |
| App Store submit | Not started | Explicitly out of scope |

## Blockers (honest)

1. **Writeoff Supabase project credentials** — Account has unrelated projects (`Rhev`, `RHEV Development`). No Writeoff project was created (would incur org compute cost / needs owner confirmation). Supply `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` and apply `supabase/migrations/20261102190000_phase_a_foundation.sql`.
2. **Docker / local Supabase** — Not available in this Cloud Agent environment; cannot run `supabase start` here.
3. **macOS / Xcode** — Cannot produce a signed iOS build or add the native `ios/` project on this Linux host.
4. **Email confirmation / SMTP** — Depends on Supabase Auth settings once the project exists.
5. **OCR provider credentials** — Phase B blocker (listed early for planning).
6. **Plaid / RevenueCat / Apple** — Later phases; not faked.

## What continues without those credentials
- Runnable UI build and reference preview
- Design-parity documentation and baselines
- Migration SQL and client data layer
- Legacy migration UX (detect / explicit import)
- Honest empty/pending integration states

## Customer-visible Phase A (once credentials applied)
A customer can create an account, complete brief setup, add/edit/delete expenses, attach receipt files to private storage, import CSV statements, review Business/Personal/Split, export CSV, and optionally import prior browser prototype data after preview. Banks, OCR, and subscriptions remain unavailable and labeled as such.
