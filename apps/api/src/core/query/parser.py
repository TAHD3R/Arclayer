from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from src.core.query.operators import FilterCondition, FilterOperator

_SORT_DESC_PREFIX = "-"


@dataclass(frozen=True, slots=True)
class SortSpec:
    field: str
    descending: bool = False

    @property
    def tortoise_order(self) -> str:
        return f"-{self.field}" if self.descending else self.field


@dataclass
class FilterGroup:
    operator: Literal["and", "or"]
    children: tuple[FilterCondition | FilterGroup, ...] = ()


@dataclass
class QueryPlan:
    filters: list[FilterCondition] = field(default_factory=list)
    filter_expression: FilterCondition | FilterGroup | None = None
    sorts: list[SortSpec] = field(default_factory=list)
    page: int = 1
    page_size: int = 25
    populate: list[str] = field(default_factory=list)
    fields: list[str] | None = None
    max_depth: int = 10


class QueryParser:
    """Parses Strapi-compatible query string parameters into a typed QueryPlan."""

    @staticmethod
    def parse_filters(raw: dict[str, Any] | None) -> list[FilterCondition]:
        expression = QueryParser.parse_filter_expression(raw)
        if expression is None:
            return []
        conditions: list[FilterCondition] = []
        QueryParser._collect_conditions(expression, conditions)
        return conditions

    @staticmethod
    def parse_filter_expression(raw: dict[str, Any] | None) -> FilterCondition | FilterGroup | None:
        if raw is None or not isinstance(raw, dict):
            return None
        return QueryParser._parse_filter_group(raw, operator="and")

    @staticmethod
    def _parse_filter_group(
        group: dict[str, Any],
        *,
        operator: Literal["and", "or"],
    ) -> FilterCondition | FilterGroup | None:
        children: list[FilterCondition | FilterGroup] = []
        for key, value in group.items():
            if key in ("$and", "$or"):
                if isinstance(value, list):
                    child_operator: Literal["and", "or"] = "and" if key == "$and" else "or"
                    grouped_children: list[FilterCondition | FilterGroup] = []
                    for item in value:
                        if isinstance(item, dict):
                            child = QueryParser._parse_filter_group(item, operator="and")
                            if child is not None:
                                grouped_children.append(child)
                    if len(grouped_children) == 1:
                        children.append(grouped_children[0])
                    elif grouped_children:
                        children.append(FilterGroup(operator=child_operator, children=tuple(grouped_children)))
                continue
            if not isinstance(value, dict):
                children.append(FilterCondition(field=key, operator=FilterOperator.EQ, value=value))
                continue
            for op_key, op_value in value.items():
                try:
                    filter_operator = FilterOperator(op_key)
                except ValueError:
                    filter_operator = FilterOperator.EQ
                children.append(FilterCondition(field=key, operator=filter_operator, value=op_value))
        if not children:
            return None
        if len(children) == 1:
            return children[0]
        return FilterGroup(operator=operator, children=tuple(children))

    @staticmethod
    def _collect_conditions(
        expression: FilterCondition | FilterGroup,
        conditions: list[FilterCondition],
    ) -> None:
        if isinstance(expression, FilterCondition):
            conditions.append(expression)
            return
        for child in expression.children:
            QueryParser._collect_conditions(child, conditions)

    @staticmethod
    def parse_sort(raw: list[str] | None) -> list[SortSpec]:
        if raw is None or not isinstance(raw, list):
            return []
        sorts: list[SortSpec] = []
        for item in raw:
            if not isinstance(item, str) or not item.strip():
                continue
            item = item.strip()
            desc = item.startswith(_SORT_DESC_PREFIX)
            field = item[1:] if desc else item
            sorts.append(SortSpec(field=field, descending=desc))
        return sorts

    @staticmethod
    def parse_pagination(raw: dict[str, Any] | None) -> tuple[int, int]:
        if raw is None or not isinstance(raw, dict):
            return 1, 25
        page = max(1, int(raw.get("page", 1)) if isinstance(raw.get("page"), (int, str)) else 1)
        page_size = max(
            1, min(100, int(raw.get("pageSize", 25)) if isinstance(raw.get("pageSize"), (int, str)) else 25)
        )
        return page, page_size

    @staticmethod
    def parse(raw: dict[str, Any] | None = None) -> QueryPlan:
        if raw is None:
            return QueryPlan()
        filter_expression = QueryParser.parse_filter_expression(raw.get("filters"))
        filters = []
        if filter_expression is not None:
            QueryParser._collect_conditions(filter_expression, filters)
        sorts = QueryParser.parse_sort(raw.get("sort"))
        page, page_size = QueryParser.parse_pagination(raw.get("pagination"))
        populate = raw.get("populate", []) if isinstance(raw.get("populate"), list) else []
        fields = raw.get("fields") if isinstance(raw.get("fields"), list) else None
        return QueryPlan(
            filters=filters,
            filter_expression=filter_expression,
            sorts=sorts,
            page=page,
            page_size=page_size,
            populate=[str(p) for p in populate],
            fields=[str(f) for f in fields] if fields is not None else None,
        )
