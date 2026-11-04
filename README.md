# Writeoff

Subscription product (web first) that organizes expenses and receipts, **suggests possible write-offs**, and keeps every suggestion easy to review or edit.

The approved prototype in `reference-template/` is the locked visual baseline — do not redesign it.

## Try it now (no cloud)

```bash
npm install
npm run dev
```

Open **http://localhost:5173/** → **Open with sample expenses** or **Start empty workspace**.

Full steps: **[PREVIEW.md](./PREVIEW.md)**

## What works in local preview
Expense CRUD · receipt file attach (manual details) · Business/Personal/Split · suggestions · business-use & eligible % · totals · search/filters · CSV · sample data / reset.

**Not available:** cloud sync, automatic OCR, banks, purchases (labeled honestly — never faked).

## Cloud / backend (optional later)
```bash
cp .env.example .env   # Writeoff project URL + anon only
# apply supabase/migrations — see docs/APPLY_MIGRATIONS.md
npm run dev
```

Receipt OCR (when configured) uses the authenticated `extract-receipt` Edge Function — see [docs/RECEIPT_OCR.md](./docs/RECEIPT_OCR.md). Never put OCR or service-role secrets in `VITE_*`.

## Docs
- [PREVIEW.md](./PREVIEW.md) — local startup for Jonathan / testers  
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)  
- [FEATURE_STATUS.md](./FEATURE_STATUS.md)  
- [DESIGN_PARITY.md](./DESIGN_PARITY.md)  
- [docs/SETUP.md](./docs/SETUP.md)  
- [AGENTS.md](./AGENTS.md)
