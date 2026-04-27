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
    events = db.exec(
        select(Event)
        .where(Event.session_id == session_id)
        .order_by(Event.timestamp)
    ).all()
    return [e.model_dump() for e in events]
