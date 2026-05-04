"""Service layer audit rules — new architecture target.

New architecture:
  - EntityManager is the universal write gateway for ALL modules.
  - Repository (TortoiseORMRepository) for all read operations.
  - Service orchestrates: calls Repository for reads, EntityManager for writes.
  - No direct ORM access from service — EVER.

Hard-cut: no service should call ORM models directly for reads OR writes.
"""

from __future__ import annotations

from code_review_engine.migrated.indexer import call_evidence, call_line, call_name, is_orm_call
from code_review_engine.migrated.contracts import Severity, Violation
from code_review_engine.migrated.rules.base import AuditRule, v


class ServiceNoDirectORM(AuditRule):
    """Services must not call ORM model methods directly.

    Read operations: use Repository (TortoiseORMRepository).
    Write operations: use EntityManager (universal write gateway).
    """

    rule_id = "service.no-direct-orm"
    description = "Service must never call ORM models directly. Use Repository for reads, EntityManager for writes."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        for sym in symbols:
            if sym["kind"] != "service":
                continue
            for call in sym["calls"]:
                name = call_name(call)
                if is_orm_call(name):
                    parts = name.split(".")
                    method = parts[-1] if len(parts) >= 2 else ""
                    if method in ("create", "update", "delete", "bulk_create", "save"):
                        suggestion = "EntityManager"
                    else:
                        suggestion = "Repository"
                    violations.append(
                        v(
                            file=sym["file"],
                            line=call_line(call, sym["line"]),
                            rule=self.rule_id,
                            message=f"Service '{sym['name']}' calls ORM directly: {name}. Use {suggestion} instead.",
                            severity=Severity.BLOCKER,
                            evidence=call_evidence(call),
                        )
                    )
        return violations
