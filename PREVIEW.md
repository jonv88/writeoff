# Writeoff — local browser preview

**$0 / no cloud required.** Open the app, try sample expenses or an empty workspace, and exercise the core review loop on this device.

## Start

```bash
git clone https://github.com/jonv88/writeoff.git
cd writeoff
git checkout cursor/phase-a-foundation-85e1
npm install
npm run dev
```

Open the URL Vite prints (usually **http://localhost:5173/**).

Optional host binding (LAN / VM):

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

## First screen

1. **Open with sample expenses** — synthetic Demo Studio data (not real finances).  
2. **Start empty workspace** — blank slate for your own test expenses.

Both paths use **browser-local storage** only. They are labeled as local preview — not cloud sync.

## What you can test now

| Works locally | Notes |
| --- | --- |
| Add / edit / delete expenses | Dialogs match the locked template |
| Snap / attach receipt file | File stays on this device; **enter merchant, date, amount yourself** |
| Business / Personal / Split review | Profile-aware suggestions |
| Edit business-use % and eligible % | Kept separate; eligible needs your check |
| Totals & category stats | Possible write-offs ≠ tax savings |
| Search, filters, CSV export | Expenses + Setup |
| Load sample / Reset to empty | Setup → Local preview controls |
| Workspace setup | Mode, work type, industry, tax year, etc. |

## Not available (honest)

- Cloud sign-in / cross-device sync (until a Writeoff Supabase project is configured)  
- Automatic OCR extraction (no fake success — manual entry after attach)  
- Bank / card linking  
- Purchases / subscriptions  

## Reset

**Setup → Local preview controls → Reset to empty**, or leave preview with **Exit local preview** in the header.

## Cloud later

Copy `.env.example` → `.env` with a **dedicated** Writeoff project URL + anon key, apply `supabase/migrations/`, restart. See `docs/SETUP.md`. Do not put OCR or service-role secrets in `VITE_*`.

## Reference template

Immutable locked UI: `npm run reference:preview` → http://localhost:8080  
Or with the app running: `/reference-preview/`
