"""Unit tests for the Strapi-compatible query parser."""

from __future__ import annotations

import pytest

from src.core.query.builder import QueryBuilder
from src.core.query.operators import FilterOperator
from src.core.query.parser import FilterGroup, QueryParser, QueryPlan, SortSpec


class TestQueryParserFilters:
    def test_empty_filters_returns_empty(self):
        result = QueryParser.parse_filters(None)
        assert result == []

    def test_simple_equality_filter(self):
        result = QueryParser.parse_filters({"title": {"$eq": "hello"}})
        assert len(result) == 1
        assert result[0].field == "title"
        assert result[0].operator == FilterOperator.EQ
        assert result[0].value == "hello"

    def test_contains_filter(self):
        result = QueryParser.parse_filters({"title": {"$contains": "hello"}})
        assert len(result) == 1
        assert result[0].operator == FilterOperator.CONTAINS

    def test_gt_lt_filters(self):
        result = QueryParser.parse_filters({"price": {"$gt": 10, "$lt": 100}})
        assert len(result) == 2
        operators = {c.operator for c in result}
        assert FilterOperator.GT in operators
        assert FilterOperator.LT in operators

    def test_and_conjunction(self):
        result = QueryParser.parse_filters({
            "$and": [
                {"title": {"$contains": "hello"}},
                {"status": {"$eq": "published"}},
            ]
        })
        assert len(result) == 2

    def test_or_conjunction_keeps_expression_group(self):
        plan = QueryParser.parse({
            "filters": {
                "$or": [
                    {"title": {"$contains": "hello"}},
                    {"status": {"$eq": "published"}},
                ]
            }
        })

        assert isinstance(plan.filter_expression, FilterGroup)
        assert plan.filter_expression.operator == "or"
        assert len(plan.filters) == 2

    def test_null_filter(self):
        result = QueryParser.parse_filters({"deleted_at": {"$null": True}})
        assert len(result) == 1
        assert result[0].operator == FilterOperator.NULL

    def test_starts_with_filter(self):
        result = QueryParser.parse_filters({"slug": {"$startsWith": "hello"}})
        assert len(result) == 1
        assert result[0].operator == FilterOperator.STARTS_WITH

    def test_non_dict_value_treated_as_eq(self):
        result = QueryParser.parse_filters({"title": "hello"})
        assert len(result) == 1
        assert result[0].operator == FilterOperator.EQ


class TestQueryParserSort:
    def test_empty_sort_returns_empty(self):
        assert QueryParser.parse_sort(None) == []

    def test_ascending_sort(self):
        result = QueryParser.parse_sort(["title"])
        assert len(result) == 1
        assert result[0].field == "title"
        assert result[0].descending is False

    def test_descending_sort(self):
        result = QueryParser.parse_sort(["-createdAt"])
        assert len(result) == 1
        assert result[0].field == "createdAt"
        assert result[0].descending is True

    def test_mixed_sort(self):
        result = QueryParser.parse_sort(["title", "-createdAt"])
        assert len(result) == 2
        assert result[0].descending is False
        assert result[1].descending is True

    def test_skip_empty_strings(self):
        result = QueryParser.parse_sort(["title", "", "  "])
        assert len(result) == 1


class TestQueryParserPagination:
    def test_default_pagination(self):
        page, size = QueryParser.parse_pagination(None)
        assert page == 1
        assert size == 25

    def test_custom_pagination(self):
        page, size = QueryParser.parse_pagination({"page": 3, "pageSize": 50})
        assert page == 3
        assert size == 50

    def test_page_minimum_is_one(self):
        page, _ = QueryParser.parse_pagination({"page": 0})
        assert page == 1

    def test_page_size_maximum_is_100(self):
        _, size = QueryParser.parse_pagination({"pageSize": 500})
        assert size == 100


class TestQueryParser:
    def test_full_parse(self):
        plan = QueryParser.parse({
            "filters": {"title": {"$contains": "hello"}},
            "sort": ["-createdAt"],
            "pagination": {"page": 2, "pageSize": 10},
            "populate": ["author"],
            "fields": ["title", "slug"],
        })
        assert isinstance(plan, QueryPlan)
        assert len(plan.filters) == 1
        assert len(plan.sorts) == 1
        assert plan.page == 2
        assert plan.page_size == 10
        assert plan.populate == ["author"]
        assert plan.fields == ["title", "slug"]

    def test_empty_parse_returns_default_plan(self):
        plan = QueryParser.parse(None)
        assert plan.page == 1
        assert plan.page_size == 25
        assert plan.filters == []


class TestFilterOperator:
    def test_all_operators_defined(self):
        operators = list(FilterOperator)
        assert FilterOperator.EQ in operators
        assert FilterOperator.CONTAINS in operators
        assert FilterOperator.BETWEEN in operators
        assert len(operators) >= 14

    def test_operator_values_are_strapi_compatible(self):
        assert FilterOperator.EQ.value == "$eq"
        assert FilterOperator.CONTAINS.value == "$contains"
        assert FilterOperator.STARTS_WITH.value == "$startsWith"


class TestQueryBuilder:
    def test_not_contains_uses_negated_contains_q(self):
        plan = QueryParser.parse({"filters": {"title": {"$notContains": "draft"}}})
        assert plan.filter_expression is not None

        query_filter = QueryBuilder._build_filter_q(plan.filter_expression)

        assert query_filter is not None
        assert query_filter.filters == {"fields_snapshot__title__contains": "draft"}
        assert query_filter._is_negated is True

    def test_not_contains_cannot_be_represented_as_plain_kwargs(self):
        condition = QueryParser.parse_filters({"title": {"$notContains": "draft"}})[0]

        with pytest.raises(ValueError, match="\\$notContains"):
            QueryBuilder._build_condition_kwargs(condition)


class TestSortSpec:
    def test_tortoise_order_ascending(self):
        spec = SortSpec(field="title", descending=False)
        assert spec.tortoise_order == "title"

    def test_tortoise_order_descending(self):
        spec = SortSpec(field="title", descending=True)
        assert spec.tortoise_order == "-title"
