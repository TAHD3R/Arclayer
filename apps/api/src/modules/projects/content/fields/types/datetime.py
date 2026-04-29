from __future__ import annotations

from datetime import date, datetime, time

from src.models.content._enums import ContentModelFieldType
from src.modules.projects.content.fields.base import AbstractFieldType, FieldConfig


class DateTimeFieldType(AbstractFieldType):
    field_type = ContentModelFieldType.DATE_TIME
    display_name = "Date & Time"

    def get_pydantic_type(self, config: FieldConfig) -> type:
        return datetime

    def get_db_column_type(self, config: FieldConfig) -> str:
        return "TIMESTAMPTZ"

    def get_graphql_type(self, config: FieldConfig) -> type:
        return str

    def get_admin_component(self, config: FieldConfig) -> str:
        return "datetime-input"


class DateFieldType(AbstractFieldType):
    field_type = ContentModelFieldType.DATE
    display_name = "Date"

    def get_pydantic_type(self, config: FieldConfig) -> type:
        return date

    def get_db_column_type(self, config: FieldConfig) -> str:
        return "DATE"

    def get_graphql_type(self, config: FieldConfig) -> type:
        return str

    def get_admin_component(self, config: FieldConfig) -> str:
        return "date-input"


class TimeFieldType(AbstractFieldType):
    field_type = ContentModelFieldType.TIME
    display_name = "Time"

    def get_pydantic_type(self, config: FieldConfig) -> type:
        return time

    def get_db_column_type(self, config: FieldConfig) -> str:
        return "TIME"

    def get_graphql_type(self, config: FieldConfig) -> type:
        return str

    def get_admin_component(self, config: FieldConfig) -> str:
        return "time-input"
