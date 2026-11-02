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

- Uses **Tesseract.js** (WASM) in the browser — real text recognition, not a fake success demo.
- Merchant, date, and total are filled when possible and **always stay editable**.
- Honest limits:
  - **Accuracy** varies with photo quality, angle, glare, and fonts.
  - **HEIC/HEIF** (common iPhone default): not converted here — use JPEG/PNG, or iPhone **Settings → Camera → Formats → Most Compatible**.
  - **PDF**: limited; prefer a photo.
  - **Language**: English (`eng`) trained data; other languages may fail.
  - **Speed**: first run downloads worker/language data from a CDN; phones can take longer than desktop.
  - If OCR can’t read fields, the UI says so and you enter them manually.

## iPhone notes

- Prefer **Safari** or Chrome; add to Home Screen optional.
- For camera snaps: allow camera/photos; shoot in good light; crop tightly around the receipt.
- If the Photos app gives HEIC, convert/export as JPEG, or switch Camera to Most Compatible before testing OCR.
- Expect OCR to be slower than on Mac; leave the tab open while “Reading receipt…” progresses.
- Data on the phone **will not appear** on your Mac (and vice versa) — browser-local only.

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

See `/cursor/stores/bc-7967a11b-7ff7-4ed3-91a2-8c7564cbede4/media/hosted-preview/`.

## Reference template

Immutable locked UI remains in `reference-template/` (`npm run verify:template`). Hosted preview preserves that shell.
