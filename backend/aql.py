"""AQL — the Argus Query Language.

An SPL-shaped query language for agent telemetry. The point is not to clone
Splunk; it is that agent events have their own vocabulary (tools, subagents,
skills, token cost, flag reasons) and searching them should feel like searching
a SIEM rather than filtering a table.

    tool=Bash flagged=true
    "rm -rf" | table timestamp tool_name command flag_reason
    severity>=high earliest=-24h | stats count by rule
    tool=Agent | stats sum(cost_usd) as spend by agent_type | sort -spend
    project=argus NOT tool=Read | head 20

Grammar
-------
    query    := search_terms [ '|' command ]*
    term     := field op value | "quoted phrase" | bareword | NOT term
    op       := =  !=  >  <  >=  <=  ~   (~ is "contains")
    command  := stats | table | sort | head | dedup | where | fields

Terms are ANDed. A bareword or quoted phrase is a full-text match across the
searchable text of the event (tool input/output, command, flag reason).

Values support `*` wildcards (`tool=Read*`, `command=git*`).

Time is a filter like any other: `earliest=-24h`, `latest=-10m`, or an ISO
timestamp. Relative offsets accept s/m/h/d.

Execution is deliberately in-Python over rows the caller supplies rather than
compiled to SQL: the input is a user-supplied string, and not building SQL from
it means there is no injection surface to get wrong.
"""

from __future__ import annotations

import fnmatch
import re
import shlex
from dataclasses import dataclass
from dataclasses import field as dc_field
from datetime import datetime, timedelta
from typing import Any, Iterable


class AQLError(ValueError):
    """Raised for a malformed query. The message is shown to the user."""


# Friendly names → the underlying event/session attribute.
FIELD_ALIASES = {
    "tool": "tool_name",
    "session": "session_id",
    "agent": "agent_type",
    "skill": "skill_name",
    "cost": "cost_usd",
    "reason": "flag_reason",
    "rule": "flag_reason",
    "status": "session_status",
    "project": "project",
    "time": "timestamp",
    "event": "type",
    "hook": "hook_event_name",
    "duration": "duration_ms",
    "in_tokens": "input_tokens",
    "out_tokens": "output_tokens",
}

# Fields a bareword search scans.
FULLTEXT_FIELDS = ("tool_name", "command", "tool_input", "tool_output",
                   "flag_reason", "agent_type", "skill_name", "project")

SEVERITY_ORDER = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}

_OPS = ["!=", ">=", "<=", "=", ">", "<", "~"]
_TERM_RE = re.compile(
    r"^(?P<field>[A-Za-z_][A-Za-z0-9_]*)(?P<op>!=|>=|<=|=|>|<|~)(?P<value>.*)$"
)


# ── filtering ────────────────────────────────────────────────────────────────

@dataclass
class Term:
    field: str | None          # None => full-text
    op: str
    value: str
    negated: bool = False

    def matches(self, row: dict) -> bool:
        result = self._match(row)
        return (not result) if self.negated else result

    def _match(self, row: dict) -> bool:
        if self.field is None:
            needle = self.value.lower()
            return any(needle in str(row.get(f) or "").lower() for f in FULLTEXT_FIELDS)

        actual = row.get(self.field)
        if self.field == "severity":
            return self._compare_severity(actual)
        if self.field == "timestamp":
            return self._compare_time(actual)

        if isinstance(actual, bool) or str(self.value).lower() in ("true", "false"):
            want = str(self.value).lower() == "true"
            got = bool(actual)
            return (got == want) if self.op in ("=", "~") else (got != want)

        if isinstance(actual, (int, float)) and not isinstance(actual, bool):
            try:
                return _numeric_compare(actual, self.op, float(self.value))
            except ValueError:
                pass  # comparing a number field against text — fall through to string

        text = str(actual or "")
        if self.op in ("=", "!="):
            hit = fnmatch.fnmatch(text.lower(), self.value.lower()) if "*" in self.value \
                else text.lower() == self.value.lower()
            return hit if self.op == "=" else not hit
        if self.op == "~":
            return self.value.lower() in text.lower()
        raise AQLError(f"cannot use '{self.op}' on field '{self.field}'")

    def _compare_severity(self, actual) -> bool:
        left = SEVERITY_ORDER.get(str(actual or "").lower())
        right = SEVERITY_ORDER.get(str(self.value).lower())
        if right is None:
            raise AQLError(f"unknown severity '{self.value}' "
                           f"(expected one of {', '.join(SEVERITY_ORDER)})")
        if left is None:
            return self.op in ("!=", "<", "<=")
        return _numeric_compare(left, self.op, right)

    def _compare_time(self, actual) -> bool:
        if actual is None:
            return False
        moment = actual if isinstance(actual, datetime) else _parse_time(str(actual))
        return _numeric_compare(moment.timestamp(), self.op, _parse_time(self.value).timestamp())


