# Synthetic receipt fixtures

Nonpersonal images for OCR / upload verification. Do not add creator or customer financial data.

## Legacy smoke fixtures

| File | Description |
| --- | --- |
| `synthetic-coffee-receipt.png` | Demo Coffee Co · 2026-10-21 · TOTAL USD 4.90 |
| `synthetic-acme-style.png` | Stylized logo + printed NORTHSIDE HARDWARE · Nov 2, 2026 · $25.95 (no brand hardcode in OCR) |
| `synthetic-stylized-logo.png` | Decorative logo + www.riverbend-market.com · Nov 1, 2026 · $19.90 |
| `synthetic-logo-garbled-only.png` | No readable store name (shape logo) · Nov 2, 2026 · $25.95 — merchant should stay blank |
| `synthetic-slogan-footer.png` | Garbled/stylized logo + slogan + footer “Thank you for shopping at Greenfield Foods” · Nov 2, 2026 · $25.96 |

## Reliability ground truth (`ground-truth.json`)

Varied merchants/layouts for before/after eval. Tune vs holdout splits. Text OCR fixtures in `ground-truth-text.json`.

| File | Split | Ground truth | Notes |
| --- | --- | --- | --- |
| `gt-acme-balance.png` | tune | ACME · 2026-11-02 · 25.96 | Phone shadow/angle; BALANCE; savings larger |
| `gt-restaurant-tip.png` | tune | Riverbend Bistro · 2026-11-03 · 29.30 | Tip + TOTAL + AMOUNT PAID |
| `gt-discount-grand-total.png` | tune | NORTHSIDE HARDWARE · 2026-11-01 · 25.37 | Discount; GRAND TOTAL |
| `gt-coffee-digital.png` | tune | DEMO COFFEE CO · 2026-10-21 · 4.90 | Clean digital |
| `gt-savings-larger-than-total.png` | tune | Greenfield Foods · 2026-11-02 · 23.76 | YOU SAVED > amount due |
| `gt-no-total-label.png` | tune | Corner Newsstand · 2026-11-03 · blank amount | No labeled total |
| `gt-walmart-chain.png` | holdout | Walmart · 2026-11-01 · 19.90 | Dim/angled chain |
| `gt-balance-due-cafe.png` | holdout | Maple Street Cafe · 2026-11-04 · 20.78 | Tip; BALANCE DUE |
| `gt-digital-invoice.png` | holdout | Oak & Pine Supply · 2026-10-30 · 21.60 | PDF-like invoice |
| `gt-conflicting-totals.png` | holdout | Harbor Market · 2026-11-02 · blank amount | Conflicting labeled totals |

Copies also live under the agent store `media/receipt-reliability/fixtures/`.

Used by `npm run verify:receipt-flow`, `node scripts/test-browser-ocr-parse.mjs`, and `node scripts/eval-receipt-reliability.mjs`. Nonpersonal synthetic only.
