from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from database import get_session
from models import Event

router = APIRouter(prefix="/events", tags=["events"])


@router.get("")
def list_events(
    session_id: str = Query(...),
    db: Session = Depends(get_session),
) -> list[dict]:
    """Return all events for a session ordered by timestamp descending."""
    events = db.exec(
        select(Event)
        .where(Event.session_id == session_id)
        .order_by(Event.timestamp.desc())
    ).all()
    return [e.model_dump() for e in events]
