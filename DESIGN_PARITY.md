# Writeoff — Design Parity

## Authority
- Immutable: `reference-template/{index.html,app.js,core.js}`
- Fingerprints: `TEMPLATE_LOCK.json` + `SHA256SUMS`
- Rule: fix the app to match the template; do not edit baselines to hide diffs

## Product framing
Writeoff is a subscription web app (stores later) that **suggests possible write-offs** and keeps them editable — not a redesign and not a “manual-only tracker.” Visual chrome stays locked.

## Baseline capture (pre-app)
| Viewport | Path |
| --- | --- |
| 375×812 | `media/phase-a/baselines/baseline-375x812.png` |
| 390×844 | `media/phase-a/baselines/baseline-390x844.png` |
| 768×1024 | `media/phase-a/baselines/baseline-768x1024.png` |
| 1440×900 | `media/phase-a/baselines/baseline-1440x900.png` |

Also mirrored under `/cursor/stores/bc-7967a11b-7ff7-4ed3-91a2-8c7564cbede4/media/phase-a/baselines/`.

## Application approach
- Exact CSS in `src/styles/writeoff.css`
- Same class names / shell / dialogs
- Manrope + DM Sans; tokens `--ink` `--green` `--muted` `--line` `--paper`
- Authorized additions in existing language: **Snap a receipt** primary action; suggestion status filter; local-preview notice

## Approved intentional deltas
| Change | Reason |
| --- | --- |
| Auth / local preview gate | Customer accounts + honest offline demo |
| Aside/footer “account” or “local preview” copy | Truthful persistence |
| Snap a receipt button | Consolidated / kit receipt-first requirement |
| Stats “Possible write-offs” / “Eligible % you set” | Distinguish totals vs possible vs eligible |
| OCR / bank pending copy | No fake success |

## Phase B demo shots (local preview)
Parent store: `/cursor/stores/bc-7967a11b-7ff7-4ed3-91a2-8c7564cbede4/media/phase-b/`

| Shot | Repo path |
| --- | --- |
| Review + suggestions | `media/phase-b/review-local-preview-1440x900.png` |
| Review mobile | `media/phase-b/review-local-preview-390x844.png` |
| Snap a receipt dialog | `media/phase-b/snap-receipt-dialog-1440x900.png` |
| After confirm treatment | `media/phase-b/after-confirm-1440x900.png` |
| Expenses + filters | `media/phase-b/expenses-filters-1440x900.png` |
