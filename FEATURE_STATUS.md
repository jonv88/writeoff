# Writeoff — Feature Status

Last updated: 2026-11-02 (consolidated scope)

Legend: **Done** · **Partial** · **Blocked** · **Not started**

## A — Foundation

| Capability | Status | Notes |
| --- | --- | --- |
| Template hash lock | Done | `npm run verify:template` |
| Kit rules + immutable reference | Done | |
| Baseline screenshots (4 viewports) | Done | `media/phase-a/baselines/` |
| React/Vite/TS + template CSS | Done | |
| Five screens shell | Done | Review, Expenses, Receipts, Accounts, Setup |
| Capacitor config | Partial | No `ios/` project (needs macOS/Xcode) |
| Auth / session client | Partial | Code ready; **not verified** without Writeoff Supabase |
| Profiles / expenses / receipts CRUD | Partial | Client + SQL; needs live project |
| RLS policies in migration | Done (SQL) | **Not verified** live |
| Two-customer isolation | Blocked | Needs configured backend + two users |
| Legacy localStorage import | Partial | Explicit Setup import; local preview also available |

## B — Central product loop

| Capability | Status | Notes |
| --- | --- | --- |
| Profile-aware suggestion engine | Done (client) | Structured statuses; rule pack versioned; unit script |
| Editable treatments | Done (client) | User overrides labeled; not silent tax verification |
| Business use vs eligible % | Done | Kept separate in model + summaries |
| Snap a receipt UI | Done | Camera/file → review → save/match |
| OCR extraction | Blocked / Partial | Adapter ready; **blocked** without `VITE_OCR_ENDPOINT` — manual entry works |
| Notes | Done | Expense + decision + snap flows |
| Summaries (total / possible / eligible) | Done | Stats cards |
| Filters + search | Done | Use, year, category, suggestion status, missing receipt |
| CSV export | Done | Includes status, treatment, rule metadata |
| Manual + CSV share same engine | Done | |
| Local preview demo path | Done | Synthetic fixtures; not cloud sync |
| Cloud persistence of B fields | Partial | Migration `20261102220000_phase_b_suggestions.sql` ready |

## C / D (planned, secondary)

| Capability | Status |
| --- | --- |
| Bank / Plaid Sandbox | Not started (Accounts stays honest “pending”) |
| Subscriptions / web MVP billing | Not started |
| App Store / Play submit | Not started |

## Blockers (honest)

1. **Dedicated Writeoff Supabase** — `VITE_SUPABASE_URL` + anon/publishable key; apply both migrations. Rhev projects not reused. Auth/storage/isolation **unverified** until then.
2. **OCR server endpoint** — `VITE_OCR_ENDPOINT` (and optional `VITE_OCR_AUTH_TOKEN`). Without it, Snap still works with manual field entry.
3. **Docker / local Supabase** — unavailable in this agent environment.
4. **macOS / Xcode** — native Capacitor iOS project not generated here.
5. **Plaid / subscription / Apple-Google billing** — later increments; not faked.

## What a customer can do now

**With local preview:** seed sample expenses, see profile-aware suggestions, confirm Business/Personal/Split, Snap a receipt (manual OCR path), filter/export CSV, view summaries that distinguish totals vs possible write-offs vs eligible %.

**With Supabase + migrations:** same loop with cloud accounts, private receipt storage, and cross-device sync — after credentials are supplied and isolation is tested.

Banks, automatic OCR, and subscriptions remain unavailable or blocked as listed above.