def _numeric_compare(left: float, op: str, right: float) -> bool:
    return {
        "=": left == right, "~": left == right, "!=": left != right,
        ">": left > right, "<": left < right, ">=": left >= right, "<=": left <= right,
    }[op]


_REL_RE = re.compile(r"^-(\d+)([smhd])$")


def _parse_time(value: str) -> datetime:
    value = value.strip()
    if value.lower() == "now":
        return datetime.utcnow()
    rel = _REL_RE.match(value)
    if rel:
        amount, unit = int(rel.group(1)), rel.group(2)
        delta = {"s": "seconds", "m": "minutes", "h": "hours", "d": "days"}[unit]
        return datetime.utcnow() - timedelta(**{delta: amount})
    try:
        return datetime.fromisoformat(value.replace("Z", ""))
    except ValueError as exc:
        raise AQLError(f"bad time value '{value}' — use -24h, -30m, now, or an ISO timestamp") from exc


# ── pipeline commands ────────────────────────────────────────────────────────

@dataclass
class Pipeline:
    terms: list[Term] = dc_field(default_factory=list)
    stages: list[tuple[str, list[str]]] = dc_field(default_factory=list)


_AGG_RE = re.compile(r"^(count|sum|avg|min|max|dc)\(([^)]*)\)$|^(count)$", re.IGNORECASE)


def _apply_stats(rows: list[dict], args: list[str]) -> tuple[list[dict], list[str]]:
    """stats count [as name] [by field, field]  |  stats sum(cost_usd) by tool"""
    by: list[str] = []
    if "by" in [a.lower() for a in args]:
        idx = [a.lower() for a in args].index("by")
        by = [_resolve(a.strip(",")) for a in args[idx + 1:]]
        args = args[:idx]
    if not args:
        raise AQLError("stats needs an aggregation, e.g. `stats count by tool`")

    aggs: list[tuple[str, str, str]] = []   # (func, field, output name)
    i = 0
    while i < len(args):
        token = args[i].strip(",")
        m = _AGG_RE.match(token)
        if not m:
            raise AQLError(f"unknown aggregation '{token}' "
                           "(use count, sum(f), avg(f), min(f), max(f), dc(f))")
        func = (m.group(1) or m.group(3)).lower()
        target = _resolve(m.group(2)) if m.group(2) else ""
        name = f"{func}({target})" if target else "count"
        if i + 2 < len(args) and args[i + 1].lower() == "as":
            name = args[i + 2].strip(",")
            i += 2
        aggs.append((func, target, name))
        i += 1

    buckets: dict[tuple, list[dict]] = {}
    for row in rows:
        key = tuple(str(row.get(f) or "") for f in by)
        buckets.setdefault(key, []).append(row)

    out: list[dict] = []
    for key, group in buckets.items():
        entry = {f: k for f, k in zip(by, key)}
        for func, target, name in aggs:
            values = [r.get(target) for r in group if r.get(target) is not None]
            numbers = [v for v in values if isinstance(v, (int, float)) and not isinstance(v, bool)]
            if func == "count":
                entry[name] = len(group) if not target else len(values)
            elif func == "dc":
                entry[name] = len({str(v) for v in values})
            elif func == "sum":
                entry[name] = round(sum(numbers), 4)
            elif func == "avg":
                entry[name] = round(sum(numbers) / len(numbers), 4) if numbers else 0
            elif func == "min":
                entry[name] = min(numbers) if numbers else None
            elif func == "max":
                entry[name] = max(numbers) if numbers else None
        out.append(entry)

    columns = by + [name for _, _, name in aggs]
    out.sort(key=lambda r: _sort_key(r.get(columns[-1]), columns[-1]), reverse=True)
    return out, columns


def _sort_key(value, field: str | None = None):
    """Order values of mixed type. No negation here — callers pass reverse=.

    An earlier version negated numbers *and* let callers pass reverse=True,
    which cancelled out and silently produced ascending "top N" lists.
    """
    if field == "severity":
        return (0, SEVERITY_ORDER.get(str(value or "").lower(), -1), "")
    if value is None or value == "":
        return (-1, 0, "")          # empties sort last under reverse=True
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return (0, float(value), "")
    return (0, 0, str(value).lower())


