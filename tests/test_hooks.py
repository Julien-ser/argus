"""Tests for the Argus hook transport.

The properties under test are the ones that decide whether it is safe for a
stranger to install this: a hook must never break the session, never hang, and
never ship data the user didn't agree to ship.

Run: python -m unittest discover -s tests -v
"""

import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
HOOKS = REPO / "hooks"
sys.path.insert(0, str(HOOKS))

import _send  # noqa: E402


class _Collector(BaseHTTPRequestHandler):
    received = []

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        _Collector.received.append({"body": body, "headers": dict(self.headers)})
        self.send_response(200)
        self.end_headers()

    def log_message(self, *args):
        pass  # keep test output clean


class HookProcessTests(unittest.TestCase):
    """End-to-end: run the real hook scripts as subprocesses."""

    def _run_hook(self, name, payload, env=None):
        environ = dict(os.environ)
        environ.pop("ARGUS_ENDPOINT", None)
        environ.update(env or {})
        start = time.monotonic()
        proc = subprocess.run(
            [sys.executable, str(HOOKS / name)],
            input=payload.encode("utf-8"),
            capture_output=True,
            env=environ,
        )
        return proc, time.monotonic() - start

    def setUp(self):
        # each test starts with a clean circuit breaker
        try:
            _send.BREAKER_PATH.unlink()
        except OSError:
            pass

    def test_exits_zero_when_backend_is_down(self):
        """The non-negotiable: a PreToolUse hook that exits non-zero blocks the
        user's tool call. Backend down must still mean exit 0."""
        for hook in ("pre_tool.py", "post_tool.py", "stop.py"):
            with self.subTest(hook=hook):
                proc, _ = self._run_hook(
                    hook, '{"tool_name": "Bash"}',
                    {"ARGUS_ENDPOINT": "http://127.0.0.1:1/ingest"},
                )
                self.assertEqual(proc.returncode, 0, proc.stderr.decode())
                self.assertEqual(proc.stderr, b"")

    def test_exits_zero_on_garbage_stdin(self):
        proc, _ = self._run_hook(
            "pre_tool.py", "not json at all",
            {"ARGUS_ENDPOINT": "http://127.0.0.1:1/ingest"},
        )
        self.assertEqual(proc.returncode, 0, proc.stderr.decode())

    def test_down_backend_stays_fast(self):
        """A refused connection must not cost anywhere near the timeout."""
        _, elapsed = self._run_hook(
            "pre_tool.py", '{"tool_name": "Bash"}',
            {"ARGUS_ENDPOINT": "http://127.0.0.1:1/ingest", "ARGUS_TIMEOUT": "5"},
        )
        self.assertLess(elapsed, 4.0, "hook took too long against a dead endpoint")


class CircuitBreakerTests(unittest.TestCase):
    def setUp(self):
        try:
            _send.BREAKER_PATH.unlink()
        except OSError:
            pass

    def test_failure_trips_breaker_and_suppresses_next_send(self):
        _send.send(b'{"tool_name": "Bash"}')  # default endpoint, nothing listening
        self.assertTrue(_send.BREAKER_PATH.exists(), "failure should trip the breaker")
        self.assertTrue(_send._breaker_open())

        # With the breaker open, a second send must not attempt the network at all.
        called = []
        original = _send.urllib.request.urlopen
        _send.urllib.request.urlopen = lambda *a, **k: called.append(1)
        try:
            _send.send(b'{"tool_name": "Bash"}')
        finally:
            _send.urllib.request.urlopen = original
        self.assertEqual(called, [], "breaker was open but a request was still made")


