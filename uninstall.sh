#!/usr/bin/env bash
# Argus uninstaller — Unix/Mac
#
# Removes the Argus hook entries from ~/.claude/settings.json and deletes
# ~/.argus. Uses the same back-up-then-atomic-rename discipline as the
# installer: removing a tool must never be riskier than installing it.
set -euo pipefail

ARGUS_DIR="$HOME/.argus"
SETTINGS="$HOME/.claude/settings.json"

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

echo "Uninstalling Argus..."

if [ -f "$SETTINGS" ]; then
    if [ -n "$PY_BIN" ]; then
        "$PY_BIN" - "$SETTINGS" <<'EOF'
import json
import os
import shutil
import sys
import tempfile

path = sys.argv[1]

try:
    with open(path, encoding="utf-8") as f:
        cfg = json.load(f)
except json.JSONDecodeError as exc:
    sys.exit(f"ERROR: {path} is not valid JSON ({exc}). Nothing was changed.")

if not isinstance(cfg, dict):
    sys.exit(f"ERROR: {path} is not a JSON object. Nothing was changed.")

shutil.copy2(path, path + ".bak")
print(f"  backed up existing settings to {path}.bak")

hooks = cfg.get("hooks") or {}
removed = 0

for section in list(hooks):
    kept_entries = []
    for entry in hooks.get(section, []):
        kept_hooks = []
            if "/.argus/hooks/" in h.get("command", "").lower().replace("\\", "/"):
            else:
                kept_hooks.append(h)
        if kept_hooks:
            entry["hooks"] = kept_hooks
            kept_entries.append(entry)
        elif not entry.get("hooks"):
            kept_entries.append(entry)   # entry had no hooks to begin with; leave it
    if kept_entries:
        hooks[section] = kept_entries
    else:
        del hooks[section]

if not hooks:
    cfg.pop("hooks", None)

print(f"  removed {removed} Argus hook entr{'y' if removed == 1 else 'ies'}")

blob = json.dumps(cfg, indent=2) + chr(10)   # trailing newline, POSIX-friendly
json.loads(blob)

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
    else
        echo "  no working python found — remove the Argus entries from $SETTINGS by hand" >&2
    fi
else
    echo "  no settings.json found, nothing to unregister"
fi

if [ -d "$ARGUS_DIR" ]; then
    rm -rf "$ARGUS_DIR"
    echo "  removed $ARGUS_DIR"
fi

echo ""
echo "Done. Restart Claude Code to finish removing Argus."
echo "Your session database (if any) was left untouched."
