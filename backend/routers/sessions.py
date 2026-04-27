from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from database import get_session
from models import Event, Session as SessionModel

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("")
def list_sessions(db: Session = Depends(get_session)) -> list[dict]:
    sessions = db.exec(
        select(SessionModel).order_by(SessionModel.started_at.desc())
    ).all()

    result = []
    for s in sessions:
        events = db.exec(select(Event).where(Event.session_id == s.id)).all()
        result.append({
            **s.model_dump(),
            "event_count": len(events),
            "flag_count": sum(1 for e in events if e.flagged),
        })
    return result


@router.get("/{session_id}")
def get_session(session_id: str, db: Session = Depends(get_session)) -> dict:
    sess = db.get(SessionModel, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")

    events = db.exec(
        select(Event)
        .where(Event.session_id == session_id)
        .order_by(Event.timestamp)
    ).all()

    return {"session": sess.model_dump(), "events": [e.model_dump() for e in events]}
