#!/usr/bin/env python3
"""Argus pre_tool hook — forwards the Claude Code event to the Argus backend.

Everything is delegated to _send.py so the three hooks cannot drift apart.
Any failure is swallowed: this process must always exit 0 (a non-zero
PreToolUse exit would block the user's tool call).
"""
import os
import sys

try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from _send import send

    send(sys.stdin.buffer.read())
except Exception:
    pass
