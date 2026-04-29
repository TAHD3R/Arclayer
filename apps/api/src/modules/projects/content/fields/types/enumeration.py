from __future__ import annotations

from enum import Enum

from src.models.content._enums import ContentModelFieldType
from src.modules.projects.content.fields.base import AbstractFieldType, FieldConfig


class EnumerationFieldType(AbstractFieldType):
    field_type = ContentModelFieldType.ENUMERATION
    display_name = "Enumeration"

    def get_pydantic_type(self, config: FieldConfig) -> type:
        options = config.get("options", [])
        if isinstance(options, list) and options:
            return _build_enum(options)
        return str

    def get_db_column_type(self, config: FieldConfig) -> str:
        options = config.get("options", [])
        if isinstance(options, list) and options:
            quoted = ",".join(f"'{opt}'" for opt in options)
            return f"VARCHAR(255) CHECK (value IN ({quoted}))"
        return "VARCHAR(255)"

    def get_graphql_type(self, config: FieldConfig) -> type:
        return str

    def get_admin_component(self, config: FieldConfig) -> str:
        return "enum-select"

    def validate_config(self, config: FieldConfig) -> None:
        options = config.get("options")
        if not isinstance(options, list) or not options:
            raise ValueError("Enumeration field requires at least one option")
        if not all(isinstance(o, str) and o.strip() for o in options):
            raise ValueError("All enumeration options must be non-empty strings")
        normalized = [o.strip() for o in options]
        if len(set(normalized)) != len(normalized):
            raise ValueError("Enumeration options must be unique")


def _build_enum(options: list[str]) -> type:
    members = {o.upper().replace("-", "_").replace(" ", "_"): o for o in options}
    return Enum("DynamicEnum", members)  # type: ignore[return-value]
