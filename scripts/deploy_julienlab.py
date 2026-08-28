#!/usr/bin/env python3
"""Deploy Argus to julienlab as a systemd service.

Ships the backend, the built frontend and a synthetic demo database, then runs
the app as one process on port 7778 (7777 is taken by Jarvis). The real
argus.db is never uploaded — the deployed instance runs on demo.db, which is
generated locally from scripts/make_demo_db.py and contains no real session data.

Usage:
    python scripts/deploy_julienlab.py            # deploy
    python scripts/deploy_julienlab.py --probe    # report remote state, change nothing
"""

import argparse
import io
import re
import sys
from pathlib import Path

import paramiko

# systemctl prints U+2192 in its symlink messages; a cp1252 Windows console
# raises UnicodeEncodeError on it and kills the deploy mid-run.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, OSError):
    pass

REPO = Path(__file__).resolve().parent.parent
REMOTE = "/home/julien/argus"
PORT = 7778
TUNNEL = "argus"
HOSTNAME = "argus.praxisai.ca"

# Credentials live in the backup skill; read them without importing it (importing
# runs the whole backup script).
_creds = Path(r"C:\Users\a1\.claude\skills\backup\backup.py").read_text()
HOST = re.search(r'^HOST\s*=\s*["\'](.+?)["\']', _creds, re.M).group(1)
USER = re.search(r'^USERNAME\s*=\s*["\'](.+?)["\']', _creds, re.M).group(1)
PASSWORD = re.search(r'^PASSWORD\s*=\s*["\'](.+?)["\']', _creds, re.M).group(1)

UNIT = f"""[Unit]
Description=Argus - observability for AI agent sessions
After=network.target

[Service]
Type=simple
User=julien
WorkingDirectory={REMOTE}/backend
Environment=PYTHONUNBUFFERED=1
Environment=ARGUS_DB={REMOTE}/demo.db
Environment=ARGUS_READONLY=1
ExecStart=/usr/bin/python3 -m uvicorn main:app --host 127.0.0.1 --port {PORT}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
"""


def run(client, cmd, sudo=False, quiet=False):
    if sudo:
        cmd = f"echo '{PASSWORD}' | sudo -S -p '' sh -c '{cmd}'"
    _, out, err = client.exec_command(cmd, timeout=180)
    stdout = out.read().decode(errors="replace").strip()
    stderr = err.read().decode(errors="replace").strip()
    if not quiet:
        for line in stdout.splitlines():
            print("  " + line)
        for line in stderr.splitlines():
            if line.strip():
                print("  [err] " + line)
    return stdout


def probe(client):
    print("[probe] remote state (nothing will be changed)")
    checks = {
        "python3": "python3 --version",
        "pip3": "pip3 --version | cut -d' ' -f1-2",
        "cloudflared": "cloudflared --version 2>/dev/null || echo 'NOT INSTALLED'",
        "tunnels": "cloudflared tunnel list 2>/dev/null || echo 'no named tunnels (or not logged in)'",
        "cert.pem": "test -f ~/.cloudflared/cert.pem && echo present || echo 'ABSENT - needs `cloudflared tunnel login`'",
        f"port {PORT}": f"(ss -ltn 2>/dev/null | grep -q ':{PORT}' && echo 'in use') || echo free",
        "argus.service": "systemctl is-enabled argus 2>/dev/null || echo 'not installed'",
        "existing services": "systemctl list-units --type=service --state=running --no-pager --no-legend | grep -iE 'stock|cloudflared|jarvis' | awk '{print $1}'",
    }
    for label, cmd in checks.items():
        value = run(client, cmd, quiet=True) or "(no output)"
        print(f"  {label:20} {value.splitlines()[0] if value else ''}")
        for extra in value.splitlines()[1:]:
            print(f"  {'':20} {extra}")


def deploy(client, sftp):
    dist = REPO / "frontend" / "dist"
    demo = REPO / "demo.db"
    if not dist.is_dir():
        sys.exit("frontend/dist missing - run `npm run build` in frontend/ first")
    if not demo.exists():
        sys.exit("demo.db missing - run `python scripts/make_demo_db.py` first")

    print("[1] directories")
    run(client, f"mkdir -p {REMOTE}/backend/routers {REMOTE}/frontend/dist/assets")

    print("[2] uploading backend")
    for src in sorted((REPO / "backend").glob("*.py")):
        sftp.put(str(src), f"{REMOTE}/backend/{src.name}")
        print(f"  {src.name}")
    for src in sorted((REPO / "backend" / "routers").glob("*.py")):
        sftp.put(str(src), f"{REMOTE}/backend/routers/{src.name}")
    sftp.put(str(REPO / "backend" / "requirements.txt"), f"{REMOTE}/backend/requirements.txt")
    print(f"  routers/ + requirements.txt")

    print("[3] uploading built frontend")
    count = 0
    for src in dist.rglob("*"):
        if src.is_file():
            rel = src.relative_to(dist).as_posix()
            sftp.put(str(src), f"{REMOTE}/frontend/dist/{rel}")
            count += 1
    print(f"  {count} files")

    print("[4] uploading demo database")
    sftp.put(str(demo), f"{REMOTE}/demo.db")
    print(f"  demo.db ({demo.stat().st_size // 1024} KB, synthetic)")

    print("[5] dependencies")
    run(client, f"pip3 install -q --break-system-packages -r {REMOTE}/backend/requirements.txt")

    print("[6] systemd unit")
    with sftp.open("/tmp/argus.service", "w") as fh:
        fh.write(UNIT)
    run(client, "mv /tmp/argus.service /etc/systemd/system/argus.service", sudo=True)
    run(client, "systemctl daemon-reload", sudo=True)
    run(client, "systemctl enable argus", sudo=True)
    run(client, "systemctl restart argus", sudo=True)

    print("[7] health check")
    import time
    time.sleep(4)
    state = run(client, "systemctl is-active argus", quiet=True)
    health = run(client, f"curl -s --max-time 5 http://127.0.0.1:{PORT}/api/health", quiet=True)
    print(f"  service: {state}")
    print(f"  /api/health: {health or '(no response)'}")
    if state == "active" and '"ok"' in health:
        print(f"\n[ok] Argus is serving on 127.0.0.1:{PORT} (localhost only - the tunnel fronts it)")
    else:
        print("\n[!] not healthy - recent logs:")
        run(client, "journalctl -u argus -n 25 --no-pager", sudo=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--probe", action="store_true", help="report remote state and exit")
    args = ap.parse_args()

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=20)
    print(f"[ok] connected to {USER}@{HOST}\n")

    if args.probe:
        probe(client)
    else:
        sftp = client.open_sftp()
        try:
            deploy(client, sftp)
        finally:
            sftp.close()
    client.close()


if __name__ == "__main__":
    main()
