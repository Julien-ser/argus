import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from database import engine, get_session
from models import Event, Session as SessionModel
from transcript import cost_from_usage, find_transcript, sum_transcript

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("")
def list_sessions(db: Session = Depends(get_session)) -> list[dict]:
    """Return all sessions ordered by start time descending, each with event/flag/skill counts."""
    sessions = db.exec(
        select(SessionModel).order_by(SessionModel.started_at.desc())
    ).all()

    result = []
    for s in sessions:
        events = db.exec(select(Event).where(Event.session_id == s.id)).all()
        skill_counts_map: dict[str, int] = {}
        for e in events:
            if e.skill_name:
                skill_counts_map[e.skill_name] = skill_counts_map.get(e.skill_name, 0) + 1
        result.append({
            **s.model_dump(),
            "event_count": len(events),
            "flag_count": sum(1 for e in events if e.flagged),
            "skill_counts": sorted(
                [{"name": k, "count": v} for k, v in skill_counts_map.items()],
                key=lambda x: -x["count"],
            ),
        })
    return result


@router.get("/compare")
def compare_sessions(
    a: str = Query(...),
    b: str = Query(...),
    db: Session = Depends(get_session),
) -> dict:
    """Return two sessions with events and cumulative-cost timelines for comparison."""
    def _build(sid: str) -> dict:
        sess = db.get(SessionModel, sid)
        if not sess:
            raise HTTPException(status_code=404, detail=f"Session {sid} not found")
        evts = db.exec(
            select(Event).where(Event.session_id == sid).order_by(Event.timestamp.asc())
        ).all()
        start = sess.started_at
        cumulative = 0.0
        timeline = []
        for e in evts:
            cumulative += e.cost_usd or 0.0
            elapsed = (
                round((e.timestamp - start).total_seconds(), 1)
                if start and e.timestamp else 0
            )
            timeline.append({
                "elapsed_s": elapsed,
                "cumulative_cost": round(cumulative, 6),
                "tool_name": e.tool_name,
                "flagged": e.flagged,
            })
        return {
            "session": jsonable_encoder(sess),
            "events": jsonable_encoder(evts),
            "timeline": timeline,
        }

    return {"a": _build(a), "b": _build(b)}


@router.get("/stream/{session_id}")
async def stream_session_events(session_id: str):
    """SSE stream of new events for an active session.

    Sends event/session_update/done message types. Closes automatically
    when the session transitions out of 'active' status.
    """
    async def generate():
        seen_ids: set[str] = set()
        while True:
            with Session(engine) as db:
                sess = db.get(SessionModel, session_id)
                if not sess:
                    yield f"data: {json.dumps({'type': 'error', 'detail': 'not found'})}\n\n"
                    return
                all_events = db.exec(
                    select(Event)
                    .where(Event.session_id == session_id)
                    .order_by(Event.timestamp.asc())
                ).all()
                new_events = [e for e in all_events if e.id not in seen_ids]
                for e in new_events:
                    seen_ids.add(e.id)
                    yield f"data: {json.dumps({'type': 'event', 'data': jsonable_encoder(e)})}\n\n"
                if new_events:
                    yield f"data: {json.dumps({'type': 'session_update', 'session': jsonable_encoder(sess)})}\n\n"
                if sess.status != "active":
                    yield f"data: {json.dumps({'type': 'done', 'session': jsonable_encoder(sess)})}\n\n"
                    return
            await asyncio.sleep(1.5)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/{session_id}")
def get_session_detail(session_id: str, db: Session = Depends(get_session)) -> dict:
    """Return a single session and all its events ordered by timestamp descending."""
    sess = db.get(SessionModel, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    events = db.exec(
        select(Event)
        .where(Event.session_id == session_id)
        .order_by(Event.timestamp.desc())
    ).all()
    return {"session": sess.model_dump(), "events": [e.model_dump() for e in events]}


@router.post("/{session_id}/sync-tokens")
def sync_tokens(session_id: str, db: Session = Depends(get_session)) -> dict:
    """Re-parse the transcript to backfill token counts for an existing session."""
    sess = db.get(SessionModel, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    transcript = find_transcript(sess.project_path, session_id)
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")
    usage = sum_transcript(transcript)
    sess.total_input_tokens  = usage["input_tokens"]
    sess.total_output_tokens = usage["output_tokens"]
    sess.total_cost_usd      = cost_from_usage(usage)
    db.add(sess)
    db.commit()
    return {
        "ok": True,
        "input_tokens": sess.total_input_tokens,
        "output_tokens": sess.total_output_tokens,
        "cost_usd": sess.total_cost_usd,
    }
