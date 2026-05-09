from __future__ import annotations

from uuid import UUID

from src.models.content._enums import ContentModelFieldType
from src.modules.projects.content.fields.base import AbstractFieldType, FieldConfig


class ReferenceFieldType(AbstractFieldType):
    field_type = ContentModelFieldType.REFERENCE
    display_name = "Reference"

    def get_pydantic_type(self, config: FieldConfig) -> type:
        mode = config.get("referenceMode", "single")
        return list[UUID] if mode == "multiple" else UUID

    def get_db_column_type(self, config: FieldConfig) -> str:
        mode = config.get("referenceMode", "single")
        return "FK[] → content_items" if mode == "multiple" else "FK → content_items"

    def get_graphql_type(self, config: FieldConfig) -> type:
        mode = config.get("referenceMode", "single")
        return list[str] if mode == "multiple" else str

    def get_admin_component(self, config: FieldConfig) -> str:
        return "reference-picker"

    def validate_config(self, config: FieldConfig) -> None:
        target = config.get("targetModelKey")
        if not isinstance(target, str) or not target.strip():
            raise ValueError("Reference field requires targetModelKey")
        mode = config.get("referenceMode", "single")
        if mode not in ("single", "multiple"):
            raise ValueError("referenceMode must be 'single' or 'multiple'")
        _assert_multiple_item_bounds(config, mode=mode, mode_name="referenceMode")


class ComponentFieldType(AbstractFieldType):
    field_type = ContentModelFieldType.COMPONENT
    display_name = "Component"

    def get_pydantic_type(self, config: FieldConfig) -> type:
        return dict

    def get_db_column_type(self, config: FieldConfig) -> str:
        return "JSONB"

    def get_graphql_type(self, config: FieldConfig) -> type:
        return dict

    def get_admin_component(self, config: FieldConfig) -> str:
        return "component-field"

    def validate_config(self, config: FieldConfig) -> None:
        target = config.get("targetComponentKey")
        if not isinstance(target, str) or not target.strip():
            raise ValueError("Component field requires targetComponentKey")
        repeatable = config.get("repeatable", False)
        if not isinstance(repeatable, bool):
            raise ValueError("repeatable must be a boolean")
        if "min" in config or "max" in config:
            if repeatable is not True:
                raise ValueError("min and max can only be configured for repeatable components")
            _assert_integer_bounds(config)


class DynamicZoneFieldType(AbstractFieldType):
    field_type = ContentModelFieldType.DYNAMIC_ZONE
    display_name = "Dynamic Zone"

    def get_pydantic_type(self, config: FieldConfig) -> type:
        return list

    def get_db_column_type(self, config: FieldConfig) -> str:
        return "JSONB"

    def get_graphql_type(self, config: FieldConfig) -> type:
        return list

    def get_admin_component(self, config: FieldConfig) -> str:
        return "dynamic-zone"

    def validate_config(self, config: FieldConfig) -> None:
        components = config.get("components")
        if not isinstance(components, list) or not components:
            raise ValueError("Dynamic zone requires at least one component")
        if not all(isinstance(c, str) and c.strip() for c in components):
            raise ValueError("Dynamic zone components must be non-empty strings")
        _assert_integer_bounds(config)


def _assert_multiple_item_bounds(config: FieldConfig, *, mode: object, mode_name: str) -> None:
    if "min" not in config and "max" not in config:
        return
    if mode != "multiple":
        raise ValueError(f"min and max can only be configured when {mode_name} is 'multiple'")
    _assert_integer_bounds(config)


def _assert_integer_bounds(config: FieldConfig) -> None:
    min_value = config.get("min")
    max_value = config.get("max")
    if min_value is not None and (type(min_value) is not int or min_value < 0):
        raise ValueError("min must be a non-negative integer")
    if max_value is not None and (type(max_value) is not int or max_value < 0):
        raise ValueError("max must be a non-negative integer")
    if type(min_value) is int and type(max_value) is int and min_value > max_value:
        raise ValueError("min must not exceed max")
