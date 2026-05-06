#Requires -Version 5.1
# Argus installer — Windows
param()
$ErrorActionPreference = "Stop"

$ArgusDir  = Join-Path $env:USERPROFILE ".argus"
$HooksDir  = Join-Path $ArgusDir "hooks"
$Settings  = Join-Path $env:USERPROFILE ".claude\settings.json"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Installing Argus..."

# 1. Copy hooks
New-Item -ItemType Directory -Force -Path $HooksDir | Out-Null
Get-ChildItem "$ScriptDir\hooks" -Include "*.sh","*.py" -File | Copy-Item -Destination $HooksDir -Force

# 2. Find Python (required for hooks and settings merge)
$PythonExe = $null
foreach ($candidate in @("python", "python3", "py")) {
    $found = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($found) { $PythonExe = $found.Source; break }
}
if (-not $PythonExe) {
    Write-Error "Python not found. Install Python 3 from https://python.org and retry."
    exit 1
}

$PreCmd  = "`"$PythonExe`" `"$HooksDir\pre_tool.py`""
$PostCmd = "`"$PythonExe`" `"$HooksDir\post_tool.py`""
$StopCmd = "`"$PythonExe`" `"$HooksDir\stop.py`""

# 3. Merge hook entries into %USERPROFILE%\.claude\settings.json
$SettingsDir = Split-Path $Settings
New-Item -ItemType Directory -Force -Path $SettingsDir | Out-Null
if (-not (Test-Path $Settings)) {
    Set-Content $Settings -Value "{}" -Encoding utf8
}

$MergeScript = [System.IO.Path]::GetTempFileName() + ".py"
Set-Content $MergeScript -Encoding utf8 -Value @'
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
'@

try {
    & $PythonExe $MergeScript $Settings $PreCmd $PostCmd $StopCmd
} finally {
    Remove-Item $MergeScript -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Done. Hooks installed to $HooksDir"
Write-Host "Restart Claude Code to activate Argus."
