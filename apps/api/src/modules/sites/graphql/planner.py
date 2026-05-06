from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from src.core.exceptions import BadRequest
from src.modules.sites.graphql.registry import get_graphql_model_schema, list_graphql_model_schemas

GraphQLPerspective = Literal["published", "preview"]
GraphQLSortDirection = Literal["asc", "desc"]


class GraphQLQueryRule(BaseModel):
    model_config = ConfigDict(frozen=True)
    exact_filter_fields: frozenset[str]
    contains_filter_fields: frozenset[str]
    sort_fields: frozenset[str]


class GraphQLQueryPlan(BaseModel):
    model_config = ConfigDict(frozen=True)
    site_id: UUID
    model_key: str
    perspective: GraphQLPerspective
    exact_filters: dict[str, str]
    contains_filters: dict[str, str]
    sort_field: str | None
    sort_direction: GraphQLSortDirection
    limit: int | None
    offset: int

    @property
    def bounded_offset(self) -> int:
        return max(self.offset, 0)

    @property
    def bounded_limit(self) -> int | None:
        if self.limit is None:
            return None
        return max(self.limit, 0)


def _query_rule_for_model(model_key: str) -> GraphQLQueryRule | None:
    schema = get_graphql_model_schema(model_key)
    if schema is None:
        return None
    return GraphQLQueryRule(
        exact_filter_fields=frozenset(item.field_key for item in schema.filters if item.operator == "exact"),
        contains_filter_fields=frozenset(item.field_key for item in schema.filters if item.operator == "contains"),
        sort_fields=frozenset(item.field_key for item in schema.sorts),
    )


def list_graphql_query_rules() -> dict[str, GraphQLQueryRule]:
    return {
        schema.model_key: GraphQLQueryRule(
            exact_filter_fields=frozenset(item.field_key for item in schema.filters if item.operator == "exact"),
            contains_filter_fields=frozenset(item.field_key for item in schema.filters if item.operator == "contains"),
            sort_fields=frozenset(item.field_key for item in schema.sorts),
        )
        for schema in list_graphql_model_schemas()
    }


def _assert_query_fields_allowed(
    *,
    model_key: str,
    exact_filters: dict[str, str],
    contains_filters: dict[str, str],
    sort_field: str | None,
) -> None:
    rule = _query_rule_for_model(model_key)
    rejected_exact_filters = sorted(set(exact_filters) - (rule.exact_filter_fields if rule is not None else set()))
    rejected_contains_filters = sorted(
        set(contains_filters) - (rule.contains_filter_fields if rule is not None else set())
    )
    rejected_sort_field = (
        sort_field if sort_field is not None and (rule is None or sort_field not in rule.sort_fields) else None
    )
    if not rejected_exact_filters and not rejected_contains_filters and rejected_sort_field is None:
        return
    raise BadRequest(
        "GraphQL query field is not allowed for this model",
        error="GRAPHQL_QUERY_FIELD_FORBIDDEN",
        meta={
            "modelKey": model_key,
            "invalidExactFilters": rejected_exact_filters,
            "invalidContainsFilters": rejected_contains_filters,
            "invalidSortField": rejected_sort_field,
            "allowedExactFilters": sorted(rule.exact_filter_fields) if rule is not None else [],
            "allowedContainsFilters": sorted(rule.contains_filter_fields) if rule is not None else [],
            "allowedSortFields": sorted(rule.sort_fields) if rule is not None else [],
        },
    )


def build_graphql_query_plan(
    *,
    site_id: UUID,
    model_key: str,
    perspective: GraphQLPerspective,
    exact_filters: dict[str, str] | None = None,
    contains_filters: dict[str, str] | None = None,
    sort_field: str | None = None,
    sort_direction: GraphQLSortDirection = "asc",
    limit: int | None = None,
    offset: int = 0,
) -> GraphQLQueryPlan:
    normalized_exact_filters = dict(exact_filters or {})
    normalized_contains_filters = dict(contains_filters or {})
    _assert_query_fields_allowed(
        model_key=model_key,
        exact_filters=normalized_exact_filters,
        contains_filters=normalized_contains_filters,
        sort_field=sort_field,
    )
    return GraphQLQueryPlan(
        site_id=site_id,
        model_key=model_key,
        perspective=perspective,
        exact_filters=normalized_exact_filters,
        contains_filters=normalized_contains_filters,
        sort_field=sort_field,
        sort_direction=sort_direction,
        limit=limit,
        offset=offset,
    )
