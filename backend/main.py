from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from ingest import router as ingest_router
from routers import analytics, events, flags, projects, sessions, trust

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
