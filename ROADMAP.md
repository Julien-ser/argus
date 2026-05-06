# Argus Roadmap

_Last updated: 2026-04-28_

---

## Current State

What exists and works today:

**Backend (FastAPI + SQLite)**
- `POST /ingest` — receives PreToolUse, PostToolUse, and Stop hook payloads from Claude Code
- `GET /sessions` — lists all sessions with event/flag counts (N+1 query, see gaps)
- `GET /sessions/{id}` — returns session row + all events
- `POST /sessions/{id}/sync-tokens` — backfills token/cost totals by re-parsing transcript JSONL
- `GET /events?session_id=` — all events for a session
- `GET /flags` — all flagged events across all sessions with project/status metadata
- `GET /health`
- Flag detection: dangerous Bash patterns (`sudo`, `rm -rf`, `curl | bash`, `chmod 777`), Write outside project path, high single-event cost (>$0.10), high session cost (>$1.00), unexpected root-level subagent spawn
- `transcript.py` — parses Claude Code JSONL to sum token usage (including cache create/read) and compute cost at session close

**Frontend (React + Tailwind CDN + Vite)**
- Dashboard: stat cards (total sessions, active count, total tokens, total cost, flagged events) + session table with per-session cost/event/flag counts
- SessionDetail: session header stats + flat trace tree; EventRows expand to show per-tool input/output renderers (Bash, Read, Write, Edit, Glob, Grep, Agent, WebFetch, WebSearch)
- Flags page: severity-colored (critical/warning/info) flagged events with inline tool-input expansion
- Vite dev proxy routes `/sessions`, `/events`, `/flags`, `/ingest` to port 7777

**Hooks + Install**
- `hooks/pre_tool.py`, `hooks/post_tool.py`, `hooks/stop.py` — fire-and-forget POST to `/ingest`, silent on failure
- `install.sh` (Unix/Mac) and `install.ps1` (Windows) — copy hooks to `~/.argus/hooks/`, merge entries into `~/.claude/settings.json`

