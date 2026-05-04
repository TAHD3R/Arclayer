"""i18n audit rules.

Project truth (2026-05-03):
  - Backend t() pattern: t(namespace, key, **kwargs) — two positional args.
  - Frontend t() pattern: t('namespace:KEY') — one arg, colon-separated.
  - Key style: UPPER_SNAKE_CASE (per docs/guidelines/i18n.md sec 5.1).
  - User-visible strings must be wrapped in t().

Guideline reference: docs/guidelines/i18n.md sec 5-7.
"""

from __future__ import annotations

import json
from pathlib import Path
import re

from code_review_engine.migrated.contracts import Severity, Violation
from code_review_engine.migrated.runtime import get_repo_root_from_env
from code_review_engine.migrated.rules.base import AuditRule, v

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
REQUIRED_ERROR_LOCALES = ("zh-CN", "en-US")


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
    VISIBLE_KWARGS = frozenset({"message", "detail"})

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        localized_error_codes: dict[str, frozenset[str]] | None = None
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
                error_code = kwargs.get("error")
                if error_code:
                    if localized_error_codes is None:
                        localized_error_codes = _localized_error_codes()
                    if not _has_all_error_locales(error_code, localized_error_codes):
                        violations.append(
                            v(
                                file=sym["file"],
                                line=exc.get("line", sym["line"]),
                                rule=self.rule_id,
                                message=(
                                    f"Exception '{exc_name}' uses error='{error_code}' without complete "
                                    "errors locale coverage."
                                ),
                                severity=Severity.MAJOR,
                                evidence=f"raise {exc_name}(error='{error_code}')",
                            )
                        )
        return violations


def _localized_error_codes() -> dict[str, frozenset[str]]:
    repo_root = get_repo_root_from_env()
    if repo_root is None:
        raise RuntimeError("Cannot validate error-code i18n without a repository root.")

    codes_by_locale: dict[str, frozenset[str]] = {}
    for locale in REQUIRED_ERROR_LOCALES:
        path = Path(repo_root) / "locales" / locale / "errors.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError(f"{path} must contain a JSON object.")
        codes_by_locale[locale] = frozenset(str(key) for key in data)
    return codes_by_locale


def _has_all_error_locales(error_code: str, localized_error_codes: dict[str, frozenset[str]]) -> bool:
    return all(error_code in localized_error_codes[locale] for locale in REQUIRED_ERROR_LOCALES)


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
                            line=int(tc.get("line", sym["line"])),
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
                            line=int(tc.get("line", sym["line"])),
                            rule=self.rule_id,
                            message=f"Translation namespace '{ns}' not in recognized registry. Verify per i18n.md sec 4.",
                            severity=Severity.MINOR,
                            evidence=tc.get("raw", ns),
                        )
                    )
        return violations
