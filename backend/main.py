from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from ingest import router as ingest_router
from routers import events, flags, sessions

app = FastAPI(title="Argus", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
