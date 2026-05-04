"""EntityManager audit rules — new architecture universal write gateway.

Target architecture:
  - EntityManager is the universal write gateway for ALL modules.
  - Return types must be Pydantic BaseModel (NOT @dataclass).
  - No Any/dict fields in return types.
  - Lifecycle hooks (before/after) must be dispatched for all write operations.
"""

from __future__ import annotations

from code_review_engine.migrated.contracts import Severity, Violation
from code_review_engine.migrated.indexer import (
    annotation_evidence,
    annotation_line,
    annotation_type,
    call_evidence,
    call_line,
    call_name,
    is_orm_call,
)
from code_review_engine.migrated.rules.base import AuditRule, v


class EntityManagerNoDataclassReturn(AuditRule):
    """EntityManager return types must be Pydantic BaseModel, never @dataclass.

    Current violations: EntityCreateResult, EntityUpdateResult, LifecycleEvent
    are all @dataclass — these must be migrated to Pydantic v2 BaseModel.
    """

    rule_id = "entity-manager.no-dataclass-return"
    description = "EntityManager return types must be Pydantic BaseModel, never @dataclass."
    ENTITY_MANAGER_DATACLASS_FILES = frozenset(
        {
            "apps/api/src/core/entity_manager/manager.py",
            "apps/api/src/core/lifecycles/specs.py",
        }
    )

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        for sym in symbols:
            if sym["kind"] == "dataclass" and sym["file"] in self.ENTITY_MANAGER_DATACLASS_FILES:
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
                for ann_name, annotation in sym.get("type_annotations", {}).items():
                    ann_type = annotation_type(annotation)
                    if ann_type == "Any" or "dataclass" in ann_type.lower():
                        violations.append(
                            v(
                                file=sym["file"],
                                line=annotation_line(annotation, sym["line"]),
                                rule=self.rule_id,
                                message=f"EntityManager references untyped '{ann_type}' in '{ann_name}'. Use a Pydantic BaseModel.",
                                severity=Severity.BLOCKER,
                                evidence=annotation_evidence(ann_name, annotation),
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
            for field_name, annotation in sym.get("type_annotations", {}).items():
                field_type = annotation_type(annotation)
                if "Any" in field_type or field_type == "dict":
                    violations.append(
                        v(
                            file=sym["file"],
                            line=annotation_line(annotation, sym["line"]),
                            rule=self.rule_id,
                            message=f"'{sym['name']}' field '{field_name}' has type '{field_type}'. Use a specific type or Pydantic model.",
                            severity=Severity.BLOCKER,
                            evidence=annotation_evidence(field_name, annotation),
                        )
                    )
            # Check dict[str, Any] in data parameters (common in EM)
            for call in sym.get("calls", []):
                name = call_name(call)
                if "dict" in name:
                    violations.append(
                        v(
                            file=sym["file"],
                            line=call_line(call, sym["line"]),
                            rule=self.rule_id,
                            message=f"'{sym['name']}' passes untyped dict in call: {name}. Use typed Pydantic model.",
                            severity=Severity.MAJOR,
                            evidence=call_evidence(call),
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

        for sym in symbols:
            if sym["kind"] == "entity_manager":
                continue  # EM is the allowed write path
            if sym["kind"] not in ("service", "other"):
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
                            message=f"Write operation outside EntityManager: '{sym['name']}' calls '{name}'. All writes must go through EntityManager.",
                            severity=Severity.BLOCKER,
                            evidence=call_evidence(call),
                        )
                    )
        return violations
