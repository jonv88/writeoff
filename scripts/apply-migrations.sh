#!/usr/bin/env bash
# Prints / optionally applies Writeoff migrations. Never targets Rhev by default.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REF="${WRITEOFF_PROJECT_REF:-}"
RHEV_BLOCKLIST="kifjorbyzgiucqtnfctn vlvxkviyrhnwyczctjvz"

echo "Writeoff migrations:"
ls -1 "$ROOT/supabase/migrations/"*.sql

if [[ -z "$REF" ]]; then
  echo
  echo "WRITEOFF_PROJECT_REF is unset."
  echo "Load the dedicated Writeoff project ref from the Project store (internal/), then:"
  echo "  export WRITEOFF_PROJECT_REF=…"
  echo "  export SUPABASE_ACCESS_TOKEN=…   # if using CLI"
  echo "  $0 --push"
  exit 0
fi

for blocked in $RHEV_BLOCKLIST; do
  if [[ "$REF" == "$blocked" ]]; then
    echo "Refuses to apply to known non-Writeoff project ($REF)."
    exit 1
  fi
done

if [[ "$REF" != "bmmoaticogacrsqztafq" ]]; then
  echo "Refuses to apply: target is not the dedicated Writeoff project."
  exit 1
fi

echo "Target project ref: $REF"

if [[ "${1:-}" == "--push" ]]; then
  npx supabase link --project-ref "$REF"
  npx supabase db push
  echo "Migrations pushed. Receipt reading stays on the private preview. Do not deploy a second OCR function."
else
  echo "Dry run only. Pass --push to link and db push (requires CLI auth)."
fi
