#!/usr/bin/env bash
# Argus installer — Unix/Mac
#
# Registers the Argus hooks in ~/.claude/settings.json. That file is the user's
# GLOBAL Claude Code config, so the merge below is deliberately paranoid:
# back it up, write to a temp file, validate, then atomically rename. A crash
# mid-write must never leave a truncated settings.json behind.
set -euo pipefail

ARGUS_DIR="$HOME/.argus"
HOOKS_DIR="$ARGUS_DIR/hooks"
SETTINGS="$HOME/.claude/settings.json"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Find a Python that actually runs. `command -v python3` is not enough: on
# Windows the Microsoft Store ships a python3 stub that exists on PATH and
# fails when executed, and some distros only ship `python`.
find_python() {
    for candidate in python3 python; do
        if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c "import sys; sys.exit(0)" >/dev/null 2>&1; then
            echo "$candidate"
            return 0
        fi
    done
    return 1
}
PY_BIN="$(find_python || true)"

echo "Installing Argus..."

# 1. Copy hooks
mkdir -p "$HOOKS_DIR"
cp "$SCRIPT_DIR/hooks/"*.py "$HOOKS_DIR/"
chmod +x "$HOOKS_DIR/"*.py
# .sh hooks are the no-python3 fallback; copy them only if present
if compgen -G "$SCRIPT_DIR/hooks/*.sh" >/dev/null; then
    cp "$SCRIPT_DIR/hooks/"*.sh "$HOOKS_DIR/"
    chmod +x "$HOOKS_DIR/"*.sh
fi

# 2. Pick the hook runner. python3 is preferred — it is the path that carries
#    the redaction modes and the circuit breaker; bash is the fallback.
if [ -n "$PY_BIN" ]; then
    PRE_CMD="$PY_BIN $HOOKS_DIR/pre_tool.py"
    POST_CMD="$PY_BIN $HOOKS_DIR/post_tool.py"
    STOP_CMD="$PY_BIN $HOOKS_DIR/stop.py"
elif command -v bash >/dev/null 2>&1 && [ -f "$HOOKS_DIR/pre_tool.sh" ]; then
    echo "  no working python found — using the bash hooks (no redaction modes)"
    PRE_CMD="$HOOKS_DIR/pre_tool.sh"
    POST_CMD="$HOOKS_DIR/post_tool.sh"
    STOP_CMD="$HOOKS_DIR/stop.sh"
else
    echo "ERROR: neither python3 nor bash found. Install one and retry." >&2
    exit 1
fi

# 3. Merge hook entries into ~/.claude/settings.json
mkdir -p "$(dirname "$SETTINGS")"
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"

if [ -z "$PY_BIN" ]; then
    echo "ERROR: a working Python is required to safely edit settings.json." >&2
    echo "Register these commands manually instead:" >&2
    echo "  PreToolUse:  $PRE_CMD" >&2
    echo "  PostToolUse: $POST_CMD" >&2
    echo "  Stop:        $STOP_CMD" >&2
    exit 1
fi

"$PY_BIN" - "$SETTINGS" "$PRE_CMD" "$POST_CMD" "$STOP_CMD" <<'EOF'
import json
import os
import shutil
import sys
import tempfile

path, pre, post, stop = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

# Refuse to touch a settings.json we cannot parse — better to stop than to
# overwrite a file the user hand-edited into a state we don't understand.
try:
    with open(path, encoding="utf-8") as f:
        cfg = json.load(f)
except json.JSONDecodeError as exc:
    sys.exit(f"ERROR: {path} is not valid JSON ({exc}). Fix it and re-run; nothing was changed.")

if not isinstance(cfg, dict):
    sys.exit(f"ERROR: {path} is not a JSON object. Nothing was changed.")

backup = path + ".bak"
shutil.copy2(path, backup)
print(f"  backed up existing settings to {backup}")

hooks = cfg.setdefault("hooks", {})


def add(section, cmd):
    entries = hooks.setdefault(section, [])
    for e in entries:
        for h in e.get("hooks", []):
            if "argus" in h.get("command", "").lower():
                h["command"] = cmd      # refresh an existing entry to the current path
                print(f"  {section}: already registered, command refreshed")
                return
    entries.append({"matcher": "*", "hooks": [{"type": "command", "command": cmd}]})
    print(f"  {section}: added")


add("PreToolUse",  pre)
add("PostToolUse", post)
add("Stop",        stop)

# Atomic write: serialize first (so a serialization error cannot truncate the
# file), write to a temp file in the same directory, fsync, then rename over
# the original. The rename is atomic, so readers see old or new, never partial.
blob = json.dumps(cfg, indent=2) + chr(10)   # trailing newline, POSIX-friendly
json.loads(blob)  # paranoia: never install something we cannot read back

directory = os.path.dirname(path) or "."
fd, tmp = tempfile.mkstemp(dir=directory, prefix=".settings-", suffix=".tmp")
try:
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(blob)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)
except BaseException:
    if os.path.exists(tmp):
        os.unlink(tmp)
    raise
EOF

echo ""
echo "Done. Hooks installed to $HOOKS_DIR"
echo "Restart Claude Code to activate Argus."
echo "To remove: bash $SCRIPT_DIR/uninstall.sh"
