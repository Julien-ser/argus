"""Tests for the API / SPA routing split.

Serving both from one origin creates two failure modes that are invisible
during normal in-app navigation, because React Router never asks the server:

  1. a hard refresh on an SPA route must return the app, not API JSON
  2. an unknown /api path must return a JSON 404, not 200 + index.html
"""

import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "backend"))

DIST = REPO / "frontend" / "dist"


@unittest.skipUnless(DIST.is_dir(), "frontend/dist not built")
class RoutingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Point at a throwaway database *before* importing the app: database.py
        # reads ARGUS_DB at import time, and the default is the developer's real
        # argus.db — a test suite must never write to that.
        cls._tmp = tempfile.mkdtemp(prefix="argus-routing-")
        os.environ["ARGUS_DB"] = str(Path(cls._tmp) / "routing.db")

        from fastapi.testclient import TestClient

        import main
        # TestClient only runs startup handlers when used as a context manager,
        # so create the schema explicitly rather than relying on that.
        main.init_db()
        cls.client = TestClient(main.app)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls._tmp, ignore_errors=True)

    def assertHTML(self, path):
        r = self.client.get(path)
        self.assertEqual(r.status_code, 200, path)
        self.assertIn("html", r.headers.get("content-type", ""), path)

    def test_spa_routes_serve_the_app_on_a_hard_refresh(self):
        # These paths exist in React Router *and* used to exist on the API.
        for path in ["/", "/search", "/flags", "/analytics", "/projects",
                     "/trust", "/agents", "/compare", "/sessions/does-not-exist"]:
            with self.subTest(path=path):
                self.assertHTML(path)

    def test_api_routes_return_json(self):
        for path in ["/api/health", "/api/sessions", "/api/flags", "/api/search?q="]:
            with self.subTest(path=path):
                r = self.client.get(path)
                self.assertEqual(r.status_code, 200, path)
                self.assertIn("json", r.headers.get("content-type", ""), path)

    def test_unknown_api_path_404s_as_json(self):
        """Regression: the SPA fallback answered these with 200 + index.html.

        Also a platform trap — StaticFiles normalises the path it hands the
        handler, so on Windows it arrives as 'api\\typo'; the guard has to read
        the ASGI scope instead.
        """
        for path in ["/api/typo", "/api/sessions/nope/deeper", "/api/", "/api"]:
            with self.subTest(path=path):
                r = self.client.get(path)
                self.assertEqual(r.status_code, 404, path)
                self.assertIn("json", r.headers.get("content-type", ""), path)

    def test_legacy_ingest_still_accepted(self):
        """Hooks installed before the /api move post here; breaking it silently
        stops collection for anyone who hasn't re-run the installer."""
        payload = {"hook_event_name": "PreToolUse", "session_id": "routing-test",
                   "tool_name": "Bash", "tool_input": {"command": "true"}}
        self.assertEqual(self.client.post("/ingest", json=payload).status_code, 200)
        self.assertEqual(self.client.post("/api/ingest", json=payload).status_code, 200)


if __name__ == "__main__":
    unittest.main(verbosity=2)
