from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from claude_config import analyze_config
from database import get_session
from models import Event, Session as SessionModel
from suggest import detect_patterns

router = APIRouter(prefix="/projects", tags=["projects"])


def _basename(path: str) -> str:
    return path.replace("\\", "/").rstrip("/").rsplit("/", 1)[-1] or path


@router.get("")
def list_projects(db: Session = Depends(get_session)) -> list[dict]:
    """Return all projects (sessions grouped by project_path) with aggregate stats."""
    sessions = db.exec(select(SessionModel).order_by(SessionModel.started_at.desc())).all()
    events = db.exec(select(Event)).all()

    ev_by_session: dict[str, list] = {}
    for e in events:
        ev_by_session.setdefault(e.session_id, []).append(e)

    project_map: dict[str, dict] = {}
    for s in sessions:
        path = s.project_path or "unknown"
        if path not in project_map:
            project_map[path] = {
                "project_path": path,
                "project_name": _basename(path),
                "session_count": 0,
                "total_cost_usd": 0.0,
                "total_input_tokens": 0,
                "total_output_tokens": 0,
                "last_active": None,
                "latest_status": s.status,
                "_trust_scores": [],
                "_skill_counts": {},
                "flag_count": 0,
            }
        p = project_map[path]
        p["session_count"] += 1
        p["total_cost_usd"] += s.total_cost_usd or 0.0
        p["total_input_tokens"] += s.total_input_tokens or 0
        p["total_output_tokens"] += s.total_output_tokens or 0
        if p["last_active"] is None or (s.started_at and s.started_at > p["last_active"]):
            p["last_active"] = s.started_at
            p["latest_status"] = s.status
        if s.trust_score is not None:
            p["_trust_scores"].append(s.trust_score)

        for e in ev_by_session.get(s.id, []):
            if e.skill_name:
                p["_skill_counts"][e.skill_name] = p["_skill_counts"].get(e.skill_name, 0) + 1
            if e.flagged:
                p["flag_count"] += 1

    result = []
    for p in project_map.values():
        ts = p.pop("_trust_scores")
        sc = p.pop("_skill_counts")
        p["avg_trust_score"] = round(sum(ts) / len(ts), 1) if ts else None
        p["top_skills"] = sorted(
            [{"name": k, "count": v} for k, v in sc.items()],
            key=lambda x: -x["count"],
        )[:6]
        result.append(p)

    return sorted(result, key=lambda x: str(x.get("last_active") or ""), reverse=True)


@router.get("/suggestions")
def project_suggestions(
    project_path: str = Query(...),
    db: Session = Depends(get_session),
) -> list[dict]:
    """Return rule-based optimization suggestions for a project."""
    sessions = db.exec(
        select(SessionModel).where(SessionModel.project_path == project_path)
    ).all()
    if not sessions:
        return []
    session_ids = [s.id for s in sessions]
    events = db.exec(select(Event).where(Event.session_id.in_(session_ids))).all()
    return detect_patterns(list(sessions), list(events))


@router.get("/claude-config")
def project_claude_config(
    project_path: str = Query(...),
    db: Session = Depends(get_session),
) -> dict:
    """Return .claude configuration analysis for a project."""
    sessions = db.exec(
        select(SessionModel).where(SessionModel.project_path == project_path)
    ).all()
    if not sessions:
        return analyze_config(project_path, set())
    session_ids = [s.id for s in sessions]
    events = db.exec(select(Event).where(Event.session_id.in_(session_ids))).all()
    fired_hooks = {e.hook_event_name for e in events if e.hook_event_name}
    return analyze_config(project_path, fired_hooks)
