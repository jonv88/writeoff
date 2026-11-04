# Writeoff — Cursor implementation kit

1. Unzip this folder and open **Writeoff_Cursor_Kit** as a project in Cursor.
2. Open **CURSOR_PROMPT.md**, copy its complete contents and paste them into Cursor **Agent** mode.
3. Keep the entire folder available to Cursor, especially **reference-template/**. A prompt alone cannot preserve source it cannot access.

## What is included
- CURSOR_PROMPT.md — product requirements and phased implementation prompt.
- AGENTS.md and .cursor/rules/preserve-template.mdc — persistent project rules protecting the approved template.
- reference-template/ — exact HTML, CSS and JavaScript from the published prototype, unchanged.
- TEMPLATE_LOCK.json and reference-template/SHA256SUMS — source fingerprints and design reference details.

## Preview the exact original template locally
From this folder:

```bash
python3 -m http.server 8080 --directory reference-template
```

Open http://localhost:8080. All data entered in that reference preview stays in that browser. The original prototype starts with an empty workspace on a fresh origin; there is no personal seed data in this kit.

Published reference at handoff: https://writeoff-ledger-jv.jocosepuppy4.chatgpt.site
The included source is the authoritative snapshot if that URL later changes.

## Important scope
This kit preserves a working browser prototype, not a finished iOS application. No server, bank-provider account, API credentials, receipt OCR or subscription service is bundled. The prompt instructs Cursor to build and verify those systems without faking completion. The kit does not include ChatGPT hosting identity, deployment credentials, Git metadata or creator financial data.

Do not let Cursor replace the approved design with a starter theme. The design is locked; the engineering behind it is the work to build.

## Receipt-first update
The prompt now requires phone-camera receipt capture as a primary action, alongside bank/card and CSV imports. It includes real extraction, an editable review, safe offline/retry behavior and duplicate matching. This updates the build requirements; it does not claim the frozen prototype already has OCR or native camera integration. The exact reference-template source remains unchanged.