class RedactionTests(unittest.TestCase):
    def test_full_mode_is_byte_identical(self):
        payload = b'{"tool_input": {"command": "ls"}}'
        self.assertEqual(_send.shape(payload, "full"), payload)

    def test_metadata_mode_drops_content(self):
        payload = json.dumps({
            "tool_name": "Bash",
            "session_id": "abc",
            "tool_input": {"command": "cat ~/.env"},
            "tool_output": "SECRET=hunter2",
        }).encode()
        out = json.loads(_send.shape(payload, "metadata"))
        self.assertEqual(out["tool_name"], "Bash")       # metadata survives
        self.assertEqual(out["session_id"], "abc")
        self.assertEqual(out["tool_input"], _send._REDACTED)
        self.assertEqual(out["tool_output"], _send._REDACTED)

    def test_redacted_mode_strips_secrets_and_home_paths(self):
        payload = json.dumps({
            "tool_name": "Read",
            "tool_input": {
                "api_key": "abcd1234",
                "note": "sk-or-v1-deadbeef",
                "path": os.path.expanduser("~") + "/projects/thing.py",
                "safe": "hello world",
            },
        }).encode()
        out = json.loads(_send.shape(payload, "redacted"))
        inner = out["tool_input"]
        self.assertEqual(inner["api_key"], _send._REDACTED)   # by key name
        self.assertEqual(inner["note"], _send._REDACTED)      # by value prefix
        self.assertNotIn(os.path.expanduser("~"), inner["path"])
        self.assertTrue(inner["path"].startswith("~"))
        self.assertEqual(inner["safe"], "hello world")        # ordinary data untouched

    def test_unparseable_payload_is_dropped_when_not_full(self):
        self.assertIsNone(_send.shape(b"not json", "redacted"))
        self.assertIsNone(_send.shape(b"not json", "metadata"))

    def test_lookalike_hostnames_are_not_local(self):
        """Regression: a substring check called these local and sent full payloads."""
        os.environ.pop("ARGUS_MODE", None)
        for url in [
            "https://localhost.attacker.example/ingest",
            "http://127.0.0.1.evil.example/ingest",
            "https://notlocalhost/ingest",
            "https://example.com/?host=localhost",
        ]:
            with self.subTest(url=url):
                self.assertFalse(_send._is_local(url))
                self.assertEqual(_send._mode(url), "redacted")

    def test_genuine_local_hosts_are_local(self):
        os.environ.pop("ARGUS_MODE", None)
        for url in ["http://localhost:7777/ingest", "http://127.0.0.1:7777/ingest",
                    "http://[::1]:7777/ingest"]:
            with self.subTest(url=url):
                self.assertTrue(_send._is_local(url))

    def test_remote_endpoint_defaults_to_redacted(self):
        os.environ.pop("ARGUS_MODE", None)
        self.assertEqual(_send._mode("http://localhost:7777/ingest"), "full")
        self.assertEqual(_send._mode("https://argus.example.com/ingest"), "redacted")


class DeliveryTests(unittest.TestCase):
    """Against a real HTTP server, to prove the wire format and auth header."""

    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), _Collector)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        _Collector.received.clear()
        try:
            _send.BREAKER_PATH.unlink()
        except OSError:
            pass

    def test_posts_payload_with_bearer_token(self):
        url = f"http://127.0.0.1:{self.port}/ingest"
        os.environ["ARGUS_ENDPOINT"] = url
        os.environ["ARGUS_INGEST_KEY"] = "test-key-123"
        os.environ["ARGUS_MODE"] = "full"
        try:
            _send.send(b'{"tool_name": "Bash"}')
        finally:
            for k in ("ARGUS_ENDPOINT", "ARGUS_INGEST_KEY", "ARGUS_MODE"):
                os.environ.pop(k, None)

        self.assertEqual(len(_Collector.received), 1)
        got = _Collector.received[0]
        self.assertEqual(json.loads(got["body"])["tool_name"], "Bash")
        self.assertEqual(got["headers"].get("Authorization"), "Bearer test-key-123")

    def test_success_clears_a_tripped_breaker(self):
        _send.BREAKER_PATH.touch()
        # A tripped breaker suppresses this send...
        _send.send(b'{"tool_name": "Bash"}')
        self.assertEqual(_Collector.received, [])
        # ...until it ages out; simulate that and confirm delivery + clear.
        old = time.time() - (_send.BREAKER_SECONDS + 5)
        os.utime(_send.BREAKER_PATH, (old, old))
        os.environ["ARGUS_ENDPOINT"] = f"http://127.0.0.1:{self.port}/ingest"
        os.environ["ARGUS_MODE"] = "full"
        try:
            _send.send(b'{"tool_name": "Bash"}')
        finally:
            os.environ.pop("ARGUS_ENDPOINT", None)
            os.environ.pop("ARGUS_MODE", None)
        self.assertEqual(len(_Collector.received), 1)
        self.assertFalse(_send.BREAKER_PATH.exists(), "success should clear the breaker")


if __name__ == "__main__":
    unittest.main(verbosity=2)
