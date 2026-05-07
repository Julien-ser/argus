import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from ingest import router as ingest_router
from routers import analytics, events, flags, projects, sessions, trust

# Load .env from project root (one level up from backend/) if it exists.
# Simple parser: ignores blank lines and comments, sets only unset vars.
_env_file = Path(__file__).parent.parent / ".env"
if _env_file.exists():
    for _line in _env_file.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip())

app = FastAPI(title="Argus", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


app.include_router(ingest_router)
app.include_router(sessions.router)
app.include_router(events.router)
app.include_router(flags.router)
app.include_router(analytics.router)
app.include_router(trust.router)
app.include_router(projects.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
