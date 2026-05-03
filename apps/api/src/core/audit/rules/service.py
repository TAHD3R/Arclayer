"""Service layer audit rules — new architecture target.

New architecture:
  - EntityManager is the universal write gateway for ALL modules.
  - Repository (TortoiseORMRepository) for all read operations.
  - Service orchestrates: calls Repository for reads, EntityManager for writes.
  - No direct ORM access from service — EVER.

Hard-cut: no service should call ORM models directly for reads OR writes.
"""

from __future__ import annotations

from src.core.audit.indexer import is_orm_call
from src.core.audit.models import Severity, Violation
from src.core.audit.rules.base import AuditRule, v


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
                if is_orm_call(call):
                    parts = call.split(".")
                    method = parts[-1] if len(parts) >= 2 else ""
                    if method in ("create", "update", "delete", "bulk_create", "save"):
                        suggestion = "EntityManager"
                    else:
                        suggestion = "Repository"
                    violations.append(
                        v(
                            file=sym["file"],
                            line=sym["line"],
                            rule=self.rule_id,
                            message=f"Service '{sym['name']}' calls ORM directly: {call}. Use {suggestion} instead.",
                            severity=Severity.BLOCKER,
                            evidence=call,
                        )
                    )
        return violations
