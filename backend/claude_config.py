from __future__ import annotations

import json
import re
from pathlib import Path


def _read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _read_text(path: Path) -> str | None:
    try:
        text = path.read_text(encoding="utf-8")
        return text if text.strip() else None
    except Exception:
        return None


def _list_commands(commands_dir: Path) -> list[dict]:
    """Return [{name, preview}] for each .md file in a commands directory."""
    if not commands_dir.is_dir():
        return []
    result = []
    for f in sorted(commands_dir.glob("*.md")):
        preview = (_read_text(f) or "").strip()[:180]
        result.append({"name": f.stem, "preview": preview})
    return result


def analyze_config(
    project_path: str,
    fired_hook_names: set[str] | None = None,
) -> dict:
    """Read all .claude artefacts for a project and return a structured analysis.

    Args:
        project_path: Absolute path to the project root.
        fired_hook_names: Set of hook_event_name values from session events.
            Passed by the router so this module stays file-system-only.
    """
    fired = fired_hook_names or set()
    root = Path(project_path) if project_path else None
    dot_claude_proj = (root / ".claude") if root else None
    dot_claude_global = Path.home() / ".claude"

    # ── Read artefacts ────────────────────────────────────────────────────
    claude_md = _read_text(root / "CLAUDE.md") if root else None
    project_settings = _read_json(dot_claude_proj / "settings.json") if dot_claude_proj else {}
    global_settings = _read_json(dot_claude_global / "settings.json")
    project_commands = _list_commands(dot_claude_proj / "commands") if dot_claude_proj else []
    global_commands = _list_commands(dot_claude_global / "commands")

    # ── Hook registration vs actual fires ─────────────────────────────────
    project_hooks: dict = project_settings.get("hooks", {})
    global_hooks: dict = global_settings.get("hooks", {})
    registered: set[str] = set(project_hooks) | set(global_hooks)
    unregistered_fires = sorted(fired - registered)

    hook_summary = {
        "registered": sorted(registered),
        "fired": sorted(fired),
        "unregistered_fires": unregistered_fires,
    }

    # ── Observations ──────────────────────────────────────────────────────
    observations: list[dict] = []

    if claude_md is None:
        observations.append({
            "level": "info",
            "title": "No CLAUDE.md found",
            "detail": (
                "A CLAUDE.md file embeds persistent instructions — conventions, workflow "
                "reminders, and banned patterns — that Claude reads at the start of every session."
            ),
        })

    for hook_type in unregistered_fires:
        observations.append({
            "level": "warning",
            "title": f"{hook_type} fires but isn't registered in any settings.json",
            "detail": (
                f"{hook_type} events appear in session history, but no {hook_type} "
                "entry exists in project or global settings.json. "
                "The hook may have been removed or registered outside this tool."
            ),
        })

    if "Stop" not in registered:
        observations.append({
            "level": "info",
            "title": "No Stop hook registered",
            "detail": (
                "A Stop hook runs after every session ends and can trigger post-session "
                "summaries, cost reports, or notifications."
            ),
        })

    if "PreToolUse" not in registered:
        observations.append({
            "level": "info",
            "title": "No PreToolUse hook registered",
            "detail": (
                "A PreToolUse hook intercepts tool calls before execution — "
                "useful for safety checks, logging, or cost guards."
            ),
        })

    # CLAUDE.md rule cross-references
    if claude_md:
        if re.search(r"no[\s\-]?mock|avoid\s+mock|don.t\s+mock", claude_md, re.IGNORECASE):
            observations.append({
                "level": "info",
                "title": "CLAUDE.md has a no-mock rule",
                "detail": (
                    "Argus will flag Write/Edit events containing 'mock' in tool_input "
                    "as potential violations of this rule."
                ),
            })

        ban_patterns = re.findall(
            r"(?:never|don.t|avoid|no)\s+(?:use\s+|run\s+)?`([^`]+)`",
            claude_md, re.IGNORECASE,
        )
        if ban_patterns:
            joined = ", ".join(f"`{b}`" for b in ban_patterns[:4])
            observations.append({
                "level": "info",
                "title": f"CLAUDE.md bans {len(ban_patterns)} command(s): {joined}",
                "detail": (
                    "Argus cross-references these bans against Bash events across sessions. "
                    "Violations surface as high-priority suggestions."
                ),
            })

    return {
        "claude_md": claude_md,
        "has_claude_md": claude_md is not None,
        "project_settings": project_settings,
        "global_settings_summary": {
            "hooks_registered": sorted(global_hooks.keys()),
            "model": global_settings.get("model"),
            "theme": global_settings.get("theme"),
            "permissions_allow_count": len(
                global_settings.get("permissions", {}).get("allow", [])
            ),
        },
        "project_commands": project_commands,
        "global_commands": global_commands,
        "hook_summary": hook_summary,
        "observations": observations,
    }
