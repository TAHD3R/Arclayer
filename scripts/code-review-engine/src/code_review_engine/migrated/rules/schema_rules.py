"""Schema audit rules."""

from __future__ import annotations

from code_review_engine.migrated.contracts import Severity, Violation
from code_review_engine.migrated.indexer import annotation_evidence, annotation_line, annotation_type
from code_review_engine.migrated.rules.base import AuditRule, v


class SchemaNoAnyDictFields(AuditRule):
    """Schema fields must not use Any or untyped dict."""

    rule_id = "schema.no-any-dict-fields"
    description = "Pydantic Schema fields must have specific types, never Any or bare dict."

    BANNED_TYPES = frozenset({"Any", "dict", "dict[str, Any]", "Dict[str, Any]", "Dict"})

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        for sym in symbols:
            if sym["kind"] != "schema":
                continue
            for field_name, annotation in sym.get("type_annotations", {}).items():
                field_type = annotation_type(annotation)
                cleaned = field_type.replace(" ", "")
                if cleaned in self.BANNED_TYPES or "Any" in cleaned:
                    violations.append(
                        v(
                            file=sym["file"],
                            line=annotation_line(annotation, sym["line"]),
                            rule=self.rule_id,
                            message=f"Schema '{sym['name']}' field '{field_name}' uses '{field_type}'. Use a specific type.",
                            severity=Severity.MAJOR,
                            evidence=annotation_evidence(field_name, annotation),
                        )
                    )
        return violations


class SchemaMustExtendBase(AuditRule):
    """Schemas must extend a recognized Pydantic v2 base."""

    rule_id = "schema.must-extend-base"
    description = "Schema class must extend BaseModel, BaseSchema, or BaseOut."
    ALLOWED_BASES = frozenset({"BaseModel", "BaseSchema", "BaseOut", "BaseIn"})

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        for sym in symbols:
            if sym["kind"] != "schema":
                continue
            parent = sym.get("parent_class", "")
            if parent and parent.split(".")[-1] not in self.ALLOWED_BASES:
                violations.append(
                    v(
                        file=sym["file"],
                        line=sym["line"],
                        rule=self.rule_id,
                        message=f"Schema '{sym['name']}' extends '{parent}' — not a recognized Pydantic v2 base.",
                        severity=Severity.MAJOR,
                        evidence=f"class {sym['name']}({parent}): ...",
                    )
                )
        return violations
