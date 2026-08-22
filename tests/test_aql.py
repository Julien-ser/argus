"""Tests for AQL, the Argus Query Language.

Includes regression cover for a sort bug that produced *ascending* "top N"
lists: the sort key negated numbers while callers also passed reverse=True, so
the two cancelled out and `sort -cost | head 3` returned the three cheapest.
"""

import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "backend"))

from aql import AQLError, run  # noqa: E402

NOW = datetime.utcnow()


def rows():
    return [
        {"tool_name": "Bash", "command": "rm -rf build", "cost_usd": 0.02, "severity": "high",
         "flagged": True, "flag_reason": "dangerous bash: 'rm -rf'", "project": "argus",
         "agent_type": None, "session_id": "s1", "tool_input": '{"command": "rm -rf build"}',
         "timestamp": (NOW - timedelta(hours=1)).isoformat(), "input_tokens": 1000},
        {"tool_name": "Bash", "command": "npm run build", "cost_usd": 0.01, "severity": None,
         "flagged": False, "flag_reason": None, "project": "argus",
         "agent_type": None, "session_id": "s1", "tool_input": '{"command": "npm run build"}',
         "timestamp": (NOW - timedelta(hours=2)).isoformat(), "input_tokens": 800},
        {"tool_name": "Read", "command": None, "cost_usd": 0.004, "severity": None,
         "flagged": False, "flag_reason": None, "project": "jurag",
         "agent_type": None, "session_id": "s2", "tool_input": '{"file_path": "/app/main.py"}',
         "timestamp": (NOW - timedelta(days=3)).isoformat(), "input_tokens": 2000},
        {"tool_name": "Agent", "command": None, "cost_usd": 0.50, "severity": "critical",
         "flagged": True, "flag_reason": "high event cost: $0.500", "project": "jurag",
         "agent_type": "Explore", "session_id": "s2", "tool_input": '{"subagent_type": "Explore"}',
         "timestamp": (NOW - timedelta(minutes=10)).isoformat(), "input_tokens": 30000},
    ]


def q(query, **kw):
    return run(query, rows(), **kw)


class FilterTests(unittest.TestCase):
    def test_empty_query_returns_everything(self):
        self.assertEqual(q("")["matched"], 4)

    def test_field_equality_is_case_insensitive(self):
        self.assertEqual(q("tool=Bash")["matched"], 2)
        self.assertEqual(q("tool=bash")["matched"], 2)

    def test_terms_are_anded(self):
        self.assertEqual(q("tool=Bash flagged=true")["matched"], 1)

    def test_not_negates(self):
        self.assertEqual(q("NOT tool=Bash")["matched"], 2)

    def test_not_equals_operator(self):
        self.assertEqual(q("tool!=Bash")["matched"], 2)

    def test_wildcards(self):
        self.assertEqual(q("command=rm*")["matched"], 1)
        self.assertEqual(q("tool=*a*")["matched"], 4)   # Bash, Bash, Read, Agent all contain "a"
        self.assertEqual(q("tool=A*")["matched"], 1)    # only Agent starts with it

    def test_contains_operator(self):
        self.assertEqual(q("reason~outside")["matched"], 0)
        self.assertEqual(q("reason~dangerous")["matched"], 1)

    def test_bareword_is_full_text(self):
        self.assertEqual(q("npm")["matched"], 1)

    def test_quoted_phrase_with_spaces(self):
        self.assertEqual(q('"rm -rf build"')["matched"], 1)

    def test_numeric_comparisons(self):
        self.assertEqual(q("cost>0.015")["matched"], 2)
        self.assertEqual(q("cost>=0.5")["matched"], 1)
        self.assertEqual(q("input_tokens<1500")["matched"], 2)

    def test_boolean_field(self):
        self.assertEqual(q("flagged=true")["matched"], 2)
        self.assertEqual(q("flagged=false")["matched"], 2)

    def test_alias_resolution(self):
        self.assertEqual(q("agent=Explore")["matched"], 1)
        self.assertEqual(q("session=s1")["matched"], 2)


class SeverityTests(unittest.TestCase):
    def test_severity_compares_by_rank_not_alphabet(self):
        # alphabetically "critical" < "high"; by rank it is greater
        self.assertEqual(q("severity>=high")["matched"], 2)
        self.assertEqual(q("severity=critical")["matched"], 1)

    def test_unset_severity_is_below_everything(self):
        self.assertEqual(q("severity<high")["matched"], 2)   # the two unflagged rows

    def test_unknown_severity_is_a_user_error(self):
        with self.assertRaises(AQLError):
            q("severity>=bogus")

    def test_sort_by_severity_uses_rank(self):
        out = q("flagged=true | table severity | sort -severity")
        self.assertEqual([r["severity"] for r in out["rows"]], ["critical", "high"])


