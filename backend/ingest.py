import json
import re
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlmodel import Session

from database import get_session
from models import Event
from models import Session as SessionModel
from transcript import cost_from_usage, find_transcript, sum_transcript
from trust import compute_trust_scores

router = APIRouter()

# ── Detection rules ──────────────────────────────────────────────────────────
# Every rule carries a severity so the flag feed can be triaged like a SIEM
# alert list rather than read as an undifferentiated pile of booleans.
SEVERITY_RANK = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}

# Plain substrings — these appear verbatim in real commands.
_BASH_DANGER = ["sudo", "rm -rf", "chmod 777"]

_RULE_SEVERITY = {
    "pipe to shell":      "critical",   # remote code, straight into a shell
    "dd to raw device":   "critical",
    "write to raw disk":  "critical",
    "rm -rf":             "high",
    "chmod 777":          "high",
    "sudo":               "medium",
    "write outside project": "high",
    "session cost":       "medium",
    "high event cost":    "low",
    "root-level subagent spawn": "info",
}


def _severity_of(label: str) -> str:
    return _RULE_SEVERITY.get(label, "low")


def _worst(severities: list[str]) -> str | None:
    return max(severities, key=lambda s: SEVERITY_RANK.get(s, 0)) if severities else None

# Patterns that a substring check cannot catch. "curl | bash" used to be in the
# list above, which meant it only matched a command written with exactly that
# spacing and no arguments — i.e. it never fired on a real pipe-to-shell like
# `curl -sSL https://host/install.sh | bash`. Regexes below, labelled so the
# flag reason still reads like a rule name.
_BASH_DANGER_RE = [
    (r"\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z|k|da|fi)?sh\b", "pipe to shell"),
    (r"\bchmod\s+(-[A-Za-z]+\s+)*777\b", "chmod 777"),
    (r"\bdd\s+if=.*\bof=/dev/", "dd to raw device"),
    (r">\s*/dev/sd[a-z]", "write to raw disk"),
]


def _recompute_trust(sess: SessionModel, db: Session) -> None:
    from sqlmodel import select
    events = db.exec(select(Event).where(Event.session_id == sess.id)).all()
    scores = compute_trust_scores(sess, events)
    sess.trust_score    = scores["trust_score"]
    sess.safety_score   = scores["safety_score"]
    sess.behavior_score = scores["behavior_score"]
    sess.economy_score  = scores["economy_score"]


def _evaluate_flags(event: Event, sess: SessionModel) -> tuple[bool, str | None, str | None]:
    """Evaluate all flag rules against an event and its parent session.

    Args:
        event: The event to evaluate (tool_name and tool_input already set).
        sess: The session the event belongs to (used for project_path and cumulative cost).

    Returns:
        A (flagged, flag_reason, severity) tuple. flag_reason is a semicolon-joined
        string of all triggered rule descriptions; severity is the highest of the
        triggered rules. Both are None if the event is clean.
    """
    reasons: list[str] = []
    severities: list[str] = []

    if event.tool_name == "Bash" and event.tool_input:
        try:
            cmd = json.loads(event.tool_input).get("command", "")
            # Report every rule that matched, not just the first. A command
            # like `curl ... | sudo bash` trips two, and a security feed that
            # only shows one of them hides half the reason it was flagged.
            hits = [p for p in _BASH_DANGER if p in cmd]
            hits += [label for pattern, label in _BASH_DANGER_RE
                     if re.search(pattern, cmd, re.IGNORECASE) and label not in hits]
            if hits:
                reasons.append("dangerous bash: " + ", ".join(f"'{h}'" for h in hits))
                severities += [_severity_of(h) for h in hits]
        except Exception:
            pass

    if event.tool_name in ("Write", "Edit") and event.tool_input:
        try:
            path = json.loads(event.tool_input).get("file_path", "")
            if path and sess.project_path:
                from pathlib import Path
                proj = Path(sess.project_path).resolve()
                target = Path(path).resolve()
                if target != proj and proj not in target.parents:
                    reasons.append(f"write outside project: {path}")
                    severities.append(_severity_of("write outside project"))
        except Exception:
            pass

    if event.type == "subagent_spawn" and not sess.parent_session_id:
        reasons.append("unexpected root-level subagent spawn")
        severities.append(_severity_of("root-level subagent spawn"))

    if event.cost_usd > 0.10:
        reasons.append(f"high event cost: ${event.cost_usd:.3f}")
        severities.append(_severity_of("high event cost"))

    if sess.total_cost_usd > 1.00:
        reasons.append(f"session cost > $1.00 (${sess.total_cost_usd:.3f})")
        severities.append(_severity_of("session cost"))

    return (bool(reasons), "; ".join(reasons) if reasons else None, _worst(severities))


