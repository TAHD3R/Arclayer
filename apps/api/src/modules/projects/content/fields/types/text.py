from __future__ import annotations

from src.models.content._enums import ContentModelFieldType
from src.modules.projects.content.fields.base import AbstractFieldType, FieldConfig


class TextFieldType(AbstractFieldType):
    field_type = ContentModelFieldType.TEXT
    display_name = "Short Text"

    def get_pydantic_type(self, config: FieldConfig) -> type:
        return str

    def get_db_column_type(self, config: FieldConfig) -> str:
        max_len = config.get("maxLength", 255)
        return f"VARCHAR({max_len})"

    def get_graphql_type(self, config: FieldConfig) -> type:
        return str

    def get_admin_component(self, config: FieldConfig) -> str:
        return "text-input"

    def validate_config(self, config: FieldConfig) -> None:
        _assert_min_max(config, default_max=255)


class LongTextFieldType(AbstractFieldType):
    field_type = ContentModelFieldType.LONG_TEXT
    display_name = "Long Text"

    def get_pydantic_type(self, config: FieldConfig) -> type:
        return str

    def get_db_column_type(self, config: FieldConfig) -> str:
        return "TEXT"

    def get_graphql_type(self, config: FieldConfig) -> type:
        return str

    def get_admin_component(self, config: FieldConfig) -> str:
        return "textarea"


class RichTextFieldType(AbstractFieldType):
    field_type = ContentModelFieldType.RICH_TEXT
    display_name = "Rich Text"

    def get_pydantic_type(self, config: FieldConfig) -> type:
        return dict

    def get_db_column_type(self, config: FieldConfig) -> str:
        return "JSONB"

    def get_graphql_type(self, config: FieldConfig) -> type:
        return dict

    def get_admin_component(self, config: FieldConfig) -> str:
        return "rich-text-editor"


class MarkdownFieldType(AbstractFieldType):
    field_type = ContentModelFieldType.MARKDOWN
    display_name = "Markdown"

    def get_pydantic_type(self, config: FieldConfig) -> type:
        return str

    def get_db_column_type(self, config: FieldConfig) -> str:
        return "TEXT"

    def get_graphql_type(self, config: FieldConfig) -> type:
        return str

    def get_admin_component(self, config: FieldConfig) -> str:
        return "markdown-editor"


class SlugFieldType(AbstractFieldType):
    field_type = ContentModelFieldType.SLUG
    display_name = "Slug"

    def get_pydantic_type(self, config: FieldConfig) -> type:
        return str

    def get_db_column_type(self, config: FieldConfig) -> str:
        return "VARCHAR(255)"

    def get_graphql_type(self, config: FieldConfig) -> type:
        return str

    def get_admin_component(self, config: FieldConfig) -> str:
        return "slug-input"


class EmailFieldType(AbstractFieldType):
    field_type = ContentModelFieldType.EMAIL
    display_name = "Email"

    def get_pydantic_type(self, config: FieldConfig) -> type:
        return str

    def get_db_column_type(self, config: FieldConfig) -> str:
        return "VARCHAR(255)"

    def get_graphql_type(self, config: FieldConfig) -> type:
        return str

    def get_admin_component(self, config: FieldConfig) -> str:
        return "email-input"


def _assert_min_max(config: FieldConfig, *, default_min: int = 0, default_max: int = 65535) -> None:
    mn = config.get("minLength", default_min)
    mx = config.get("maxLength", default_max)
    if not isinstance(mn, int) or mn < 0:
        raise ValueError("minLength must be a non-negative integer")
    if not isinstance(mx, int) or mx < 0:
        raise ValueError("maxLength must be a non-negative integer")
    if mn > mx:
        raise ValueError("minLength must not exceed maxLength")