def _resolve(name: str) -> str:
    return FIELD_ALIASES.get(name.strip().lower(), name.strip())


# ── parsing ──────────────────────────────────────────────────────────────────

def parse(query: str) -> Pipeline:
    parts = _split_pipes(query)
    pipeline = Pipeline()

    head = parts[0].strip()
    if head:
        pipeline.terms = _parse_terms(head)

    for raw in parts[1:]:
        tokens = _lex(raw)
        if not tokens:
            raise AQLError("empty pipeline stage — a trailing '|' has nothing after it")
        name, args = tokens[0].lower(), tokens[1:]
        if name not in ("stats", "table", "fields", "sort", "head", "dedup", "where"):
            raise AQLError(
                f"unknown command '{name}' (available: stats, table, fields, sort, head, dedup, where)"
            )
        pipeline.stages.append((name, args))
    return pipeline


def _split_pipes(query: str) -> list[str]:
    """Split on | except inside quotes."""
    parts, current, quote = [], [], None
    for ch in query:
        if quote:
            current.append(ch)
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
            current.append(ch)
        elif ch == "|":
            parts.append("".join(current))
            current = []
        else:
            current.append(ch)
    parts.append("".join(current))
    return parts


def _lex(text: str) -> list[str]:
    try:
        lexer = shlex.shlex(text, posix=True)
        lexer.whitespace_split = True
        lexer.commenters = ""
        return list(lexer)
    except ValueError as exc:
        raise AQLError(f"could not parse query: {exc}") from exc


def _parse_terms(text: str) -> list[Term]:
    terms: list[Term] = []
    negate_next = False
    for token in _lex(text):
        if token.upper() in ("NOT", "!"):
            negate_next = True
            continue
        if token.upper() == "AND":
            continue
        if token.upper() == "OR":
            raise AQLError("OR is not supported yet — terms are ANDed")
        m = _TERM_RE.match(token)
        if m:
            field = _resolve(m.group("field"))
            value = m.group("value")
            if field in ("earliest", "latest"):
                terms.append(Term("timestamp", ">=" if field == "earliest" else "<=",
                                  value, negate_next))
            else:
                terms.append(Term(field, m.group("op"), value, negate_next))
        else:
            terms.append(Term(None, "~", token, negate_next))
        negate_next = False
    return terms


# ── execution ────────────────────────────────────────────────────────────────

DEFAULT_COLUMNS = ["timestamp", "severity", "tool_name", "command", "project",
                   "cost_usd", "flag_reason"]


def run(query: str, rows: Iterable[dict], *, limit: int = 200) -> dict[str, Any]:
    """Execute an AQL query over `rows` (dicts). Returns a table-shaped result."""
    pipeline = parse(query)

    result = [r for r in rows if all(t.matches(r) for t in pipeline.terms)]
    matched = len(result)
    columns: list[str] | None = None
    kind = "events"

    for name, args in pipeline.stages:
        if name == "stats":
            result, columns = _apply_stats(result, args)
            kind = "stats"
        elif name in ("table", "fields"):
            columns = [_resolve(a.strip(",")) for a in args]
            if not columns:
                raise AQLError("table needs at least one field")
            result = [{c: r.get(c) for c in columns} for r in result]
        elif name == "sort":
            if not args:
                raise AQLError("sort needs a field, e.g. `sort -cost_usd`")
            raw = args[0]
            descending = raw.startswith("-")
            key = raw.lstrip("+-")
            # `stats ... as spend` creates a column named `spend`; only fall back
            # to the alias table when the literal name isn't in the rows.
            if result and key not in result[0]:
                key = _resolve(key)
            result.sort(key=lambda r: _sort_key(r.get(key), key), reverse=descending)
        elif name == "head":
            try:
                result = result[: int(args[0])] if args else result[:10]
            except ValueError as exc:
                raise AQLError("head needs a number, e.g. `head 20`") from exc
        elif name == "dedup":
            if not args:
                raise AQLError("dedup needs a field")
            key = _resolve(args[0])
            seen, deduped = set(), []
            for r in result:
                marker = str(r.get(key))
                if marker not in seen:
                    seen.add(marker)
                    deduped.append(r)
            result = deduped
        elif name == "where":
            expr = " ".join(shlex.quote(a) if " " in a else a for a in args)
            result = [r for r in result if all(t.matches(r) for t in _parse_terms(expr))]

    truncated = len(result) > limit
    return {
        "kind": kind,
        "columns": columns or DEFAULT_COLUMNS,
        "rows": result[:limit],
        "matched": matched,
        "returned": min(len(result), limit),
        "truncated": truncated,
    }
