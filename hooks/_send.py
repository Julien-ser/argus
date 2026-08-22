#!/usr/bin/env python3
"""Shared transport for the Argus hooks.

Design rules, in priority order:

1. **Never break the user's Claude Code session.** Every failure path is
   swallowed and the process exits 0. A PreToolUse hook that exits 2 blocks the
   tool call outright, so an exception escaping this module would turn an
   observability tool into a broken editor.
2. **Never add noticeable latency**, even when the backend is down. A short
   timeout bounds the worst case, and a circuit breaker means a down backend
   costs one slow call per minute instead of one per tool call.
3. **Never ship data the user didn't agree to ship.** Anything sent to a
   non-local endpoint is redacted by default.

Environment:
  ARGUS_ENDPOINT    ingest URL (default http://localhost:7777/ingest)
  ARGUS_INGEST_KEY  sent as `Authorization: Bearer ...` when set
  ARGUS_MODE        full | redacted | metadata
                    (default: full for localhost, redacted for anything else)
  ARGUS_TIMEOUT     seconds, default 0.75
"""

import json
import os
import tempfile
import time
import urllib.request
from pathlib import Path

DEFAULT_ENDPOINT = "http://localhost:7777/ingest"
BREAKER_PATH = Path(tempfile.gettempdir()) / ".argus-breaker"
BREAKER_SECONDS = 60

# Substrings that mark a key or value as secret-ish. Deliberately broad — a
# false positive costs one redacted field, a false negative leaks a credential.
_SECRET_HINTS = (
    "api_key", "apikey", "api-key", "secret", "token", "password", "passwd",
    "credential", "authorization", "auth_token", "private_key", "session_key",
)
_SECRET_VALUE_PREFIXES = ("sk-", "sk_", "ghp_", "gho_", "github_pat_", "xoxb-", "AKIA")
_REDACTED = "[argus:redacted]"


def _endpoint() -> str:
    return os.environ.get("ARGUS_ENDPOINT", DEFAULT_ENDPOINT).strip() or DEFAULT_ENDPOINT


def _is_local(url: str) -> bool:
    try:
        from urllib.parse import urlparse
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return False
    return host in ("localhost", "127.0.0.1", "::1")


def _mode(url: str) -> str:
    mode = (os.environ.get("ARGUS_MODE") or "").strip().lower()
    if mode in ("full", "redacted", "metadata"):
        return mode
    # Local self-hosted instance: the data never leaves the machine, so keep it
    # whole. Anything remote is redacted unless the user opts out explicitly.
    return "full" if _is_local(url) else "redacted"


def _timeout() -> float:
    try:
        return max(0.1, float(os.environ.get("ARGUS_TIMEOUT", "0.75")))
    except (TypeError, ValueError):
        return 0.75


# ── circuit breaker ──────────────────────────────────────────────────────────
# Without this, an unreachable backend costs `timeout` seconds on *every* tool
# call for the whole session. With it, one failure suppresses attempts for a
# minute, so the tax is bounded no matter how long the backend stays down.

def _breaker_open() -> bool:
    try:
        return (time.time() - BREAKER_PATH.stat().st_mtime) < BREAKER_SECONDS
    except OSError:
        return False


def _trip_breaker() -> None:
    try:
        BREAKER_PATH.touch()
    except OSError:
        pass


def _clear_breaker() -> None:
    try:
        BREAKER_PATH.unlink()
    except OSError:
        pass


# ── payload shaping ──────────────────────────────────────────────────────────

def _scrub(value, home: str, depth: int = 0):
    """Recursively redact secret-looking values and absolute home paths."""
    if depth > 12:
        return value
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            if any(hint in str(k).lower() for hint in _SECRET_HINTS):
                out[k] = _REDACTED
            else:
                out[k] = _scrub(v, home, depth + 1)
        return out
    if isinstance(value, list):
        return [_scrub(v, home, depth + 1) for v in value]
    if isinstance(value, str):
        if value.startswith(_SECRET_VALUE_PREFIXES):
            return _REDACTED
        if home and home in value:
            return value.replace(home, "~")
        return value
    return value


# Fields that carry arbitrary user content — dropped entirely in metadata mode.
_CONTENT_FIELDS = ("tool_input", "tool_output", "tool_response", "content", "prompt")


def shape(payload: bytes, mode: str):
    """Return the bytes to send, or None to send nothing."""
    if mode == "full":
        return payload
    try:
        data = json.loads(payload.decode("utf-8"))
    except Exception:
        # Unparseable and we were asked not to send raw content — send nothing
        # rather than guess. Silence is the safe failure here.
        return None
    if not isinstance(data, dict):
        return None
    if mode == "metadata":
        for field in _CONTENT_FIELDS:
            if field in data:
                data[field] = _REDACTED
    else:  # redacted
        data = _scrub(data, os.path.expanduser("~"))
    try:
        return json.dumps(data).encode("utf-8")
    except Exception:
        return None


# ── transport ────────────────────────────────────────────────────────────────

def send(payload: bytes) -> None:
    """Best-effort POST. Never raises, never blocks for long."""
    try:
        if not payload:
            return
url = _endpoint()
if _breaker_open():
    return
        body = shape(payload, _mode(url))
        if not body:
            return
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        key = os.environ.get("ARGUS_INGEST_KEY")
        if key:
            req.add_header("Authorization", "Bearer " + key)
        urllib.request.urlopen(req, timeout=_timeout())
        if BREAKER_PATH.exists():
            _clear_breaker()
    except Exception:
        try:
            _trip_breaker()
        except Exception:
            pass