class TimeTests(unittest.TestCase):
    def test_earliest_relative(self):
        self.assertEqual(q("earliest=-24h")["matched"], 3)
        self.assertEqual(q("earliest=-30m")["matched"], 1)

    def test_latest_relative(self):
        self.assertEqual(q("latest=-24h")["matched"], 1)

    def test_bad_time_value_is_a_user_error(self):
        with self.assertRaises(AQLError):
            q("earliest=yesterday")


class StatsTests(unittest.TestCase):
    def test_count_by_field(self):
        out = q("| stats count by tool")
        self.assertEqual(out["kind"], "stats")
        counts = {r["tool_name"]: r["count"] for r in out["rows"]}
        self.assertEqual(counts, {"Bash": 2, "Read": 1, "Agent": 1})

    def test_sum_with_alias(self):
        out = q("| stats sum(cost_usd) as spend by project")
        spend = {r["project"]: r["spend"] for r in out["rows"]}
        self.assertAlmostEqual(spend["argus"], 0.03)
        self.assertAlmostEqual(spend["jurag"], 0.504)

    def test_multiple_aggregations(self):
        out = q("| stats count, sum(cost_usd) as spend, max(input_tokens) by project")
        self.assertIn("count", out["columns"])
        self.assertIn("spend", out["columns"])

    def test_distinct_count(self):
        out = q("| stats dc(session_id) as sessions")
        self.assertEqual(out["rows"][0]["sessions"], 2)

    def test_stats_without_by_aggregates_everything(self):
        out = q("| stats count")
        self.assertEqual(out["rows"][0]["count"], 4)

    def test_unknown_aggregation_is_a_user_error(self):
        with self.assertRaises(AQLError):
            q("| stats median(cost_usd)")


class PipelineTests(unittest.TestCase):
    def test_sort_descending_is_actually_descending(self):
        """Regression: negation in the sort key cancelled reverse=True."""
        out = q("| table cost_usd | sort -cost_usd")
        self.assertEqual([r["cost_usd"] for r in out["rows"]], [0.50, 0.02, 0.01, 0.004])

    def test_sort_ascending(self):
        out = q("| table cost_usd | sort cost_usd")
        self.assertEqual([r["cost_usd"] for r in out["rows"]], [0.004, 0.01, 0.02, 0.50])

    def test_sort_on_a_stats_alias(self):
        out = q("| stats sum(cost_usd) as spend by project | sort -spend")
        self.assertEqual(out["rows"][0]["project"], "jurag")

    def test_head_limits(self):
        self.assertEqual(len(q("| head 2")["rows"]), 2)

    def test_table_selects_columns(self):
        out = q("| table tool_name cost_usd")
        self.assertEqual(set(out["rows"][0]), {"tool_name", "cost_usd"})
        self.assertEqual(out["columns"], ["tool_name", "cost_usd"])

    def test_dedup(self):
        self.assertEqual(len(q("| dedup session")["rows"]), 2)

    def test_where_after_stats(self):
        out = q("| stats count by tool | where count>1")
        self.assertEqual(len(out["rows"]), 1)

    def test_where_preserves_quoted_phrases(self):
        """Regression: `where` re-joined lexed tokens, splitting quoted phrases."""
        out = q('| where command="rm -rf build"')
        self.assertEqual(out["matched"], 4)      # filter applies after the stage
        self.assertEqual(len(out["rows"]), 1)
        self.assertEqual(out["rows"][0]["command"], "rm -rf build")

    def test_chained_stages(self):
        out = q("tool=Bash | table command cost_usd | sort -cost_usd | head 1")
        self.assertEqual(out["rows"][0]["command"], "rm -rf build")

    def test_limit_reports_truncation(self):
        out = q("", limit=2)
        self.assertTrue(out["truncated"])
        self.assertEqual(out["matched"], 4)
        self.assertEqual(out["returned"], 2)


class ErrorTests(unittest.TestCase):
    def test_unknown_command(self):
        with self.assertRaises(AQLError):
            q("| frobnicate")

    def test_empty_stage(self):
        with self.assertRaises(AQLError):
            q("tool=Bash |")

    def test_unbalanced_quote(self):
        with self.assertRaises(AQLError):
            q('"unterminated')

    def test_or_is_rejected_clearly(self):
        with self.assertRaises(AQLError) as ctx:
            q("tool=Bash OR tool=Read")
        self.assertIn("OR", str(ctx.exception))

    def test_sort_without_field(self):
        with self.assertRaises(AQLError):
            q("| sort")


if __name__ == "__main__":
    unittest.main(verbosity=2)
