from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from database import get_session
from models import Event, Session as SessionModel

router = APIRouter(prefix="/flags", tags=["flags"])


@router.get("")
def list_flags(db: Session = Depends(get_session)) -> list[dict]:
    """Return all flagged events across all sessions, newest first.

    Each entry includes the event fields plus project_path and session_status
    from the parent session.
    """
    flagged = db.exec(
        select(Event).where(Event.flagged).order_by(Event.timestamp.desc())
    ).all()

    result = []
    for event in flagged:
        sess = db.get(SessionModel, event.session_id)
        result.append({
            **event.model_dump(),
            "project_path": sess.project_path if sess else None,
            "session_status": sess.status if sess else None,
        })
    return result
