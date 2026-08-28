#!/usr/bin/env python3
"""Point a Cloudflare named tunnel at the Argus instance on julienlab.

A NAMED tunnel, deliberately: a quick tunnel gets a fresh trycloudflare.com URL
every time it restarts, which is useless for a hostname you print on a card or
hand to someone at an event. This creates a stable hostname that survives
reboots.

Runs alongside — not instead of — any existing cloudflared service on the box;
the unit and config are argus-specific.

Usage:
    python scripts/setup_tunnel.py            # create tunnel, DNS route, service
    python scripts/setup_tunnel.py --status   # report only, change nothing
"""

import argparse
import re
import sys
import time
from pathlib import Path

import paramiko

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, OSError):
    pass

TUNNEL = "argus"
HOSTNAME = "argus.praxisai.ca"
LOCAL_PORT = 7778

_creds = Path(r"C:\Users\a1\.claude\skills\backup\backup.py").read_text()
HOST = re.search(r'^HOST\s*=\s*["\'](.+?)["\']', _creds, re.M).group(1)
USER = re.search(r'^USERNAME\s*=\s*["\'](.+?)["\']', _creds, re.M).group(1)
PASSWORD = re.search(r'^PASSWORD\s*=\s*["\'](.+?)["\']', _creds, re.M).group(1)

UNIT = """[Unit]
Description=Cloudflare tunnel for Argus ({hostname})
After=network.target argus.service

[Service]
Type=simple
User=julien
ExecStart=/usr/bin/cloudflared --no-autoupdate --config /home/julien/.cloudflared/{tunnel}.yml tunnel run {tunnel}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
"""

CONFIG = """tunnel: {uuid}
credentials-file: /home/julien/.cloudflared/{uuid}.json
ingress:
  - hostname: {hostname}
    service: http://127.0.0.1:{port}
  - service: http_status:404
"""


def run(client, cmd, sudo=False, quiet=False):
    if sudo:
        cmd = "echo '{}' | sudo -S -p '' sh -c '{}'".format(PASSWORD, cmd)
    _, out, err = client.exec_command(cmd, timeout=180)
    stdout = out.read().decode(errors="replace").strip()
    stderr = err.read().decode(errors="replace").strip()
    if not quiet:
        for line in stdout.splitlines():
            print("  " + line[:160])
        for line in stderr.splitlines():
            if line.strip() and "sudo" not in line.lower():
                print("  [err] " + line[:160])
    return stdout + ("\n" + stderr if stderr else "")


def tunnel_uuid(client):
    """Read the tunnel's UUID out of `cloudflared tunnel list`."""
    listing = run(client, "cloudflared tunnel list 2>&1", quiet=True)
    for line in listing.splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[1] == TUNNEL:
            return parts[0]
    return ""


def status(client):
    print("[status] nothing will be changed")
    print("  tunnels:")
    for line in run(client, "cloudflared tunnel list 2>&1", quiet=True).splitlines():
        print("    " + line[:150])
    for label, cmd in (
        ("argus.service", "systemctl is-active argus"),
        ("cloudflared-argus", "systemctl is-active cloudflared-argus 2>/dev/null || echo 'not installed'"),
        ("local health", f"curl -s --max-time 5 http://127.0.0.1:{LOCAL_PORT}/api/health || echo unreachable"),
    ):
        print(f"  {label:20} {run(client, cmd, quiet=True)}")


def setup(client, sftp):
    print("[1] tunnel")
    uuid = tunnel_uuid(client)
    if uuid:
        print(f"  '{TUNNEL}' already exists, reusing")
    else:
        run(client, f"cloudflared tunnel create {TUNNEL} 2>&1")
        uuid = tunnel_uuid(client)
    if not uuid:
        sys.exit("  [!] no tunnel UUID - stopping before touching DNS")
    print(f"  uuid: {uuid}")

    print(f"[2] config -> 127.0.0.1:{LOCAL_PORT}")
    with sftp.open(f"/home/julien/.cloudflared/{TUNNEL}.yml", "w") as fh:
        fh.write(CONFIG.format(uuid=uuid, hostname=HOSTNAME, port=LOCAL_PORT))
    print(f"  ~/.cloudflared/{TUNNEL}.yml")

    print(f"[3] DNS route for {HOSTNAME}")
    run(client, f"cloudflared tunnel route dns {TUNNEL} {HOSTNAME} 2>&1")

    print("[4] service")
    with sftp.open("/tmp/cloudflared-argus.service", "w") as fh:
        fh.write(UNIT.format(hostname=HOSTNAME, tunnel=TUNNEL))
    run(client, "mv /tmp/cloudflared-argus.service /etc/systemd/system/cloudflared-argus.service", sudo=True)
    run(client, "systemctl daemon-reload", sudo=True)
    run(client, "systemctl enable cloudflared-argus", sudo=True, quiet=True)
    run(client, "systemctl restart cloudflared-argus", sudo=True)

    time.sleep(8)
    print("[5] result")
    print("  service:", run(client, "systemctl is-active cloudflared-argus", quiet=True))
    log = run(client, "journalctl -u cloudflared-argus -n 12 --no-pager", sudo=True, quiet=True)
    for line in log.splitlines()[-8:]:
        print("    " + line[:150])


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--status", action="store_true", help="report only")
    args = ap.parse_args()

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=20)
    print(f"[ok] connected to {USER}@{HOST}\n")
    if args.status:
        status(client)
    else:
        sftp = client.open_sftp()
        try:
            setup(client, sftp)
        finally:
            sftp.close()
    client.close()


if __name__ == "__main__":
    main()
