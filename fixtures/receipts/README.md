# Synthetic receipt fixtures

Nonpersonal images for OCR / upload verification. Do not add creator or customer financial data.

| File | Description |
| --- | --- |
| `synthetic-coffee-receipt.png` | Demo Coffee Co · 2026-10-21 · TOTAL USD 4.90 |
| `synthetic-acme-style.png` | Stylized logo + printed NORTHSIDE HARDWARE · Nov 2, 2026 · $25.95 (no brand hardcode in OCR) |
| `synthetic-stylized-logo.png` | Decorative logo + www.riverbend-market.com · Nov 1, 2026 · $19.90 |
| `synthetic-logo-garbled-only.png` | No readable store name (shape logo) · Nov 2, 2026 · $25.95 — merchant should stay blank |

Used by `npm run verify:receipt-flow` and browser OCR checks. Nonpersonal synthetic only.