@router.post("/ingest")
async def ingest(request: Request, db: Session = Depends(get_session)):
    """Receive a Claude Code hook event, upsert the session, write an Event row.

    Accepts the raw JSON body posted by the hook scripts.  On a Stop event the
    session is closed and token totals are backfilled from the Claude Code
    transcript JSONL.  On PreToolUse / PostToolUse an Event row is written and
    flag rules are evaluated immediately.
    """
    payload: dict[str, Any] = await request.json()

    session_id: str = payload.get("session_id") or str(uuid.uuid4())
    hook: str = payload.get("hook_event_name", "")
    cwd: str = payload.get("cwd", "")

    # Upsert session
    sess = db.get(SessionModel, session_id)
    if not sess:
        sess = SessionModel(
            id=session_id,
            project_path=cwd,
            parent_session_id=payload.get("parent_session_id"),
        )
        db.add(sess)
        db.commit()
        db.refresh(sess)

    _STOP_REASON_MAP = {
        "end_turn": "completed",
        "max_tokens": "interrupted",
        "stop_sequence": "completed",
        "tool_use": "interrupted",
    }

    # Stop hook — parse transcript for accurate token totals then close session
    if hook == "Stop":
        sess.ended_at = datetime.utcnow()
        raw_reason = payload.get("stop_reason", "")
        sess.status = _STOP_REASON_MAP.get(raw_reason, "completed")

        transcript_path = payload.get("transcript_path") or find_transcript(sess.project_path, session_id)
        if transcript_path:
            usage = sum_transcript(transcript_path)
            sess.total_input_tokens  = usage["input_tokens"]
            sess.total_output_tokens = usage["output_tokens"]
            sess.total_cost_usd      = cost_from_usage(usage)

        _recompute_trust(sess, db)
        db.add(sess)
        db.commit()
        return {"ok": True}

    # Build event
    tool_input    = payload.get("tool_input")
    tool_response = payload.get("tool_response")
    event_type    = "tool_call" if hook == "PreToolUse" else "tool_result"
    tool_name     = payload.get("tool_name")

    # Extract semantic fields from tool_input for analytics
    agent_type: str | None = None
    skill_name: str | None = None
    command: str | None = None
    if isinstance(tool_input, dict):
        if tool_name == "Agent":
            agent_type = tool_input.get("subagent_type") or "general-purpose"
        elif tool_name == "Skill":
            skill_name = tool_input.get("skill")
        elif tool_name == "Bash":
            raw_cmd = tool_input.get("command", "").lstrip()
            command = raw_cmd.split()[0] if raw_cmd else None

    event = Event(
        session_id=session_id,
        type=event_type,
        hook_event_name=hook,
        tool_name=tool_name,
        tool_input=json.dumps(tool_input) if tool_input is not None else None,
        tool_output=json.dumps(tool_response) if tool_response is not None else None,
        agent_type=agent_type,
        skill_name=skill_name,
        command=command,
    )

    event.flagged, event.flag_reason, event.severity = _evaluate_flags(event, sess)
    db.add(event)
    db.add(sess)
    db.commit()
    _recompute_trust(sess, db)
    db.add(sess)
    db.commit()
    return {"ok": True, "event_id": event.id}
