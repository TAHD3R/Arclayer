from __future__ import annotations

from decimal import Decimal

from src.models.content._enums import ContentModelFieldType
from src.modules.projects.content.fields.base import AbstractFieldType, FieldConfig


class NumberFieldType(AbstractFieldType):
    field_type = ContentModelFieldType.NUMBER
    display_name = "Number (Integer)"

    def get_pydantic_type(self, config: FieldConfig) -> type:
        fmt = config.get("numberFormat", "integer")
        return float if fmt == "decimal" else int

    def get_db_column_type(self, config: FieldConfig) -> str:
        fmt = config.get("numberFormat", "integer")
        if fmt == "decimal":
            return "DECIMAL"
        return "INTEGER"

    def get_graphql_type(self, config: FieldConfig) -> type:
        fmt = config.get("numberFormat", "integer")
        return float if fmt == "decimal" else int

    def get_admin_component(self, config: FieldConfig) -> str:
        return "number-input"


class DecimalFieldType(AbstractFieldType):
    field_type = ContentModelFieldType.DECIMAL
    display_name = "Decimal"

    def get_pydantic_type(self, config: FieldConfig) -> type:
        return Decimal

    def get_db_column_type(self, config: FieldConfig) -> str:
        places = config.get("decimalPlaces", 2)
        return f"DECIMAL(18, {places})"

    def get_graphql_type(self, config: FieldConfig) -> type:
        return float

    def get_admin_component(self, config: FieldConfig) -> str:
        return "decimal-input"


class BigIntegerFieldType(AbstractFieldType):
    field_type = ContentModelFieldType.BIG_INTEGER
    display_name = "Big Integer"

    def get_pydantic_type(self, config: FieldConfig) -> type:
        return int

    def get_db_column_type(self, config: FieldConfig) -> str:
        return "BIGINT"

    def get_graphql_type(self, config: FieldConfig) -> type:
        return int

    def get_admin_component(self, config: FieldConfig) -> str:
        return "number-input"
