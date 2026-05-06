"""Architecture-level audit rules — cross-layer dependency violations.

New architecture:
  - EntityManager is the universal write gateway for ALL modules.
  - Repository (TortoiseORMRepository) for all read operations.
  - ORM models must only be accessed from Repository or EntityManager.
  - Router must never call repository directly.

Spec references:
  - docs/spec/api/backend/index.md sec 6
  - docs/spec/api/backend/domain-design.md sec 6
"""

from __future__ import annotations

from code_review_engine.migrated.indexer import call_evidence, call_line, call_name, is_orm_call
from code_review_engine.migrated.contracts import Severity, Violation
from code_review_engine.migrated.rules.base import AuditRule, v


class ORMLeakDetection(AuditRule):
    """ORM model calls must not appear outside Repository or EntityManager layers."""

    rule_id = "architecture.orm-leak"
    description = (
        "ORM model access (filter, get_or_none, create, etc.) must only happen in Repository or EntityManager."
    )
    ALLOWED_KINDS = frozenset({"repository", "entity_manager"})

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        for sym in symbols:
            if sym["kind"] in self.ALLOWED_KINDS:
                continue
            for call in sym["calls"]:
                name = call_name(call)
                if is_orm_call(name):
                    violations.append(
                        v(
                            file=sym["file"],
                            line=call_line(call, sym["line"]),
                            rule=self.rule_id,
                            message=f"ORM leak: '{sym['name']}' ({sym['kind']}) calls '{name}'. Move to Repository (reads) or EntityManager (writes).",
                            severity=Severity.BLOCKER,
                            evidence=call_evidence(call),
                        )
                    )
        return violations


class WritePathViolation(AuditRule):
    """Write operations must go through EntityManager — universal rule.

    EntityManager is the write gateway for ALL modules, not just content domain.
    """

    rule_id = "architecture.write-path-violation"
    description = "All write operations (create, update, delete) must go through EntityManager, universally."
    WRITE_METHODS = frozenset({"create", "update", "delete", "bulk_create", "save"})

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        for sym in symbols:
            if sym["kind"] in {"entity_manager", "repository"}:
                continue
            for call in sym["calls"]:
                name = call_name(call)
                if not is_orm_call(name):
                    continue
                method = name.split(".")[-1]
                if method in self.WRITE_METHODS:
                    violations.append(
                        v(
                            file=sym["file"],
                            line=call_line(call, sym["line"]),
                            rule=self.rule_id,
                            message=f"Write outside EntityManager: '{sym['name']}' ({sym['kind']}) calls '{name}'. All writes must go through EntityManager.",
                            severity=Severity.BLOCKER,
                            evidence=call_evidence(call),
                        )
                    )
        return violations


class RouterNoDirectRepository(AuditRule):
    """Router must not call repository directly — must go through service layer.

    Per docs/spec/api/backend/domain-design.md sec 6: "Router must not call repository directly."
    """

    rule_id = "architecture.router-no-direct-repository"
    description = "Router must call service, never repository directly."

    REPO_METHODS = frozenset({
        "build_queryset",
        "get_record_by_id",
        "find_one",
        "find_many",
        "create",
        "update",
        "delete",
        "count",
    })

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        repo_names = {s["name"] for s in symbols if s["kind"] == "repository"}
        for sym in symbols:
            if sym["kind"] != "other" or not sym["file"].endswith("/router.py"):
                continue
            for call in sym["calls"]:
                name = call_name(call)
                parts = name.split(".")
                if len(parts) >= 2 and parts[0] in repo_names and parts[-1] in self.REPO_METHODS:
                    violations.append(
                        v(
                            file=sym["file"],
                            line=call_line(call, sym["line"]),
                            rule=self.rule_id,
                            message=f"Router calls repository directly: '{name}'. Route through service instead.",
                            severity=Severity.BLOCKER,
                            evidence=call_evidence(call),
                        )
                    )
        return violations
