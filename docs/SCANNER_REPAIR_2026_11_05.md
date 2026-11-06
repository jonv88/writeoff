# Receipt form contamination repair

## Verified cause
The private preview branch `cursor/veryfi-mock-iphone-9e74` at ed78b7a imported `veryfiMockFallback` directly into SnapReceiptDialog. Its conflicting-total sample contains Harbor Market and November 2, 2026. Pressing that control writes those sample values into the user's active receipt draft. The supplied Walgreens screenshots show that outcome. This is unrelated to whether Veryfi can recognize Walgreens: live Veryfi is disabled and the photo was not sent.

## Change
Remove all mock response imports, controls, and sample-writing code from the receipt dialog. Retain isolated mock unit fixtures outside the customer path. Add scan generation checks for progress and completion, invalidate on close/reopen/unmount, clear prior scan fields and matching state for each photo, and retain the attached photo with editable review if extraction throws.

Existing saved expenses are not rewritten; the app cannot reliably distinguish an intentional user merchant from a previously saved mock value. Inspect affected test records before using them.

## Verification
- Production build: PASS (existing large bundle warning).
- Receipt parser regression suite: PASS.
- Scan isolation and runtime mock import boundary: PASS.
- Locked template hashes: PASS; no reference files or CSS changed.
- Browser/visual/full photo-to-save: NOT VERIFIED in this environment. Playwright package is available, but its browser executable is missing and the browser download returned invalid/truncated ZIP data. No substitute screenshot claim.
- Physical iPhone: NOT VERIFIED.
- Hosted extraction: NOT IMPLEMENTED by this repair. SnapReceiptDialog still explicitly requests on-device extraction. No photo uploaded, no hosted cost.

## Remaining live integration
Build and verify a protected server endpoint for receipt extraction, with credentials scoped to the preview runtime, request size/type validation, bounded usage, request-to-photo identity, and per-field source evidence. Vercel refused even a non-decrypting environment metadata check with HTTP 403 for team_ArhABluVL02MhbvwzDWacDwZ; team authorization is required to inspect its configuration. Cursor runtime secrets do not automatically populate Vercel deployments. Do not infer allowance from document listing counts or silently enable billable processing.

PR #1 remains open. This repair targets the private preview branch separately so it does not overwrite parallel Cursor changes or alter the public preview.
