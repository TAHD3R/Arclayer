from __future__ import annotations

from enum import Enum

from src.models.content._enums import ContentModelFieldType
from src.modules.projects.content.fields.base import AbstractFieldType, FieldConfig


class EnumerationFieldType(AbstractFieldType):
    field_type = ContentModelFieldType.ENUMERATION
    display_name = "Enumeration"

    def get_pydantic_type(self, config: FieldConfig) -> type:
        options = _as_string_options(config.get("options", []))
        if options:
            return _build_enum(options)
        return str

    def get_db_column_type(self, config: FieldConfig) -> str:
        options = _as_string_options(config.get("options", []))
        if options:
            quoted = ",".join(f"'{opt}'" for opt in options)
            return f"VARCHAR(255) CHECK (value IN ({quoted}))"
        return "VARCHAR(255)"

    def get_graphql_type(self, config: FieldConfig) -> type:
        return str

    def get_admin_component(self, config: FieldConfig) -> str:
        return "enum-select"

    def validate_config(self, config: FieldConfig) -> None:
        raw_options = config.get("options")
        options = _as_string_options(raw_options)
        if not isinstance(raw_options, list) or not options:
            raise ValueError("Enumeration field requires at least one option")
        if len(options) != len(raw_options):
            raise ValueError("All enumeration options must be non-empty strings")
        normalized = [o.strip() for o in options]
        if len(set(normalized)) != len(normalized):
            raise ValueError("Enumeration options must be unique")
        default_value = config.get("defaultValue")
        if default_value is not None and default_value not in normalized:
            raise ValueError("Enumeration defaultValue must be one of the configured options")


def _as_string_options(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str) and item.strip()]


def _build_enum(options: list[str]) -> type:
    members = {o.upper().replace("-", "_").replace(" ", "_"): o for o in options}
    return Enum("DynamicEnum", members)  # type: ignore[return-value]
