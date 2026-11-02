# Writeoff — Design Parity

## Authority
- Immutable source: `reference-template/{index.html,app.js,core.js}`
- Fingerprints: `TEMPLATE_LOCK.json` and `reference-template/SHA256SUMS`
- Rule: correct the app to match the template; do not edit baselines to hide diffs

## Baseline capture (before application code)
Unmodified reference-template screenshots (empty workspace, Review):

| Viewport | Repo path | Parent store path |
| --- | --- | --- |
| 375×812 | `media/phase-a/baselines/baseline-375x812.png` | `/cursor/stores/bc-7967a11b-7ff7-4ed3-91a2-8c7564cbede4/media/phase-a/baselines/baseline-375x812.png` |
| 390×844 | `media/phase-a/baselines/baseline-390x844.png` | `.../baseline-390x844.png` |
| 768×1024 | `media/phase-a/baselines/baseline-768x1024.png` | `.../baseline-768x1024.png` |
| 1440×900 | `media/phase-a/baselines/baseline-1440x900.png` | `.../baseline-1440x900.png` |

Capture method: Chromium (Playwright) against `python3 -m http.server` serving `reference-template/`, after font load (~2s), viewport clip (not fullPage).

## Application approach
- Exact CSS extracted into `src/styles/writeoff.css` (no UI-kit theme, no redesign).
- DOM structure and class names preserved (`aside`, `.brand`, `.nav`, `.hero`, `.reviewcard`, `.stats`, dialogs, etc.).
- Typography: Manrope + DM Sans via the same Google Fonts import.
- Palette tokens: `--ink`, `--green`, `--muted`, `--line`, `--paper`.
- Functional copy may differ where truth requires it (e.g. “Saved to your account”, bank pending, OCR not yet available).
- Auth gate uses the same tokens/panels (`src/styles/auth.css`) — not a marketing landing page.

## Screens preserved
1. **Review** — hero setup prompt, stats, review cards, aside routine panel  
2. **Expenses** — filters, ledger table, CSV export  
3. **Receipts** — missing hero, receipt cards  
4. **Accounts** — honest bank-pending panels  
5. **Setup** — workspace, preferences, backup/export, legacy import  

## Comparison process
1. `npm run reference:preview` → locked template on :8080  
2. `npm run dev` → app on :5173 (sign in with test users when Supabase is configured)  
3. Capture matching empty/populated states at the four viewports  
4. Diff against `media/phase-a/baselines/` for unchanged chrome  
5. Record approved intentional deltas below  

## Approved intentional deltas (Phase A)
| Change | Reason |
| --- | --- |
| Auth screen before shell | Customer accounts required; not in browser prototype |
| Aside footer “Saved to your account” | Truthful persistence (was “Saved on this device”) |
| Main footer cloud wording | Same |
| Receipts helper mentions Phase B OCR | Avoid claiming extraction that is not implemented |
| Accounts storage line names Supabase | Truthful |
| Setup: legacy browser import panel | Explicit migration path |
| Setup: Sign out | Account lifecycle |

## Not redesigned
Wordmark, mark, colors, fonts, sidebar, heading hierarchy, button styles, dialogs, mobile breakpoints from the locked CSS.

## App captures without Supabase (auth gate)
Honest blocked state using the same brand tokens (not a redesign):

| Viewport | Path |
| --- | --- |
| 375×812 | `media/phase-a/baselines/app-auth-gate-375x812.png` |
| 390×844 | `media/phase-a/baselines/app-auth-gate-390x844.png` |
| 768×1024 | `media/phase-a/baselines/app-auth-gate-768x1024.png` |
| 1440×900 | `media/phase-a/baselines/app-auth-gate-1440x900.png` |

Vite also serves the locked template at `/reference-preview/` (spot-check: `media/phase-a/baselines/reference-via-vite-1440x900.png`).

## Follow-up parity shots
After Supabase credentials are available, capture signed-in empty Review/Expenses/Receipts/Accounts/Setup at the four viewports into `media/phase-a/app/` and attach here.
