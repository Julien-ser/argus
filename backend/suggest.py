from __future__ import annotations

import json
import os
import urllib.request
from collections import Counter
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models import Event, Session as SessionModel

_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
_MODEL = "baidu/cobuddy:free"

_LLM_SYSTEM = (
    "You are a Claude Code workflow optimizer. Given a project usage summary and "
    "a list of rule-based suggestions, enrich the suggestions and add any new ones "
    "you spot. Return ONLY a JSON array where each object has exactly these keys: "
    "type (skill|hook|agent|config), priority (high|medium|low), pattern (one-line "
    "observation), suggestion (specific actionable recommendation), config_snippet "
    "(exact text the user can copy). No prose, no markdown fences — raw JSON only."
)


def _llm_enhance(summary: dict, rule_suggestions: list[dict]) -> list[dict]:
    """Call an OpenRouter free model to enrich rule-based suggestions.

    Falls back silently to rule_suggestions on any error or missing key.
    Set OPENROUTER_API_KEY to enable.
    """
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if not key:
        return rule_suggestions
    try:
        payload = json.dumps({
            "model": _MODEL,
            "max_tokens": 1024,
            "messages": [
                {"role": "system", "content": _LLM_SYSTEM},
                {"role": "user", "content": (
                    f"Project summary:\n{json.dumps(summary, indent=2)}\n\n"
                    f"Rule-based candidates:\n{json.dumps(rule_suggestions, indent=2)}\n\n"
                    "Return the enriched suggestions as a JSON array."
                )},
            ],
        }).encode()
        req = urllib.request.Request(
            _OPENROUTER_URL,
            data=payload,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=15) as resp:  # nosec B310
            result = json.loads(resp.read())
        text = result["choices"][0]["message"]["content"].strip()
        if text.startswith("```"):
            text = "\n".join(text.split("\n")[1:])
            if "```" in text:
                text = text[: text.rfind("```")]
        return json.loads(text.strip())
    except Exception:
        return rule_suggestions

_PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2, "info": 3}


