# Writeoff — Feature Status

Last updated: 2026-11-02 (local preview for testers)

Legend: **Done** · **Partial** · **Blocked** · **Not started**

## A — Foundation

| Capability | Status | Notes |
| --- | --- | --- |
| Template lock / five screens / React scaffold | Done | `npm run verify:template` |
| Supabase migrations (A+B) | Done (SQL) | Apply to Writeoff project only — see `docs/APPLY_MIGRATIONS.md` |
| Auth / storage / isolation **verified** | Blocked | Needs dedicated Writeoff project keys (Rhev not used) |
| Capacitor iOS project | Partial | Config only; needs macOS/Xcode |

## B — Central product loop + receipt backend

| Capability | Status | Notes |
| --- | --- | --- |
| Suggestion engine + editable treatments | Done (client) | `npm run test:suggestions` |
| Summaries / filters / CSV | Done (client) | |
| Snap a receipt UI | Done | |
| **extract-receipt Edge Function** | Done (source) | Auth JWT, validate type/size, private Storage, Mindee adapter |
| OCR secrets off `VITE_*` | Done | Only public URL + anon in browser |
| Mindee wired behind env | Done | Honest `blocked` if `MINDEE_API_KEY` missing |
| Deploy function + secrets | Blocked | Waiting Writeoff project ref |
| Live upload→extract→confirm→CSV | Blocked | `npm run verify:receipt-flow` dry-runs until keys |
| Two-customer isolation (live) | Blocked | Harness ready |

## OCR provider recommendation

**Mindee Expense Receipts V5** — receipt-native fields + confidence; free tier ~**250 docs/month** (confirm current); paid plans typically tens of USD/month or usage beyond free. Alternatives: Google Document AI Expense Parser, AWS Textract AnalyzeExpense, Veryfi. Details: `docs/RECEIPT_OCR.md`. **No paid activation in this work.**

## C / D

| Banks sandbox | Not started (Accounts honest pending) |
| Subscriptions | Not started |

## Local preview (shipped — $0 / no cloud)

| Capability | Status |
| --- | --- |
| `npm run dev` browser preview | Done — see `PREVIEW.md` |
| Browser-local storage | Done |
| Sample data + empty workspace + reset | Done (Setup controls) |
| Core review loop without credentials | Done |
| OCR | Not available locally — attach + manual entry only (no fake success) |
| Banks / purchases | Clearly unavailable |

## Blockers (cloud verification only)

1. Dedicated **Writeoff** Supabase project ref + anon key (+ service role for deploy/scripts) via store — do not commit  
2. Edge secrets: `MINDEE_API_KEY`, `OCR_PROVIDER=mindee` (paid OCR not activated on $0 budget)  
3. Apply migrations + deploy `extract-receipt`  
4. Docker / Xcode as before  

## Commands

```bash
npm install && npm run dev           # Jonathan: start here
npm run verify:template
npm run test:suggestions
npm run verify:receipt-flow          # dry run without keys
npm run build
```
