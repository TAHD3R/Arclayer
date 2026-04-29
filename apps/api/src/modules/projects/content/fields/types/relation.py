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
