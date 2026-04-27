#!/usr/bin/env bash
# Argus Stop hook — notifies Argus backend that the session ended
payload=$(cat)
curl -s -X POST "http://localhost:7777/ingest" \
  -H "Content-Type: application/json" \
  -d "$payload" >/dev/null 2>&1
exit 0
