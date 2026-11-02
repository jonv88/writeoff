# Setup guide (Phase A)

## 1. Verify the locked template
```bash
npm run verify:template
```
If hashes differ from `TEMPLATE_LOCK.json`, stop and restore `reference-template/`.

## 2. Install
```bash
npm install
```

## 3. Supabase project (owner action)
1. Create a **dedicated** Writeoff project (do not reuse unrelated apps).
2. In the SQL editor (or `supabase db push` when linked), apply:
   - `supabase/migrations/20261102190000_phase_a_foundation.sql`
3. Confirm Auth email settings (confirmations / reset redirect to your app origin).
4. Copy Project URL and anon (or publishable) key into `.env`:
   ```bash
   cp .env.example .env
   ```
5. Never commit `.env` or the service-role key.

## 4. Run the web app
```bash
npm run dev
```
Open the printed local URL. Without env vars, the auth gate explains what is missing and links the reference preview.

## 5. Reference preview
```bash
npm run reference:preview
```
Or, with Vite running: `/reference-preview/`.

## 6. Capacitor / iOS (macOS + Xcode required)
```bash
npm run build
npx cap add ios    # once
npx cap sync ios
npx cap open ios
```
This Linux environment cannot complete signed device builds. Camera permissions and StoreKit are later phases.

## 7. Isolation check (after credentials)
1. Create user A and user B.
2. As A, add an expense and upload a receipt.
3. As B, confirm A’s rows are invisible via the client and that Storage signed URLs for A’s paths fail for B.
4. Record results in `FEATURE_STATUS.md`.

## 8. Build check
```bash
npm run build
```
