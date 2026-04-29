from __future__ import annotations

from typing import Any

from tortoise.expressions import Q
from tortoise.queryset import QuerySet

from src.core.query.operators import OPERATOR_MAP, FilterCondition, FilterOperator
from src.core.query.parser import FilterGroup, QueryPlan, SortSpec


class QueryBuilder:
    """Applies a QueryPlan to a Tortoise QuerySet using JSONB field traversal."""

    @staticmethod
    def apply(query: QuerySet, plan: QueryPlan) -> QuerySet:
        if plan.filter_expression is not None:
            query_filter = QueryBuilder._build_filter_q(plan.filter_expression)
            if query_filter is not None:
                query = query.filter(query_filter)
        elif plan.filters:
            query_filter = QueryBuilder._build_filter_q(FilterGroup(operator="and", children=tuple(plan.filters)))
            if query_filter is not None:
                query = query.filter(query_filter)

        for sort in plan.sorts:
            query = query.order_by(sort.tortoise_order)

        offset = (plan.page - 1) * plan.page_size
        query = query.offset(offset).limit(plan.page_size)

        if plan.fields:
            query = query.only(*plan.fields)

        return query

    @staticmethod
    def _build_filter_kwargs(plan: QueryPlan) -> dict[str, Any]:
        kwargs: dict[str, Any] = {}
        for condition in plan.filters:
            kwargs.update(QueryBuilder._build_condition_kwargs(condition))

        return kwargs

    @staticmethod
    def _build_condition_kwargs(condition: FilterCondition) -> dict[str, Any]:
        key = f"fields_snapshot__{condition.field}"
        suffix = OPERATOR_MAP.get(condition.operator, "")
        full_key = f"{key}{suffix}"

        if condition.operator == FilterOperator.NULL:
            return {full_key: True}
        if condition.operator == FilterOperator.NOT_NULL:
            return {full_key: False}
        if condition.operator == FilterOperator.NOT_CONTAINS:
            raise ValueError("$notContains requires Q expression negation")
        if condition.operator == FilterOperator.BETWEEN:
            if isinstance(condition.value, list) and len(condition.value) == 2:
                return {f"{key}__gte": condition.value[0], f"{key}__lte": condition.value[1]}
            return {}
        return {full_key: condition.value}

    @staticmethod
    def _build_filter_q(expression: FilterCondition | FilterGroup) -> Q | None:
        if not isinstance(expression, FilterGroup):
            if expression.operator == FilterOperator.NOT_CONTAINS:
                contains_value = expression.value if isinstance(expression.value, str) else str(expression.value)
                return ~Q(**{f"fields_snapshot__{expression.field}__contains": contains_value})
            kwargs = QueryBuilder._build_condition_kwargs(expression)
            if not kwargs:
                return None
            return Q(**kwargs)

        combined: Q | None = None
        for child in expression.children:
            child_q = QueryBuilder._build_filter_q(child)
            if child_q is None:
                continue
            if combined is None:
                combined = child_q
            elif expression.operator == "or":
                combined = combined | child_q
            else:
                combined = combined & child_q
        return combined

    @staticmethod
    def apply_sort(query: QuerySet, sorts: list[SortSpec]) -> QuerySet:
        for sort in sorts:
            query = query.order_by(sort.tortoise_order)
        return query
