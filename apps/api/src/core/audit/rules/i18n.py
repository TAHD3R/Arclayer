"""i18n audit rules.

Project truth (2026-05-03):
  - Backend t() pattern: t(namespace, key, **kwargs) — two positional args.
  - Frontend t() pattern: t('namespace:KEY') — one arg, colon-separated.
  - Key style: UPPER_SNAKE_CASE (per docs/guidelines/i18n.md sec 5.1).
  - User-visible strings must be wrapped in t().

Guideline reference: docs/guidelines/i18n.md sec 5-7.
"""

from __future__ import annotations

import re

from src.core.audit.models import Severity, Violation
from src.core.audit.rules.base import AuditRule, v

UPPER_SNAKE_RE = re.compile(r"^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$")
RESERVED_NAMESPACES = frozenset({
    "common",
    "nav",
    "rbac",
    "setup",
    "invite",
    "team",
    "debug",
    "activity",
    "content_pages",
    "appearance",
    "settings",
    "account",
    "notifications",
    "command",
    "assets",
    "errors",
    "auth",
    "plugin",
})


class MissingI18nRule(AuditRule):
    """User-visible exception messages must use t(...) for i18n coverage.

    Covers:
      - raise XxxException(message='hardcoded string') without t()
      - raise XxxException(error='HARDCODED') without t()
      - raise HTTPException(detail='hardcoded') without t()
    """

    rule_id = "i18n.missing-t-call"
    description = "User-visible exception messages must be wrapped in t() for i18n."

    IGNORE_EXCEPTIONS = frozenset({
        "AssertionError",
        "NotImplementedError",
        "TypeError",
        "ValueError",
        "RuntimeError",
        "StopIteration",
        "KeyError",
        "IndexError",
        "AttributeError",
    })
    VISIBLE_KWARGS = frozenset({"message", "detail", "error"})

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        for sym in symbols:
            for exc in sym.get("raises", []):
                exc_name = exc.get("exception", "")
                if exc_name in self.IGNORE_EXCEPTIONS:
                    continue
                kwargs = exc.get("kwargs", {})
                for key in self.VISIBLE_KWARGS:
                    if key in kwargs:
                        violations.append(
                            v(
                                file=sym["file"],
                                line=exc.get("line", sym["line"]),
                                rule=self.rule_id,
                                message=f"Exception '{exc_name}' has hardcoded {key}='{kwargs[key]}'. Wrap in t(namespace, key).",
                                severity=Severity.MAJOR,
                                evidence=f"raise {exc_name}({key}='{kwargs[key]}')",
                            )
                        )
        return violations


class InvalidI18nKeyFormat(AuditRule):
    """Translation keys must follow UPPER_SNAKE_CASE per i18n.md sec 5.1."""

    rule_id = "i18n.invalid-key-format"
    description = "Translation keys must be UPPER_SNAKE_CASE (e.g. 'ACTION_CONFIRM', 'ERROR_NOT_FOUND')."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        for sym in symbols:
            for tc in sym.get("t_calls", []):
                key = tc.get("key", "")
                if not key or key == "<dynamic>":
                    continue
                if not UPPER_SNAKE_RE.match(key):
                    violations.append(
                        v(
                            file=sym["file"],
                            line=sym["line"],
                            rule=self.rule_id,
                            message=f"Translation key '{key}' is not UPPER_SNAKE_CASE. Use e.g. 'ERROR_NOT_FOUND'.",
                            severity=Severity.MINOR,
                            evidence=tc.get("raw", key),
                        )
                    )
        return violations


class InvalidI18nNamespace(AuditRule):
    """Translation namespace should be from the recognized registry or a new feature domain."""

    rule_id = "i18n.invalid-namespace"
    description = "Translation namespace not in the recognized core registry — verify ownership per i18n.md sec 4."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        for sym in symbols:
            for tc in sym.get("t_calls", []):
                ns = tc.get("namespace", "")
                if not ns:
                    continue
                if ns not in RESERVED_NAMESPACES and "/" not in ns:
                    # Unknown namespace — might be from a plugin or new feature
                    violations.append(
                        v(
                            file=sym["file"],
                            line=sym["line"],
                            rule=self.rule_id,
                            message=f"Translation namespace '{ns}' not in recognized registry. Verify per i18n.md sec 4.",
                            severity=Severity.MINOR,
                            evidence=tc.get("raw", ns),
                        )
                    )
        return violations
