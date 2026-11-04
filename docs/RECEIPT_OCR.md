# Receipt OCR — provider choice & server setup

## Recommendation: **Mindee Expense Receipts (V5)**

| | |
| --- | --- |
| **Why** | Purpose-built receipt fields (merchant, date, total, currency, tax) with per-field confidence; simple REST `Token` auth; easy to call from a Supabase Edge Function. |
| **Dev / free tier** | Free plan historically includes a limited monthly document quota (commonly cited ~**250 docs/month** on free — confirm current Mindee pricing before relying on it). Enough for synthetic fixtures and early QA. |
| **Paid (approx.)** | Growth/business plans are typically **tens of dollars/month** with higher quotas, or usage-based document pricing beyond the free allotment. Treat figures as approximate; check [mindee.com pricing](https://www.mindee.com/pricing) before activating paid services. |
| **Alternatives** | Google Document AI Expense Parser (GCP project + processor; strong quality, more setup; free trial credits then ~per-page). AWS Textract AnalyzeExpense (AWS account; short free-tier windows then ~$1.50/1k pages class pricing). Veryfi (receipt-focused SaaS; sandbox available; usually paid after trial). |

**We do not activate paid services in this repo.** The adapter returns an honest `blocked` status when `MINDEE_API_KEY` is unset.

## Architecture

```
Browser (JWT + anon key)
  → POST /functions/v1/extract-receipt  (multipart file)
    → verify JWT / ownership
    → store in private Storage bucket `receipts` at `{userId}/…`
    → Mindee (server secret)
    → JSON: merchant, date, total, currency, confidence, uncertainFields, storagePath
```

Provider secrets and `service_role` never appear in `VITE_*` or the client bundle.

## Server secrets (Edge Function)

| Secret | Purpose |
| --- | --- |
| `MINDEE_API_KEY` | Mindee API token |
| `OCR_PROVIDER` | `mindee` (default) or `none` |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Injected by Supabase for the function |

## Deploy

```bash
# From repo root, after linking the Writeoff project (not Rhev):
npx supabase functions deploy extract-receipt --project-ref YOUR_WRITEOFF_REF
# Set secrets in Dashboard or:
npx supabase secrets set MINDEE_API_KEY=… OCR_PROVIDER=mindee --project-ref YOUR_WRITEOFF_REF
```

Or use Supabase MCP `deploy_edge_function` once the Writeoff project ref is available in the store (do not commit keys).

## Client

Uses only `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. See `src/lib/ocr/adapter.ts`.
