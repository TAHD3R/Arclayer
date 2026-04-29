from __future__ import annotations

from src.models.content._enums import ContentModelFieldType
from src.modules.projects.content.fields.base import AbstractFieldType, FieldConfig


class BooleanFieldType(AbstractFieldType):
    field_type = ContentModelFieldType.BOOLEAN
    display_name = "Boolean"

    def get_pydantic_type(self, config: FieldConfig) -> type:
        return bool

    def get_db_column_type(self, config: FieldConfig) -> str:
        return "BOOLEAN"

    def get_graphql_type(self, config: FieldConfig) -> type:
        return bool

    def get_admin_component(self, config: FieldConfig) -> str:
        return "toggle-input"
