#!/usr/bin/env python3
import sys
import urllib.request

payload = sys.stdin.buffer.read()
try:
    req = urllib.request.Request(
        "http://localhost:7777/ingest",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    urllib.request.urlopen(req, timeout=2)
except Exception:
    pass
