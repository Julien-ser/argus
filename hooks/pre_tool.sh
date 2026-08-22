#!/usr/bin/env bash
# Argus PreToolUse hook — forwards Claude Code event JSON to the Argus backend.
#
# Minimal fallback for machines without python3. The Python hooks are preferred
# (they add redaction modes and a circuit breaker); this one only guarantees the
# two non-negotiables: never block the tool call, never hang.
#
#   ARGUS_ENDPOINT    ingest URL (default http://localhost:7777/ingest)
#   ARGUS_INGEST_KEY  sent as a bearer token when set
payload=$(cat)
endpoint="${ARGUS_ENDPOINT:-http://localhost:7777/ingest}"
auth=()
[ -n "${ARGUS_INGEST_KEY:-}" ] && auth=(-H "Authorization: Bearer ${ARGUS_INGEST_KEY}")

curl -s -X POST "$endpoint" \
  --connect-timeout 0.5 --max-time 1 \
  -H "Content-Type: application/json" \
  "${auth[@]}" \
  -d "$payload" >/dev/null 2>&1

exit 0
