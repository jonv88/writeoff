# Legacy browser storage migration

## What the prototype stored
| Key | Shape |
| --- | --- |
| `writeoff.workspace.v2` | `{ records, profile, rules }` |
| `writeoff.records.v1` | `ExpenseRecord[]` (older) |

Detection and import helpers live in `src/lib/legacyMigration.ts`.

## Rules (Phase A)
1. **Never** silently upload browser financial data when a user signs in.
2. Detect keys on the Setup screen and show an explicit panel.
3. Import only after the customer confirms; preview counts before write.
4. Persist to the signed-in Supabase account with idempotent-ish skips (existing IDs / fingerprint collisions).
5. Clear `localStorage` keys **only after** the server write succeeds.
6. On failure, leave browser data untouched.
7. Receipt **data URLs** from the prototype are **not** auto-uploaded to Storage (size/privacy). Customers re-attach files after import.

## Customer flow
Setup → “Browser records found” → Preview & import → confirmation toast → browser keys cleared.

## Later phases
Full backup JSON restore with receipt blobs, stronger dedupe UX, and retention messaging for account deletion.
