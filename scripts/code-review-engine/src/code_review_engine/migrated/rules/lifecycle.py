"""Lifecycle hook audit rules.

New architecture: core/lifecycles/
  - LifecycleDispatcher: subscriber registry for lifecycle hooks.
  - LifecycleAction: BEFORE_CREATE, AFTER_CREATE, BEFORE_UPDATE, AFTER_UPDATE,
    BEFORE_DELETE, AFTER_DELETE, BEFORE_PUBLISH, AFTER_PUBLISH.
  - EntityManager must dispatch before/after hooks for all write operations.
  - Lifecycle subscribers must be registered for critical operations.

Hard-cut: every EntityManager write operation must have lifecycle hook dispatch.
"""

from __future__ import annotations

import ast
import pathlib

from code_review_engine.migrated.contracts import Severity, Violation
from code_review_engine.migrated.indexer import call_name
from code_review_engine.migrated.rules.base import AuditRule, v
from code_review_engine.migrated.runtime import get_repo_root_from_env

REQUIRED_LIFECYCLE_ACTIONS = frozenset({
    "BEFORE_CREATE",
    "AFTER_CREATE",
    "BEFORE_UPDATE",
    "AFTER_UPDATE",
    "BEFORE_DELETE",
    "AFTER_DELETE",
    "BEFORE_PUBLISH",
    "AFTER_PUBLISH",
})


def _repo_root() -> pathlib.Path:
    env_root = get_repo_root_from_env()
    if env_root is not None:
        return env_root
    return pathlib.Path(".")


class LifecycleMustDispatchHooks(AuditRule):
    """EntityManager write operations must dispatch lifecycle hooks.

    Checks that EntityManager create/update/delete methods call
    _dispatch_before and _dispatch_after with valid LifecycleAction values.
    """

    rule_id = "lifecycle.must-dispatch-hooks"
    description = "EntityManager must dispatch before/after lifecycle hooks for every write operation."

    REQUIRED_DISPATCH = frozenset({"_dispatch_before", "_dispatch_after"})

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        for sym in symbols:
            if sym["kind"] != "entity_manager":
                continue
            has_before = any("_dispatch_before" in call_name(c) for c in sym["calls"])
            has_after = any("_dispatch_after" in call_name(c) for c in sym["calls"])
            if not has_before:
                violations.append(
                    v(
                        file=sym["file"],
                        line=sym["line"],
                        rule=self.rule_id,
                        message=f"EntityManager '{sym['name']}' does not dispatch BEFORE lifecycle hooks.",
                        severity=Severity.BLOCKER,
                        evidence="Missing _dispatch_before call",
                    )
                )
            if not has_after:
                violations.append(
                    v(
                        file=sym["file"],
                        line=sym["line"],
                        rule=self.rule_id,
                        message=f"EntityManager '{sym['name']}' does not dispatch AFTER lifecycle hooks.",
                        severity=Severity.MAJOR,
                        evidence="Missing _dispatch_after call",
                    )
                )
        return violations


class LifecycleSubscriberCoverage(AuditRule):
    """Critical lifecycle actions must have registered subscribers.

    Checks that lifecycle subscribers exist in the subscriber directory.
    """

    rule_id = "lifecycle.missing-subscribers"
    description = "Lifecycle subscribers must be registered for critical CRUD and publish actions."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        root = _repo_root()
        subscribers_dir = root / "apps" / "api" / "src" / "core" / "lifecycles" / "subscribers"
        if not subscribers_dir.is_dir():
            violations.append(
                v(
                    file="apps/api/src/core/lifecycles/subscribers/",
                    line=0,
                    rule=self.rule_id,
                    message="Lifecycle subscribers directory missing. At minimum, audit logging must be registered.",
                    severity=Severity.MAJOR,
                    evidence="Directory not found",
                )
            )
            return violations

        # Check that subscriber files exist and register for actions
        py_files = list(subscribers_dir.rglob("*.py"))
        if not py_files:
            violations.append(
                v(
                    file=str(subscribers_dir),
                    line=0,
                    rule=self.rule_id,
                    message="No lifecycle subscribers registered. At minimum, audit logging subscriber required.",
                    severity=Severity.MAJOR,
                    evidence="No .py files in subscribers/",
                )
            )
            return violations

        # Check what actions are covered
        covered_actions: set[str] = set()
        for f in py_files:
            if f.name.startswith("_"):
                continue
            try:
                tree = ast.parse(f.read_text(encoding="utf-8"))
            except (SyntaxError, UnicodeDecodeError):
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.Call):
                    for kw in node.keywords:
                        if kw.arg == "action" and isinstance(kw.value, ast.Attribute):
                            covered_actions.add(kw.value.attr)
                        elif kw.arg == "action" and isinstance(kw.value, ast.Constant):
                            covered_actions.add(str(kw.value.value))

        missing = REQUIRED_LIFECYCLE_ACTIONS - covered_actions
        if missing:
            violations.append(
                v(
                    file=str(subscribers_dir),
                    line=0,
                    rule=self.rule_id,
                    message=f"Lifecycle subscribers missing for actions: {sorted(missing)}.",
                    severity=Severity.MAJOR,
                    evidence=f"Covered: {sorted(covered_actions)}, Missing: {sorted(missing)}",
                )
            )
        return violations
