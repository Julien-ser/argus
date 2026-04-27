"""Utilities for reading token usage from Claude Code JSONL transcripts."""

import json
from pathlib import Path

INPUT_COST        = 3.00  / 1_000_000
OUTPUT_COST       = 15.00 / 1_000_000
CACHE_CREATE_COST = 3.75  / 1_000_000
CACHE_READ_COST   = 0.30  / 1_000_000


def find_transcript(project_path: str, session_id: str) -> Path | None:
    """Return the Path to the Claude Code transcript JSONL, or None if not found."""
    claude_projects = Path.home() / ".claude" / "projects"
    hash_name = (
        project_path
        .replace(":", "-")
        .replace("\\", "-")
        .replace("/", "-")
        .replace("_", "-")
    )
    candidate = claude_projects / hash_name / f"{session_id}.jsonl"
    return candidate if candidate.exists() else None


def sum_transcript(path: str | Path) -> dict:
    """Sum token usage across all assistant turns in a transcript."""
    totals = dict(
        input_tokens=0,
        output_tokens=0,
        cache_creation_input_tokens=0,
        cache_read_input_tokens=0,
    )
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                try:
                    msg = json.loads(line)
                    usage = msg.get("message", {}).get("usage") or {}
                    for key in totals:
                        totals[key] += usage.get(key, 0)
                except Exception:
                    pass
    except Exception:
        pass
    return totals


def cost_from_usage(usage: dict) -> float:
    return round(
        usage["input_tokens"]                  * INPUT_COST +
        usage["output_tokens"]                 * OUTPUT_COST +
        usage["cache_creation_input_tokens"]   * CACHE_CREATE_COST +
        usage["cache_read_input_tokens"]       * CACHE_READ_COST,
        6,
    )
