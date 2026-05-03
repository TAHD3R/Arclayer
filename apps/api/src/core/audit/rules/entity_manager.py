"""EntityManager audit rules — new architecture universal write gateway.

Target architecture:
  - EntityManager is the universal write gateway for ALL modules.
  - Return types must be Pydantic BaseModel (NOT @dataclass).
  - No Any/dict fields in return types.
  - Lifecycle hooks (before/after) must be dispatched for all write operations.
"""

from __future__ import annotations

from src.core.audit.models import Severity, Violation
from src.core.audit.rules.base import AuditRule, v


class EntityManagerNoDataclassReturn(AuditRule):
    """EntityManager return types must be Pydantic BaseModel, never @dataclass.

    Current violations: EntityCreateResult, EntityUpdateResult, LifecycleEvent
    are all @dataclass — these must be migrated to Pydantic v2 BaseModel.
    """

    rule_id = "entity-manager.no-dataclass-return"
    description = "EntityManager return types must be Pydantic BaseModel, never @dataclass."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        for sym in symbols:
            if sym["kind"] == "dataclass":
                violations.append(
                    v(
                        file=sym["file"],
                        line=sym["line"],
                        rule=self.rule_id,
                        message=f"EntityManager-related type '{sym['name']}' is a @dataclass. Migrate to Pydantic v2 BaseModel.",
                        severity=Severity.BLOCKER,
                        evidence=f"@dataclass\nclass {sym['name']}",
                    )
                )
            # Also check entity_manager symbols referencing dataclass types
            if sym["kind"] == "entity_manager":
                for ann_name, ann_type in sym.get("type_annotations", {}).items():
                    if ann_type == "Any" or "dataclass" in ann_type.lower():
                        violations.append(
                            v(
                                file=sym["file"],
                                line=sym["line"],
                                rule=self.rule_id,
                                message=f"EntityManager references untyped '{ann_type}' in '{ann_name}'. Use a Pydantic BaseModel.",
                                severity=Severity.BLOCKER,
                                evidence=f"{ann_name}: {ann_type}",
                            )
                        )
        return violations


class EntityManagerNoAnyFields(AuditRule):
    """EntityManager return types must not use Any in field definitions."""

    rule_id = "entity-manager.no-any-fields"
    description = "EntityManager return value fields must not use Any or untyped dict."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        for sym in symbols:
            if sym["kind"] not in ("entity_manager", "dataclass"):
                continue
            for field_name, field_type in sym.get("type_annotations", {}).items():
                if "Any" in field_type or field_type == "dict":
                    violations.append(
                        v(
                            file=sym["file"],
                            line=sym["line"],
                            rule=self.rule_id,
                            message=f"'{sym['name']}' field '{field_name}' has type '{field_type}'. Use a specific type or Pydantic model.",
                            severity=Severity.BLOCKER,
                            evidence=f"{field_name}: {field_type}",
                        )
                    )
            # Check dict[str, Any] in data parameters (common in EM)
            for call in sym.get("calls", []):
                if "dict" in call:
                    violations.append(
                        v(
                            file=sym["file"],
                            line=sym["line"],
                            rule=self.rule_id,
                            message=f"'{sym['name']}' passes untyped dict in call: {call}. Use typed Pydantic model.",
                            severity=Severity.MAJOR,
                            evidence=call,
                        )
                    )
        return violations


class EntityManagerWriteMustUseEM(AuditRule):
    """All write operations (create/update/delete) must go through EntityManager.

    This is a universal rule — EntityManager is the write gateway for ALL modules,
    not just content domain.
    """

    rule_id = "entity-manager.write-must-use-em"
    description = "All write operations must go through EntityManager. No direct ORM writes from any service."

    WRITE_METHODS = frozenset({"create", "update", "delete", "bulk_create", "save"})

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        from src.core.audit.indexer import is_orm_call

        for sym in symbols:
            if sym["kind"] == "entity_manager":
                continue  # EM is the allowed write path
            if sym["kind"] not in ("service", "other"):
                continue
            for call in sym["calls"]:
                if not is_orm_call(call):
                    continue
                method = call.split(".")[-1]
                if method in self.WRITE_METHODS:
                    violations.append(
                        v(
                            file=sym["file"],
                            line=sym["line"],
                            rule=self.rule_id,
                            message=f"Write operation outside EntityManager: '{sym['name']}' calls '{call}'. All writes must go through EntityManager.",
                            severity=Severity.BLOCKER,
                            evidence=call,
                        )
                    )
        return violations
