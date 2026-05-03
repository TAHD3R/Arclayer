"""Schema audit rules."""

from __future__ import annotations

from src.core.audit.models import Severity, Violation
from src.core.audit.rules.base import AuditRule, v


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
            for field_name, field_type in sym.get("type_annotations", {}).items():
                cleaned = field_type.replace(" ", "")
                if cleaned in self.BANNED_TYPES or "Any" in cleaned:
                    violations.append(
                        v(
                            file=sym["file"],
                            line=sym["line"],
                            rule=self.rule_id,
                            message=f"Schema '{sym['name']}' field '{field_name}' uses '{field_type}'. Use a specific type.",
                            severity=Severity.MAJOR,
                            evidence=f"{field_name}: {field_type}",
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
