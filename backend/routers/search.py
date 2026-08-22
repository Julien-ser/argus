"""Search endpoint — runs AQL over the event store.

Events are joined with a few fields from their parent session (project,
session status, trust score) before the query runs, so a search can say
`project=argus` or `status=interrupted` without the user knowing there are two
tables underneath.
"""

from pathlib import PurePosixPath, PureWindowsPath

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from aql import FIELD_ALIASES, AQLError, run
from database import get_session
from models import Event
from models import Session as SessionModel

router = APIRouter(prefix="/search", tags=["search"])

# Shown in the UI as clickable starting points. Each one demonstrates a
# different part of the language.
EXAMPLES = [
    ("Everything flagged, worst first",
     "flagged=true | sort -severity"),
    ("Critical and high severity only",
     "severity>=high | table timestamp severity tool_name command flag_reason"),
    ("Which tools does the agent actually use?",
     "| stats count by tool"),
    ("Spend by subagent",
     "tool=Agent | stats sum(cost_usd) as spend, count by agent_type | sort -spend"),
    ("Shell commands run in the last day",
     "tool=Bash earliest=-24h | table timestamp command project"),
    ("Anything mentioning a destructive command",
     '"rm -rf"'),
    ("Writes that landed outside the project",
     'reason~"outside project" | table timestamp tool_input project'),
    ("Busiest sessions by cost",
     "| stats sum(cost_usd) as cost, count by session | sort -cost | head 10"),
    ("Everything except reads",
     "NOT tool=Read | head 25"),
]


def _project_name(path: str | None) -> str:
    if not path:
        return ""
    cleaned = str(path).rstrip("/\\")
    name = PurePosixPath(cleaned).name or PureWindowsPath(cleaned).name
    return name or cleaned


def _rows(db: Session) -> list[dict]:
    sessions = {s.id: s for s in db.exec(select(SessionModel)).all()}
    rows = []
    for event in db.exec(select(Event)).all():
        sess = sessions.get(event.session_id)
        row = event.model_dump()
        row["project"] = _project_name(sess.project_path if sess else None)
        row["project_path"] = sess.project_path if sess else None
        row["session_status"] = sess.status if sess else None
        row["trust_score"] = sess.trust_score if sess else None
        rows.append(row)
    return rows


@router.get("")
def search(
    q: str = Query("", description="AQL query"),
    limit: int = Query(200, ge=1, le=2000),
    db: Session = Depends(get_session),
) -> dict:
    """Run an AQL query. An empty query returns the most recent events."""
    try:
        result = run(q or "", _rows(db), limit=limit)
    except AQLError as exc:
        # A bad query is user error, not a server fault — 400 with the message
        # so the UI can show it next to the search box.
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if result["kind"] == "events":
        result["rows"].sort(key=lambda r: str(r.get("timestamp") or ""), reverse=True)
    result["query"] = q
    return result


@router.get("/help")
def help_() -> dict:
    """Field list and example queries, for the UI's help panel."""
    return {
        "fields": sorted({*FIELD_ALIASES.values(), "severity", "flagged", "timestamp",
                          "command", "tool_input", "tool_output", "project_path", "trust_score",
                          "cost_usd", "input_tokens", "output_tokens", "duration_ms"}),
        "aliases": FIELD_ALIASES,
        "commands": ["stats", "table", "sort", "head", "dedup", "where"],
        "operators": ["=", "!=", ">", "<", ">=", "<=", "~ (contains)", "NOT", "* wildcard"],
        "severities": ["info", "low", "medium", "high", "critical"],
        "examples": [{"label": label, "query": query} for label, query in EXAMPLES],
    }
