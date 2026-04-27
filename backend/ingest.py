import json
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlmodel import Session

from database import get_session
from models import Event, Session as SessionModel

router = APIRouter()

_BASH_DANGER = ["sudo", "rm -rf", "curl | bash", "chmod 777"]


def _evaluate_flags(event: Event, sess: SessionModel) -> tuple[bool, str | None]:
    reasons: list[str] = []

    if event.tool_name == "Bash" and event.tool_input:
        try:
            cmd = json.loads(event.tool_input).get("command", "")
            for pat in _BASH_DANGER:
                if pat in cmd:
                    reasons.append(f"dangerous bash: '{pat}'")
                    break
        except Exception:
            pass

    if event.tool_name in ("Write", "Edit") and event.tool_input:
        try:
            path = json.loads(event.tool_input).get("file_path", "")
            if path and sess.project_path and not path.startswith(sess.project_path):
                reasons.append(f"write outside project: {path}")
        except Exception:
            pass

    if event.type == "subagent_spawn" and not sess.parent_session_id:
        reasons.append("unexpected root-level subagent spawn")

    if event.cost_usd > 0.10:
        reasons.append(f"high event cost: ${event.cost_usd:.3f}")

    if sess.total_cost_usd > 1.00:
        reasons.append(f"session cost > $1.00 (${sess.total_cost_usd:.3f})")

    return (bool(reasons), "; ".join(reasons) if reasons else None)


@router.post("/ingest")
async def ingest(request: Request, db: Session = Depends(get_session)):
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

    # Stop hook — mark session closed
    if hook == "Stop" or "stop_reason" in payload:
        sess.ended_at = datetime.utcnow()
        sess.status = payload.get("stop_reason", "completed")
        db.add(sess)
        db.commit()
        return {"ok": True}

    # Build event
    tool_input = payload.get("tool_input")
    tool_response = payload.get("tool_response")
    event_type = "tool_call" if hook == "PreToolUse" else "tool_result"

    event = Event(
        session_id=session_id,
        type=event_type,
        tool_name=payload.get("tool_name"),
        tool_input=json.dumps(tool_input) if tool_input is not None else None,
        tool_output=json.dumps(tool_response) if tool_response is not None else None,
    )

    event.flagged, event.flag_reason = _evaluate_flags(event, sess)
    db.add(event)

    sess.total_input_tokens += event.input_tokens
    sess.total_output_tokens += event.output_tokens
    sess.total_cost_usd += event.cost_usd
    db.add(sess)

    db.commit()
    return {"ok": True, "event_id": event.id}
