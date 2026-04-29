from __future__ import annotations

from src.models.content._enums import ContentModelFieldType
from src.modules.projects.content.fields.base import AbstractFieldType, FieldConfig


class JSONFieldType(AbstractFieldType):
    field_type = ContentModelFieldType.JSON
    display_name = "JSON Object"

    def get_pydantic_type(self, config: FieldConfig) -> type:
        return dict

    def get_db_column_type(self, config: FieldConfig) -> str:
        return "JSONB"

    def get_graphql_type(self, config: FieldConfig) -> type:
        return dict

    def get_admin_component(self, config: FieldConfig) -> str:
        return "json-editor"


class BlocksFieldType(AbstractFieldType):
    field_type = ContentModelFieldType.BLOCKS
    display_name = "Blocks"

    def get_pydantic_type(self, config: FieldConfig) -> type:
        return list

    def get_db_column_type(self, config: FieldConfig) -> str:
        return "JSONB"

    def get_graphql_type(self, config: FieldConfig) -> type:
        return list

    def get_admin_component(self, config: FieldConfig) -> str:
        return "blocks-editor"
