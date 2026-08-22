import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routers import analytics, events, flags, projects, search, sessions, trust
from starlette.exceptions import HTTPException as StarletteHTTPException

from database import init_db
from ingest import router as ingest_router

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


_ROUTERS = (
    ingest_router,
    sessions.router,
    events.router,
    flags.router,
    analytics.router,
    trust.router,
    projects.router,
    search.router,
)

# The API lives under /api. This matters once the frontend is served from the
# same process: the SPA has its own /flags, /analytics, /projects and /trust
# routes, so at the root they collide with the API and a hard refresh on those
# pages returns JSON instead of the UI.
for _router in _ROUTERS:
    app.include_router(_router, prefix="/api")

# Back-compat is deliberately limited to /ingest — the one path baked into
# every already-installed hook, and the only one with a consumer outside this
# repo. The read routes are called solely by our own frontend, which now uses
# /api; re-registering them at the root would shadow the SPA's own /flags,
# /analytics and /projects pages all over again.
app.include_router(ingest_router, include_in_schema=False)


@app.get("/api/health")
@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


# ── Frontend ─────────────────────────────────────────────────────────────────
# Serve the built SPA from this same process so a deployment is one service on
# one port rather than a dev server plus an API. The frontend calls the API with
# relative paths, so same-origin serving needs no frontend changes and sidesteps
# CORS entirely.
_DIST = Path(__file__).parent.parent / "frontend" / "dist"


class SPAStaticFiles(StaticFiles):
    """StaticFiles that falls back to index.html instead of 404ing.

    React Router owns paths like /sessions/<id> that exist only in the browser.
    Plain StaticFiles 404s them on a hard refresh or a shared deep link, which
    breaks exactly the flow where someone opens a link you handed them.
    """

    async def get_response(self, path: str, scope):
        # An unknown /api/* path is a client error, not a page. Without this,
        # the fallback below answers `GET /api/typo` with 200 + index.html, so
        # a misspelled endpoint looks like a working page returning HTML and
        # fetch() fails somewhere far from the cause.
        #
        # Checked against the ASGI scope rather than `path`: StaticFiles hands
        # this method an OS-normalised path, so on Windows it arrives as
        # 'api\\typo' and a '/'-based check silently misses (while passing on
        # Linux CI).
        request_path = scope.get("path", "")
        if request_path == "/api" or request_path.startswith("/api/"):
            raise StarletteHTTPException(status_code=404, detail="Not Found")

        # StaticFiles *raises* HTTPException(404) for a missing file rather than
        # returning a 404 response, so this has to be a try/except, not a
        # status-code check.
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404:
                return await super().get_response("index.html", scope)
            raise


if _DIST.is_dir():
    # Mounted last: API routes are matched first, everything else is the SPA.
    app.mount("/", SPAStaticFiles(directory=str(_DIST), html=True), name="ui")
else:  # dev: `npm run dev` serves the UI and proxies here
    print(f"[argus] no built frontend at {_DIST} — API only (run `npm run build` to serve the UI)")