def detect_patterns(
    sessions: list["SessionModel"],
    events: list["Event"],
) -> list[dict]:
    """Analyse sessions + events and return priority-sorted optimization suggestions.

    Each suggestion dict has: type, priority, pattern, suggestion, config_snippet.
    """
    if not sessions or not events:
        return []

    suggestions: list[dict] = []
    session_ids = {s.id for s in sessions}
    n = len(sessions)

    # ── 1. Agent type spawned in most sessions ────────────────────────────
    agent_events = [e for e in events if e.agent_type and e.session_id in session_ids]
    agent_sessions: dict[str, set[str]] = {}
    for e in agent_events:
        agent_sessions.setdefault(e.agent_type, set()).add(e.session_id)

    for agent_type, sess_set in agent_sessions.items():
        rate = len(sess_set) / n
        if rate >= 0.7:
            suggestions.append({
                "type": "hook",
                "priority": "high" if rate >= 0.9 else "medium",
                "pattern": f"`{agent_type}` agent spawned in {len(sess_set)}/{n} sessions ({rate:.0%})",
                "suggestion": (
                    f"Automate the `{agent_type}` agent via a PostToolUse hook so it fires "
                    "automatically without a manual invocation each session."
                ),
                "config_snippet": json.dumps(
                    {"hooks": {"PostToolUse": [{"matcher": "*", "hooks": [
                        {"type": "command", "command": f"# replace: auto-spawn {agent_type}"}
                    ]}]}},
                    indent=2,
                ),
            })

    # ── 2. Skill invoked frequently ───────────────────────────────────────
    skill_events = [e for e in events if e.skill_name and e.session_id in session_ids]
    skill_counts = Counter(e.skill_name for e in skill_events)

    for skill, count in skill_counts.most_common(5):
        if count >= 5:
            suggestions.append({
                "type": "config",
                "priority": "medium",
                "pattern": f"`/{skill}` invoked {count}× across {n} sessions",
                "suggestion": (
                    f"Pin `/{skill}` as a workflow reminder in CLAUDE.md so every session "
                    "uses it without needing to be prompted."
                ),
                "config_snippet": (
                    f"# Add to CLAUDE.md:\n"
                    f"# Run `/{skill}` after completing significant tasks in this project."
                ),
            })

    # ── 3. Repetitive bash commands ───────────────────────────────────────
    bash_events = [e for e in events if e.command and e.session_id in session_ids]
    cmd_counts = Counter(e.command for e in bash_events)
    total_bash = len(bash_events)

    for cmd, count in cmd_counts.most_common(5):
        if total_bash > 0 and count / total_bash >= 0.15 and count >= 5:
            suggestions.append({
                "type": "skill",
                "priority": "medium",
                "pattern": f"`{cmd}` accounts for {count}/{total_bash} bash calls ({count / total_bash:.0%})",
                "suggestion": (
                    f"Create a project skill that wraps common `{cmd}` workflows "
                    "to reduce repetitive command sequences."
                ),
                "config_snippet": (
                    f"# .claude/commands/{cmd}-workflow.md\n"
                    f"# Define standard `{cmd}` steps here so they run as /{cmd}-workflow."
                ),
            })

    # ── 4. Recurring flag patterns ────────────────────────────────────────
    flag_events = [e for e in events if e.flagged and e.flag_reason and e.session_id in session_ids]
    flag_counts: Counter = Counter()
    for e in flag_events:
        for r in (e.flag_reason or "").split(";"):
            r = r.strip()
            if r:
                flag_counts[r] += 1

    for reason, count in flag_counts.most_common(3):
        if count >= 2:
            is_serious = any(k in reason for k in ("dangerous", "outside", "high event cost"))
            suggestions.append({
                "type": "hook",
                "priority": "high" if is_serious else "medium",
                "pattern": f"Flag '{reason}' triggered {count}×",
                "suggestion": (
                    "Add a PreToolUse hook to intercept this pattern before execution "
                    "rather than flagging after the fact."
                ),
                "config_snippet": json.dumps(
                    {"hooks": {"PreToolUse": [{"matcher": "Bash", "hooks": [
                        {"type": "command", "command": "python3 ~/.argus/hooks/pre_tool.py"}
                    ]}]}},
                    indent=2,
                ),
            })

    # ── 5. High-cost sessions ─────────────────────────────────────────────
    high_cost = [s for s in sessions if (s.total_cost_usd or 0) > 0.50]
    if len(high_cost) >= 2:
        avg = sum(s.total_cost_usd for s in high_cost) / len(high_cost)
        suggestions.append({
            "type": "config",
            "priority": "high",
            "pattern": f"{len(high_cost)} sessions exceeded $0.50 (avg ${avg:.2f})",
            "suggestion": (
                "Break large tasks into focused sessions targeting < $0.20 each. "
                "Open-ended prompts balloon cost quickly."
            ),
            "config_snippet": (
                "# CLAUDE.md tip:\n"
                "# Scope sessions tightly — one goal per session.\n"
                "# Aim for < $0.20/session. Use /compact proactively on long threads."
            ),
        })

    # ── 6. Same file read repeatedly across sessions ──────────────────────
    read_events = [
        e for e in events
        if e.tool_name == "Read" and e.tool_input and e.session_id in session_ids
    ]
    path_counts: Counter = Counter()
    for e in read_events:
        try:
            fp = json.loads(e.tool_input).get("file_path", "")
            if fp:
                path_counts[fp] += 1
        except Exception:
            pass

    hot_reads = [(p, c) for p, c in path_counts.most_common(3) if c >= 5]
    if hot_reads:
        names = ", ".join(
            f"`{p.replace(chr(92), '/').rstrip('/').rsplit('/', 1)[-1]}`"
            for p, _ in hot_reads[:2]
        )
        suggestions.append({
            "type": "config",
            "priority": "low",
            "pattern": f"{names} each read {hot_reads[0][1]}+ times across sessions",
            "suggestion": (
                "Reference these files in CLAUDE.md so they are in Claude's context "
                "from the start, without being re-read every session."
            ),
            "config_snippet": (
                "# CLAUDE.md — key reference files:\n"
                + "\n".join(f"# See: {p}" for p, _ in hot_reads)
            ),
        })

    suggestions.sort(key=lambda s: _PRIORITY_ORDER.get(s["priority"], 99))

    summary = {
        "session_count": n,
        "top_tools": dict(Counter(e.tool_name for e in events if e.tool_name).most_common(10)),
        "agent_types": dict(Counter(e.agent_type for e in agent_events).most_common(5)),
        "skills": dict(skill_counts.most_common(5)),
        "bash_commands": dict(cmd_counts.most_common(10)),
        "flagged_events": len(flag_events),
        "avg_cost_usd": round(
            sum(s.total_cost_usd or 0 for s in sessions) / n, 4
        ),
    }
    return _llm_enhance(summary, suggestions)
