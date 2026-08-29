from datetime import datetime

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from database import get_session
from ingest import SEVERITY_RANK
from models import Event
from models import Session as SessionModel

router = APIRouter(prefix="/flags", tags=["flags"])


@router.get("")
def list_flags(db: Session = Depends(get_session)) -> list[dict]:
    """Return all flagged events across all sessions, newest first.

    Each entry includes the event fields plus project_path and session_status
    from the parent session.
    """
    # Worst first, then newest. Ordering purely by time buries a critical
    # pipe-to-shell detection under whatever cost warnings happened to fire most
    # recently — which is backwards for an alert feed, and it is the first screen
    # anyone looks at. SQLite has no ordering for our severity words, so the rank
    # is applied in Python.
    flagged = db.exec(select(Event).where(Event.flagged)).all()
    flagged = sorted(
        flagged,
        key=lambda e: (SEVERITY_RANK.get((e.severity or "").lower(), -1),
                       e.timestamp or datetime.min),
        reverse=True,
    )

    result = []
    for event in flagged:
        sess = db.get(SessionModel, event.session_id)
        result.append({
            **event.model_dump(),
            "project_path": sess.project_path if sess else None,
            "session_status": sess.status if sess else None,
        })
    return result