**Known gaps in the current build**
- Per-event `input_tokens`, `output_tokens`, `cost_usd`, `duration_ms` are always 0 (hook payloads don't carry per-event usage; only session totals are accurate)
- Subagent tree is flat — `TraceTree` accepts a `subagents` prop but `SessionDetail` never fetches child sessions, so the hierarchy is never rendered
- No real-time updates — Dashboard and SessionDetail fetch once on mount; active sessions don't auto-refresh
- Recharts is installed but not used — no charts are rendered anywhere
- `list_sessions` runs a separate query per session to count events and flags (O(N) queries)
- `install.sh` calls `cp *.sh` but no `.sh` files exist in `hooks/` — installer is broken on Unix unless bash path is skipped
- Tailwind loaded via CDN — works for dev, breaks for production builds

---

## MVP (This Sprint)

Minimum needed to demo Argus end-to-end, including for yourself during active Claude Code sessions.

| Item | Effort | Why it matters |
|---|---|---|
| **Fix install.sh .sh file bug** — remove the `cp *.sh` line or add stub .sh wrappers that exec the .py files | S | Without this, the Unix installer exits with a copy error and hooks never register |
| **Auto-refresh for active sessions** — poll `GET /sessions/{id}` every 5s when `session.status === 'active'`; stop when completed | S | Without this, you have to manually reload to see events flow in during a live agent run |
| **Subagent tree construction** — in SessionDetail, detect child sessions by `parent_session_id`, fetch each, and pass them as the `subagents` prop to TraceTree | M | The data model and `TraceTree` component already support this; the wiring is just missing |

---

## POC Release (Next 2–4 Weeks)

What makes this ready to show to potential users or stakeholders.

| Item | Effort | Why it matters |
|---|---|---|
| **Weekly cost/usage charts** — use Recharts (already installed) to render a cost-per-day bar chart and token-over-time area chart on Dashboard | M | Visual cost trend is the most immediately compelling thing to show someone who hasn't seen Argus |
| **Per-event duration tracking** — record `PreToolUse` timestamp, match to the subsequent `PostToolUse` by tool name + session, write `duration_ms` | M | Duration is shown in the EventRow UI but is always 0; slow tool calls (long Bash, large reads) are invisible without it |
| **Fix N+1 query in list_sessions** — replace per-session event queries with a single `GROUP BY session_id` aggregation | S | With 50+ sessions the dashboard load is noticeably slow |
| **Install Tailwind via npm** — add `tailwindcss`, `postcss`, `autoprefixer` as dev deps and remove CDN script tag | S | Required before any production build; CDN Tailwind also ships unconfigured which inflates bundle size |
| **End-user quick-start README** — 5-minute install guide covering prerequisites, `install.sh` / `install.ps1`, starting backend + frontend, and confirming hooks fired | S | CLAUDE.md is agent-facing; no human-readable onboarding exists |
| **Search + filter on Dashboard** — filter session list by project path substring | S | Once you have 20+ sessions across projects the table is unusable without filtering |

---

## v0.1 Public (Next 1–3 Months)

What makes this ready for early adopters to actually use day-to-day.

| Item | Effort | Why it matters |
|---|---|---|
| **Configurable flag rules** — store flag rule thresholds (cost limits, dangerous patterns) in a config table; expose a simple settings UI | M | The current hardcoded thresholds will generate false positives/negatives for users with different usage patterns |
| **Cost alert threshold** — when a session crosses a user-defined cost ceiling, surface a banner on Dashboard (no email, just in-UI) | S | Passive observability is useful; active alerts are what change behavior |
| **Session export as JSON** — button in SessionDetail that downloads the full session + events as JSON | S | Users want to paste session traces into issues, share with teammates, or post-process outside Argus |
| **Pagination for sessions and events** — add `limit`/`offset` query params to `GET /sessions` and `GET /events`; add a load-more button on Dashboard | M | A user who's been running Claude Code for a month will have hundreds of sessions; returning them all is impractical |
| **Persistent session search** — search bar state survives navigation; deep-link to `/?q=argus` | S | Users want to bookmark filtered views |
| **Token cost accuracy check** — add a warning when the hardcoded pricing in `transcript.py` is more than 30 days old | S | Anthropic model pricing changes; silent staleness erodes trust in the cost numbers |
| **`requirements.txt` / `pyproject.toml`** — pin backend dependencies so installs are reproducible | S | New users currently get whatever `pip install fastapi uvicorn sqlmodel` resolves to that day |

---

## Backlog

Captured for later, not yet prioritized.

- **WebSocket / SSE for real-time streaming** — replace polling with a push channel for sub-second event latency during active sessions
- **Per-project cost breakdown** — aggregate cost/tokens across sessions grouped by project path; expose as a chart and a sortable table
- **Session comparison view** — diff two sessions side-by-side to see which agent run was more efficient
- **Flag rule editor UI** — full CRUD for flag rules in the browser instead of editing a config table directly
- **Keyword search inside events** — full-text search over `tool_input`/`tool_output` across all sessions
- **Subagent cost roll-up** — include child session cost in the parent session's total so top-level cost is always the true total
- **Session tagging** — user-defined labels (e.g. "feature/auth", "debugging") to organize sessions beyond project path

---

## Won't Do (Now)

Explicitly out of scope for the next 90 days.

| Item | Why not now |
|---|---|
| **Auth / multi-user** | Argus is local-first by design; adding auth before product-market fit adds complexity with no user benefit |
| **Cloud sync / remote backend** | Requires infra, auth, and privacy decisions; deferred until there's a clear use case beyond local dev |
| **OpenTelemetry export** | OTel spans are a valid future path but require schema changes and a target collector; too early to standardize |
| **Mobile** | The trace tree and event detail views need a wide viewport; mobile is a poor fit for the current information density |
| **Multi-LLM support (non-Claude)** | The hook format and transcript parser are Claude Code-specific; generalizing requires significant abstraction work |
