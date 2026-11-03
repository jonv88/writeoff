# Writeoff — free hosted browser preview

**Live HTTPS (Mac + iPhone):** https://writeoff-preview.vercel.app

Stable alias: https://writeoff-preview-jonathan-villanueva8.vercel.app

**$0 / no Supabase / no paid API keys / no secrets.** This is a free Vercel Hobby static host of the PR branch for testing only. **PR #1 is not merged. This is not a product production launch.**

## Open it

1. On Mac or iPhone Safari/Chrome, open **https://writeoff-preview.vercel.app**
2. Tap **Open with sample expenses** or **Start empty workspace**
3. Explore Review / Expenses / Snap a receipt / Setup

## How local storage works

- Expenses, setup, preferences, and attached receipt previews are stored in **this browser’s `localStorage` only** (`writeoff.local.preview.*` keys).
- **They do not sync across devices.** A Mac browser and an iPhone browser keep separate copies. Clearing site data wipes the preview.
- Reset: **Setup → Local preview controls → Reset to empty**, or **Exit local preview** in the header.

## Receipt OCR (on-device)

- **Snap a receipt** has two actions: **Take photo** (`capture=environment` rear camera when supported) and **Choose file** (library / picker, no forced camera).
- Photos are prepared in-browser (decode, EXIF-aware orientation when the engine supports it, resize for OCR). Receipt stays attached if OCR fails.
- Uses **Tesseract.js** (WASM) — real text recognition, not a fake success demo.
- Pipeline states: **Photo attached** → **Reading receipt** → **Details filled in** (or finish manually).
- Merchant, date, and total are auto-filled when found and **always stay editable**. User-typed values are not overwritten. Missing fields stay blank. Eligible write-off % is never set from OCR.
- Honest limits:
  - **Accuracy** varies with photo quality, angle, glare, and fonts.
  - **HEIC/HEIF**: decode attempted; if the browser can’t decode, clear message + finish manually with receipt attached. Prefer JPEG/PNG or iPhone **Most Compatible**.
  - **PDF**: unscannable here — attach and enter details manually.
  - **Language**: English (`eng`); other languages may fail.
  - **Speed**: first run downloads worker/language data from a CDN; phones can take longer.
  - **Desktop Take photo**: many desktop browsers open a file picker instead of a camera — expected; use Choose file or a phone for real capture.

## iPhone notes

- Prefer **Safari** or Chrome; add to Home Screen optional.
- Use **Take photo** for the rear camera, or **Choose file** for an existing shot.
- Allow camera/photos; shoot in good light; crop tightly around the receipt.
- If Photos gives HEIC, export as JPEG, or switch Camera to Most Compatible before testing OCR.
- Expect OCR to be slower than on Mac; leave the tab open while “Reading receipt…” progresses.
- Data on the phone **will not appear** on your Mac (and vice versa) — browser-local only.
- Physical iPhone camera open was not verified in the agent environment (viewport ≠ capture); please confirm Take photo on device Safari.

## What remains unavailable

| Feature | Status |
| --- | --- |
| Cloud sign-in / accounts | Unavailable (gated; no Writeoff Supabase project in this preview) |
| Cross-device sync | Unavailable — local storage only |
| Bank / card linking | Unavailable |
| Purchases / subscriptions | Unavailable |
| Cloud Mindee Edge Function OCR | Unavailable here (browser Tesseract only) |
| App Store / Capacitor ship | Not in scope |

## Local `npm run dev` (optional)

```bash
git clone https://github.com/jonv88/writeoff.git
cd writeoff
git checkout cursor/phase-a-foundation-85e1
npm install
npm run dev
```

Same local-storage + browser OCR behavior as the hosted preview.

## Screenshots

- Hosted preview: `/cursor/stores/bc-7967a11b-7ff7-4ed3-91a2-8c7564cbede4/media/hosted-preview/`
- Receipt scan autofill: `/cursor/stores/bc-7967a11b-7ff7-4ed3-91a2-8c7564cbede4/media/receipt-scan-fix/`

## Reference template

Immutable locked UI remains in `reference-template/` (`npm run verify:template`). Hosted preview preserves that shell.
