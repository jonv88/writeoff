# Apply migrations to the dedicated Writeoff project

**Do not use Rhev / RHEV Development.** Wait for the Writeoff project ref + keys in the Project store under `/cursor/stores/…/internal/` (secrets file — never commit).

## Migrations (order)

1. `supabase/migrations/20261102190000_phase_a_foundation.sql` — profiles, expenses, receipts, merchant_rules, RLS, private `receipts` bucket  
2. `supabase/migrations/20261102220000_phase_b_suggestions.sql` — suggestion/profile columns  

## Option A — Supabase MCP (preferred in this environment)

When `WRITEOFF_PROJECT_REF` (or equivalent) appears in the store:

```text
apply_migration(project_id, name: "phase_a_foundation", query: <file 1>)
apply_migration(project_id, name: "phase_b_suggestions", query: <file 2>)
deploy_edge_function(project_id, name: "extract-receipt", files: […])
```

Then set Edge secrets `MINDEE_API_KEY`, `OCR_PROVIDER=mindee`.

## Option B — CLI

```bash
npx supabase link --project-ref YOUR_WRITEOFF_REF
npx supabase db push
npx supabase functions deploy extract-receipt
npx supabase secrets set OCR_PROVIDER=mindee MINDEE_API_KEY="…"
```

## Option C — SQL editor

Paste each migration file into the Writeoff project SQL editor and run.

## After apply

1. Put public URL + anon key in local `.env` (gitignored).  
2. `npm run verify:receipt-flow` (requires users + optional Mindee key).  
3. Record isolation results in `FEATURE_STATUS.md`.

## Helper script

`scripts/apply-migrations.sh` prints the files and refuses to run against unknown project refs unless `WRITEOFF_PROJECT_REF` is set in the environment (from the store file, not committed).
