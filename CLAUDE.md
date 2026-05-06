# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Argus?

Argus is a local-first observability platform for Claude Code agentic sessions. It captures every agent action, tool call, subagent spawn, and data exchange in real time, then visualizes it as an interactive trace tree with cost tracking, anomaly flagging, and session replay.

Claude Code hooks (PreToolUse, PostToolUse, Stop) POST event JSON to the Argus backend on every tool use. The backend stores events to SQLite, evaluates flag rules, and serves a REST API consumed by the React frontend.

## Stack

| Layer | Technology |
|---|---|
| Event capture | Claude Code hooks (PostToolUse, PreToolUse, Stop) |
| Storage | SQLite via SQLModel |
| Backend | FastAPI, port 7777 |
| Frontend | React + Tailwind + Vite, port 5173 |
| Visualization | Recharts |

## Dev Commands

```bash
# Backend
cd backend && uvicorn main:app --port 7777 --reload

# Frontend
cd frontend && npm run dev

# Install backend deps (first time)
cd backend && pip install fastapi uvicorn sqlmodel

# Install frontend deps (first time)
cd frontend && npm install
```

There is no test suite yet. The SQLite database is at `argus.db` in the project root (gitignored).

## Architecture

### Data flow

1. Claude Code fires a hook on every tool use
2. The hook script reads stdin (Claude Code event JSON) and POSTs to `POST /ingest`
3. `backend/ingest.py` parses the payload, evaluates flag rules, writes a `Session` + `Event` to SQLite
4. The frontend polls or fetches from REST endpoints to render the dashboard

### Key backend files

- `backend/main.py` — FastAPI app, mounts routers, CORS config
- `backend/models.py` — SQLModel `Session` and `Event` table definitions
- `backend/database.py` — SQLite engine init, `get_session` dependency, runs column migrations on startup
- `backend/ingest.py` — `POST /ingest` handler + all flag rule logic
- `backend/transcript.py` — reads Claude Code JSONL transcripts to derive accurate token counts and cost; used by `ingest.py` on Stop events and by the sync-tokens endpoint
- `backend/routers/sessions.py` — `GET /sessions`, `GET /sessions/{id}`, `POST /sessions/{id}/sync-tokens`
- `backend/routers/events.py` — `GET /events?session_id=`
- `backend/routers/flags.py` — `GET /flags`
- `backend/routers/analytics.py` — `GET /analytics` (top-N breakdowns by tool, hook, agent type, skill, bash command)

### Data model

**Session**
```
id: str (uuid — comes from Claude Code session id)
project_path: str
started_at / ended_at: datetime
total_input_tokens / total_output_tokens: int
total_cost_usd: float
status: active | completed | interrupted
parent_session_id: str | None   # set for subagent sessions
```

**Event**
```
id: str (uuid)
session_id: str (FK → Session)
type: tool_call | tool_result | subagent_spawn | compaction | error
hook_event_name: str | None   # PreToolUse | PostToolUse | Stop
tool_name: str | None
tool_input / tool_output: json | None
agent_type: str | None        # set when tool_name == "Agent"
skill_name: str | None        # set when tool_name == "Skill"
command: str | None           # first token when tool_name == "Bash"
input_tokens / output_tokens: int
cost_usd: float
duration_ms: int
flagged: bool
flag_reason: str | None
timestamp: datetime
```

### Flag rules (evaluated in `ingest.py` on every event)

- Bash input contains `sudo`, `rm -rf`, `curl | bash`, or `chmod 777`
- Write or Edit tool path is outside the session's `project_path`
- Subagent spawned with no `parent_session_id`
- Single event `cost_usd > 0.10`
- Session `total_cost_usd > 1.00`

### Frontend pages

- `/` (Dashboard) — session list with per-session cost/event/flag counts; summary stat cards (total sessions, active, total tokens, total cost, flagged events)
- `/sessions/:id` (SessionDetail) — collapsible trace tree (agent → subagents → tool calls) + chronological event timeline; click any row to expand full tool input/output JSON
- `/flags` — all flagged events across sessions with severity (info / warning / critical)
- `/analytics` — Usage Analytics: horizontal bar charts for top tools, hooks fired, agent types spawned, skills invoked, and top bash commands

### Hook registration

Hooks live in `hooks/` as Python scripts (`pre_tool.py`, `post_tool.py`, `stop.py`). The installer scripts (`install.sh` for Unix/Mac, `install.ps1` for Windows) copy them to `~/.argus/hooks/` and merge the hook entries into `~/.claude/settings.json` automatically.

On Unix/Mac the installer prefers bash wrapper scripts if available, falling back to `python3`. On Windows it always uses `python3 <path>.py`.

After running the installer the settings will contain entries like:

```json
{
  "hooks": {
    "PreToolUse":  [{ "matcher": "*", "hooks": [{ "type": "command", "command": "python3 ~/.argus/hooks/pre_tool.py"  }] }],
    "PostToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "python3 ~/.argus/hooks/post_tool.py" }] }],
    "Stop":        [{ "matcher": "*", "hooks": [{ "type": "command", "command": "python3 ~/.argus/hooks/stop.py"      }] }]
  }
}
```

Each hook reads the Claude Code event JSON from stdin and POSTs it to `http://localhost:7777/ingest`. The hooks use only the Python standard library (`urllib.request`) so no extra dependencies are required.

## Out of scope for POC

Auth, cloud sync, OTel export, multi-user, mobile.
