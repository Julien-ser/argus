from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from database import get_session
from models import Session as SessionModel
from trust import trust_tier

router = APIRouter(prefix="/trust", tags=["trust"])


@router.get("/summary")
def get_trust_summary(db: Session = Depends(get_session)) -> dict:
    sessions = db.exec(select(SessionModel)).all()
    scored = [s for s in sessions if s.trust_score is not None]

    tier_distribution = {"high": 0, "medium": 0, "low": 0, "unscored": 0}
    for s in sessions:
        tier_distribution[trust_tier(s.trust_score)] += 1

    def _avg(values: list[float | None]) -> float | None:
        clean = [v for v in values if v is not None]
        return round(sum(clean) / len(clean), 1) if clean else None

    return {
        "total_sessions": len(sessions),
        "scored_sessions": len(scored),
        "avg_trust_score": _avg([s.trust_score for s in sessions]),
        "tier_distribution": tier_distribution,
        "avg_safety_score": _avg([s.safety_score for s in sessions]),
        "avg_behavior_score": _avg([s.behavior_score for s in sessions]),
        "avg_economy_score": _avg([s.economy_score for s in sessions]),
    }
