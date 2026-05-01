from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi import Request
from fastapi import Response as FastAPIResponse

from src.core.api_generator.content_api import (
    ContentApiGeneratedController,
    ContentApiGeneratorDependencies,
    ContentApiListQuery,
    ContentApiRouteDefinition,
    ContentApiRoutePolicy,
    ContentApiVisibilityPolicy,
    build_filter_pair,
    create_generated_content_api_router,
)
from src.core.exceptions import BadRequest, NotFound


def _route_definition(model_key: str = "article") -> ContentApiRouteDefinition:
    return ContentApiRouteDefinition(
        model_key=model_key,
        list_path=f"/{model_key}",
        detail_path=f"/{model_key}/{{entry_id}}",
        exact_filter_fields=frozenset({"slug", "revision_state"}),
        contains_filter_fields=frozenset({"title"}),
        sort_fields=frozenset({"title", "revision"}),
        route_policy=ContentApiRoutePolicy(
            route_class="content_delivery_read",
            auth_policy="public_or_delivery_key",
        ),
        visibility_policy=ContentApiVisibilityPolicy(response_shape="delivery_safe_entry"),
        extension_points=("content-api-auth-policy", "content-api-response-shaper"),
    )


def _request() -> Request:
    return Request({"type": "http", "method": "GET", "path": "/", "headers": []})


class _FakeBinding:
    def __init__(self, records: list[SimpleNamespace]) -> None:
        self.records = records
        self.authorized: list[str] = []
        self.queries: list[dict[str, object]] = []

    async def authorize_read(self, **kwargs) -> None:  # type: ignore[no-untyped-def]
        self.authorized.append(kwargs["perspective"])

    async def list_records(self, **kwargs) -> list[SimpleNamespace]:  # type: ignore[no-untyped-def]
        self.queries.append(kwargs)
        return self.records

    def to_entry_response(self, record: SimpleNamespace) -> dict[str, object]:
        fields = {key: value for key, value in record.fields.items() if key != "internalNotes"}
        return {"id": record.item_id, "locale": record.locale, "fields": fields}

    def to_list_response(self, *, route, query, total, items):  # type: ignore[no-untyped-def]
        return {
            "items": items,
            "locale": query.locale,
            "modelKey": route.model_key,
            "total": total,
        }


def test_generated_router_registers_list_and_detail_routes_per_content_type() -> None:
    dependencies = ContentApiGeneratorDependencies(
        runtime_context=lambda: None,
        rate_limit=lambda: None,
        query_service=lambda: None,
        auth_service=lambda: None,
        site_service=lambda: None,
        list_response_model=dict,
        detail_response_model=dict,
    )

    router = create_generated_content_api_router(
        routes=(_route_definition("article"), _route_definition("reusable-section")),
        controller=ContentApiGeneratedController(_FakeBinding([])),
        dependencies=dependencies,
    )

    route_paths = {getattr(route, "path", None) for route in router.routes}
    assert "/runtimes/{runtime_id}/content/article" in route_paths
    assert "/runtimes/{runtime_id}/content/article/{entry_id}" in route_paths
    assert "/runtimes/{runtime_id}/content/reusable-section" in route_paths
    assert "/runtimes/{runtime_id}/content/reusable-section/{entry_id}" in route_paths


def test_build_filter_pair_validates_pairs_and_allowed_fields() -> None:
    assert build_filter_pair(field=" slug ", value=" hello ", allowed_fields=frozenset({"slug"})) == {"slug": "hello"}

    with pytest.raises(BadRequest) as missing_pair:
        build_filter_pair(field="slug", value=None, allowed_fields=frozenset({"slug"}))

    assert missing_pair.value.error == "CONTENT_API_FILTER_PAIR_REQUIRED"

    with pytest.raises(BadRequest) as forbidden_field:
        build_filter_pair(field="path", value="/pricing", allowed_fields=frozenset({"slug"}))

    assert forbidden_field.value.error == "CONTENT_API_FILTER_FIELD_FORBIDDEN"
    assert forbidden_field.value.meta == {"field": "path", "allowedFields": ["slug"]}


@pytest.mark.asyncio
async def test_generated_controller_paginates_locale_filters_and_shapes_visible_fields() -> None:
    binding = _FakeBinding([
        SimpleNamespace(
            item_id=UUID("00000000-0000-0000-0000-000000000001"),
            locale="en-US",
            fields={"title": "Visible", "internalNotes": "Hidden"},
        ),
        SimpleNamespace(
            item_id=UUID("00000000-0000-0000-0000-000000000002"),
            locale="zh-CN",
            fields={"title": "Filtered"},
        ),
    ])
    response = FastAPIResponse()

    result = await ContentApiGeneratedController(binding).list_entries(
        request=_request(),
        raw_response=response,
        runtime_context=SimpleNamespace(),
        query_service=SimpleNamespace(),
        auth_service=SimpleNamespace(),
        site_service=SimpleNamespace(),
        route=_route_definition(),
        query=ContentApiListQuery(
            perspective="published",
            preview_token=None,
            environment=None,
            environment_id=None,
            locale="en-US",
            exact_filters={"slug": "visible"},
            contains_filters={"title": "vis"},
            sort_field="title",
            sort_direction="asc",
            limit=20,
            offset=0,
        ),
    )

    assert response.headers["cache-control"] == "public, max-age=60, stale-while-revalidate=300"
    assert result.data == {
        "items": [
            {
                "fields": {"title": "Visible"},
                "id": UUID("00000000-0000-0000-0000-000000000001"),
                "locale": "en-US",
            }
        ],
        "locale": "en-US",
        "modelKey": "article",
        "total": 1,
    }
    assert binding.authorized == ["published"]
    assert binding.queries[0]["model_key"] == "article"


@pytest.mark.asyncio
async def test_generated_controller_detail_raises_not_found_for_missing_entry() -> None:
    response = FastAPIResponse()

    with pytest.raises(NotFound) as exc:
        await ContentApiGeneratedController(_FakeBinding([])).get_entry(
            request=_request(),
            raw_response=response,
            runtime_context=SimpleNamespace(),
            query_service=SimpleNamespace(),
            auth_service=SimpleNamespace(),
            site_service=SimpleNamespace(),
            route=_route_definition(),
            entry_id=UUID("00000000-0000-0000-0000-000000000001"),
            perspective="preview",
            preview_token="preview",
            environment=None,
            environment_id=None,
            locale=None,
        )

    assert response.headers["cache-control"] == "no-store"
    assert exc.value.error == "CONTENT_ENTRY_NOT_FOUND"
