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

    def validate_config(self, config: FieldConfig) -> None:
        allowed_blocks = config.get("allowedBlocks")
        if allowed_blocks is not None:
            if not isinstance(allowed_blocks, list) or not allowed_blocks:
                raise ValueError("allowedBlocks must include at least one block type")
            string_blocks = [item for item in allowed_blocks if isinstance(item, str) and item.strip()]
            if len(string_blocks) != len(allowed_blocks):
                raise ValueError("allowedBlocks must contain non-empty strings")
            normalized = [item.strip() for item in string_blocks]
            if len(set(normalized)) != len(normalized):
                raise ValueError("allowedBlocks must contain unique values")
        min_value = config.get("min")
        max_value = config.get("max")
        if min_value is not None and (type(min_value) is not int or min_value < 0):
            raise ValueError("min must be a non-negative integer")
        if max_value is not None and (type(max_value) is not int or max_value < 0):
            raise ValueError("max must be a non-negative integer")
        if type(min_value) is int and type(max_value) is int and min_value > max_value:
            raise ValueError("min must not exceed max")
