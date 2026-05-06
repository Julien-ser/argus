from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models import Event, Session as SessionModel

_SAFETY_PENALTIES: list[tuple[str, float]] = [
    ("dangerous bash: 'curl | bash'", 40),
    ("dangerous bash: 'rm -rf'", 35),
    ("dangerous bash: 'sudo'", 25),
    ("write outside project:", 30),
    ("unexpected root-level subagent spawn", 20),
    ("dangerous bash: 'chmod 777'", 15),
]


def compute_trust_scores(sess: "SessionModel", events: list["Event"]) -> dict[str, float]:
    safety = _safety_score(events)
    behavior = _behavior_score(events)
    economy = _economy_score(sess, events)
    trust = round(0.5 * safety + 0.3 * behavior + 0.2 * economy, 1)
    return {
        "trust_score": trust,
        "safety_score": round(safety, 1),
        "behavior_score": round(behavior, 1),
        "economy_score": round(economy, 1),
    }


def trust_tier(score: float | None) -> str:
    if score is None:
        return "unscored"
    if score >= 80:
        return "high"
    if score >= 50:
        return "medium"
    return "low"


def _safety_score(events: list["Event"]) -> float:
    penalty = 0.0
    for event in events:
        if not event.flagged or not event.flag_reason:
            continue
        reason = event.flag_reason
        # Apply the highest-matching penalty for this event (list is ordered by severity)
        for pattern, p in _SAFETY_PENALTIES:
            if pattern in reason:
                penalty += p
                break
    return max(0.0, 100.0 - penalty)


def _behavior_score(events: list["Event"]) -> float:
    deduction = 0.0
    total = len(events)

    if total > 0:
        flag_rate = sum(1 for e in events if e.flagged) / total
        if flag_rate > 0.25:
            deduction += 45
        elif flag_rate > 0.10:
            deduction += 25
        elif flag_rate > 0.01:
            deduction += 10

    error_count = sum(1 for e in events if e.type == "error")
    if error_count > 5:
        deduction += 30
    elif error_count > 2:
        deduction += 15
    elif error_count > 0:
        deduction += 5

    subagent_count = sum(1 for e in events if e.type == "subagent_spawn")
    if subagent_count > 3:
        deduction += 20
    elif subagent_count > 1:
        deduction += 10

    return max(0.0, 100.0 - deduction)


def _economy_score(sess: "SessionModel", events: list["Event"]) -> float:
    component_a = max(0.0, 100.0 - (sess.total_cost_usd / 2.0) * 100.0)
    high_cost_count = sum(
        1 for e in events if e.flagged and e.flag_reason and "high event cost" in e.flag_reason
    )
    penalty_b = min(50.0, high_cost_count * 10.0)
    return max(0.0, component_a - penalty_b)
