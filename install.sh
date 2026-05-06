#!/usr/bin/env bash
# Argus installer — Unix/Mac
set -euo pipefail

ARGUS_DIR="$HOME/.argus"
HOOKS_DIR="$ARGUS_DIR/hooks"
SETTINGS="$HOME/.claude/settings.json"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing Argus..."

# 1. Copy hooks
mkdir -p "$HOOKS_DIR"
cp "$SCRIPT_DIR/hooks/"*.sh "$HOOKS_DIR/"
cp "$SCRIPT_DIR/hooks/"*.py "$HOOKS_DIR/"
chmod +x "$HOOKS_DIR/"*.sh "$HOOKS_DIR/"*.py

# 2. Pick hook runner: bash if available, python3 fallback
if command -v bash >/dev/null 2>&1; then
    PRE_CMD="$HOOKS_DIR/pre_tool.sh"
    POST_CMD="$HOOKS_DIR/post_tool.sh"
    STOP_CMD="$HOOKS_DIR/stop.sh"
elif command -v python3 >/dev/null 2>&1; then
    PRE_CMD="python3 $HOOKS_DIR/pre_tool.py"
    POST_CMD="python3 $HOOKS_DIR/post_tool.py"
    STOP_CMD="python3 $HOOKS_DIR/stop.py"
else
    echo "ERROR: neither bash nor python3 found. Install one and retry." >&2
    exit 1
fi

# 3. Merge hook entries into ~/.claude/settings.json via Python
mkdir -p "$(dirname "$SETTINGS")"
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"

python3 - "$SETTINGS" "$PRE_CMD" "$POST_CMD" "$STOP_CMD" <<'EOF'
import sys, json

path, pre, post, stop = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

with open(path, encoding="utf-8") as f:
    cfg = json.load(f)

hooks = cfg.setdefault("hooks", {})

def add(section, cmd):
    entries = hooks.setdefault(section, [])
    for e in entries:
        for h in e.get("hooks", []):
            if "argus" in h.get("command", "").lower():
                print(f"  {section}: already registered, skipping")
                return
    entries.append({"matcher": "*", "hooks": [{"type": "command", "command": cmd}]})
    print(f"  {section}: added")

add("PreToolUse",  pre)
add("PostToolUse", post)
add("Stop",        stop)

with open(path, "w", encoding="utf-8") as f:
    json.dump(cfg, f, indent=2)
EOF

echo ""
echo "Done. Hooks installed to $HOOKS_DIR"
echo "Restart Claude Code to activate Argus."
