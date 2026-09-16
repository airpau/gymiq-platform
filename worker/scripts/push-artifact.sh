#!/usr/bin/env bash
# Pushes a CRM export (and the day's sales-log JSON, if present) to the worker's
# artifact store. This is the ONE line the Mac mini openclaw job needs after it
# downloads Members_*.xlsx, and it is exactly what a customer's own script or
# the hosted collector will do. No business logic here.
#
#   GYMIQ_WORKER_URL=https://gymiq-worker.fly.dev \
#   GYMIQ_SITE_ID=95f75b9f-2ff3-4c83-9fd0-168651ed7128 \
#   GYMIQ_INGEST_TOKEN=... \
#   push-artifact.sh ~/.openclaw/workspace/downloads/Members_2026-09-16_073012.xlsx [~/.openclaw/workspace/glofox-sales-log/2026-09-16.json]
set -euo pipefail
: "${GYMIQ_WORKER_URL:?set GYMIQ_WORKER_URL}"
: "${GYMIQ_SITE_ID:?set GYMIQ_SITE_ID}"
: "${GYMIQ_INGEST_TOKEN:?set GYMIQ_INGEST_TOKEN}"

push() {
  local f="$1"
  [ -f "$f" ] || { echo "skip: $f not found" >&2; return 0; }
  local name; name="$(basename "$f")"
  local ctype="application/octet-stream"
  case "$name" in *.json) ctype="application/json";; *.xlsx) ctype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";; esac
  curl -sS -f -X POST \
    -H "Authorization: Bearer ${GYMIQ_INGEST_TOKEN}" \
    -H "Content-Type: ${ctype}" \
    --data-binary @"$f" \
    "${GYMIQ_WORKER_URL%/}/artifacts/${GYMIQ_SITE_ID}/${name}"
  echo
}

for f in "$@"; do push "$f"; done
