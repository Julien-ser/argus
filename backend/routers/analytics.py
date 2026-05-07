import json
from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlmodel import Session, select

from database import get_session
from models import Event

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _top_n(db: Session, column, where=None, n: int = 20) -> list[dict]:
    """Return the top-N most frequent non-null values for a given Event column.

    Args:
        db: Database session.
        column: SQLModel/SQLAlchemy column expression to group by.
        where: Optional additional WHERE clause (e.g. ``Event.tool_name == "Bash"``).
        n: Maximum number of results to return (default 20).

    Returns:
        List of ``{"name": value, "count": int}`` dicts ordered by count descending.
    """
    q = select(column, func.count().label("count")).where(column.isnot(None))
    if where is not None:
        q = q.where(where)
    rows = db.exec(q.group_by(column).order_by(func.count().desc()).limit(n)).all()
    return [{"name": row[0], "count": row[1]} for row in rows]


@router.get("")
def analytics(db: Session = Depends(get_session)) -> dict:
    """Return aggregated usage breakdowns across all events.

    Returns a dict with keys: tools, hooks, agents, skills, commands.
    Each value is a list of ``{"name": str, "count": int}`` dicts.
    """
    return {
        "tools": _top_n(db, Event.tool_name),
        "hooks": _top_n(db, Event.hook_event_name),
        "agents": _top_n(db, Event.agent_type, where=Event.tool_name == "Agent"),
        "skills": _top_n(db, Event.skill_name, where=Event.tool_name == "Skill"),
        "commands": _top_n(db, Event.command, where=Event.tool_name == "Bash"),
    }


@router.get("/agents")
def agent_detail(db: Session = Depends(get_session)) -> list[dict]:
    """Return per-agent-type breakdown with invocation counts, session counts,
    total cost, and a preview of recent prompts."""
    rows = db.exec(
        select(Event)
        .where(Event.tool_name == "Agent")
        .where(Event.agent_type.isnot(None))
        .order_by(Event.timestamp.desc())
    ).all()

    by_type: dict[str, list] = defaultdict(list)
    for e in rows:
        by_type[e.agent_type].append(e)

    result = []
    for agent_type, events in sorted(by_type.items(), key=lambda x: -len(x[1])):
        sessions = {e.session_id for e in events}
        total_cost = sum(e.cost_usd or 0 for e in events)

        recent = []
        for e in events[:10]:
            prompt_preview = ""
            if e.tool_input:
                try:
                    inp = json.loads(e.tool_input)
                    prompt_preview = str(inp.get("prompt", inp.get("description", "")))[:150]
                except Exception:
                    pass
            recent.append({
                "session_id": e.session_id,
                "timestamp": e.timestamp.isoformat() if e.timestamp else None,
                "prompt_preview": prompt_preview,
                "cost_usd": round(e.cost_usd or 0, 5),
                "flagged": e.flagged,
            })

        result.append({
            "type": agent_type,
            "invocations": len(events),
            "sessions": len(sessions),
            "total_cost_usd": round(total_cost, 4),
            "recent": recent,
        })

    return result
