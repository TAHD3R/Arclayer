from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class FilterOperator(StrEnum):
    EQ = "$eq"
    NE = "$ne"
    IN = "$in"
    NIN = "$nin"
    LT = "$lt"
    LTE = "$lte"
    GT = "$gt"
    GTE = "$gte"
    CONTAINS = "$contains"
    NOT_CONTAINS = "$notContains"
    NULL = "$null"
    NOT_NULL = "$notNull"
    STARTS_WITH = "$startsWith"
    ENDS_WITH = "$endsWith"
    BETWEEN = "$between"


@dataclass(frozen=True, slots=True)
class FilterCondition:
    field: str
    operator: FilterOperator
    value: object = None


OPERATOR_MAP: dict[FilterOperator, str] = {
    FilterOperator.EQ: "",
    FilterOperator.NE: "__not",
    FilterOperator.IN: "__in",
    FilterOperator.NIN: "__not_in",
    FilterOperator.LT: "__lt",
    FilterOperator.LTE: "__lte",
    FilterOperator.GT: "__gt",
    FilterOperator.GTE: "__gte",
    FilterOperator.CONTAINS: "__contains",
    FilterOperator.NOT_CONTAINS: "",  # handled specially
    FilterOperator.NULL: "__isnull",
    FilterOperator.NOT_NULL: "__isnull",
    FilterOperator.STARTS_WITH: "__startswith",
    FilterOperator.ENDS_WITH: "__endswith",
}
