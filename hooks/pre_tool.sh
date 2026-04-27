#!/usr/bin/env bash
# Argus PreToolUse hook — forwards Claude Code event JSON to Argus backend
payload=$(cat)
curl -s -X POST "http://localhost:7777/ingest" \
  -H "Content-Type: application/json" \
  -d "$payload" >/dev/null 2>&1
exit 0
