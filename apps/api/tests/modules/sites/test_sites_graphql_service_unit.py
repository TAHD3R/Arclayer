from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from uuid import UUID, uuid4

import pytest

from src.core.exceptions import APIError, BadRequest, Forbidden, ServiceUnavailable
from src.models.projects.api_key import ApiKeyFamily, DeliveryKeyPerspective
from src.modules.projects.content.runtime import (
    DocumentQuery,
    DocumentQueryBoundary,
    DocumentQueryRecord,
    DocumentRuntimeMetadata,
)
from src.modules.sites.graphql.planner import (
    GraphQLQueryPlan,
    GraphQLQueryRule,
    _assert_query_fields_allowed,
    build_graphql_query_plan,
    list_graphql_query_rules,
)
from src.modules.sites.graphql.service import (
    AuthenticatedDeliveryKey,
    SiteGraphQLService,
    StructuredContentRecord,
    _build_custom_fields,
    _delivery_omitted_field_keys,
    _extract_system_field,
    _field_aliases,
    _filter_delivery_fields,
    _normalize_json_value,
    _normalized_contains,
    _normalized_string,
    _record_matches_all,
    _record_sort_value,
    _record_text_field,
    graphql_error_extensions,
)

REPO_ROOT = Path(__file__).resolve().parents[5]
RUNTIME_REPOSITORY = REPO_ROOT / "apps/api/src/modules/sites/runtime/repository.py"


def _article_record(**overrides) -> StructuredContentRecord:
    payload = {
        "item_id": UUID("00000000-0000-0000-0000-000000000001"),
        "model_key": "article",
        "locale": "en-US",
        "title": "Hello GraphQL",
        "slug": "hello-graphql",
        "revision": 3,
        "revision_state": "draft",
        "draft_revision": 3,
        "published_revision": 2,
        "fields": {
            "title": "Hello GraphQL",
            "slug": "hello-graphql",
            "body": {"ops": [{"insert": "Body"}]},
            "summary": "Summary",
            "rating": 9,
        },
        "custom_fields": {"rating": 9},
        "route_path": "/hello-graphql",
        "route_contract": None,
    }
    payload.update(overrides)
    return StructuredContentRecord(**payload)


def test_field_aliases_uses_article_body_alias() -> None:
    assert _field_aliases("article", "content") == ("content", "body")
    assert _field_aliases("page", "content") == ("content",)


def test_extract_system_field_reads_article_body_alias() -> None:
    value = _extract_system_field(
        model_key="article",
        fields={"body": {"ops": [{"insert": "Hello"}]}},
        field_key="content",
    )

    assert value == {"ops": [{"insert": "Hello"}]}


def test_build_custom_fields_excludes_official_system_fields() -> None:
    custom_fields = _build_custom_fields(
        model_key="article",
        fields={
            "title": "Hello GraphQL",
            "slug": "hello-graphql",
            "body": {"ops": [{"insert": "Body"}]},
            "summary": "Summary",
            "rating": 9,
        },
    )

    assert custom_fields == {"rating": 9}


def test_build_custom_fields_keeps_all_fields_for_unknown_model() -> None:
    custom_fields = _build_custom_fields(model_key="unknown-model", fields={"title": "Raw", "count": 2})

    assert custom_fields == {"title": "Raw", "count": 2}


def test_delivery_omitted_field_keys_reads_model_field_config() -> None:
    item = SimpleNamespace(
        model_definition=SimpleNamespace(
            fields=[
                SimpleNamespace(key="publicTitle", config={}),
                SimpleNamespace(key="internalNotes", config={"omitFromApiResponse": True}),
                SimpleNamespace(key="editorOnly", config={"hiddenInEditor": True}),
            ]
        )
    )

    assert _delivery_omitted_field_keys(item) == {"internalNotes"}


def test_build_query_record_omits_delivery_hidden_fields() -> None:
    service = _service()
    item = SimpleNamespace(
        id=UUID("00000000-0000-0000-0000-000000000001"),
        model_definition=SimpleNamespace(
            fields=[
                SimpleNamespace(key="title", config={}),
                SimpleNamespace(key="secret", config={"omitFromApiResponse": True}),
            ]
        ),
    )
    snapshot = SimpleNamespace(fields={"title": "Public", "secret": "Private"})

    record = service._build_query_record(
        item=item,
        revision=1,
        revision_state="published",
        snapshot=snapshot,
        metadata=DocumentRuntimeMetadata(),
    )

    assert record.fields == {"title": "Public"}


def test_filter_delivery_fields_excludes_omitted_fields_before_custom_field_projection() -> None:
    item = SimpleNamespace(
        model_definition=SimpleNamespace(
            fields=[
                SimpleNamespace(key="title", config={}),
                SimpleNamespace(key="rating", config={}),
                SimpleNamespace(key="internalScore", config={"omitFromApiResponse": True}),
            ]
        )
    )

    filtered = _filter_delivery_fields(
        item=item,
        fields={
            "title": "Public title",
            "rating": 9,
            "internalScore": 100,
        },
    )

    assert filtered == {"title": "Public title", "rating": 9}
    assert _build_custom_fields(model_key="article", fields=filtered) == {"rating": 9}


def test_runtime_repository_queries_content_models_by_singular_key() -> None:
    source = RUNTIME_REPOSITORY.read_text()

    assert "model_definition__singular_key=model_key" in source
    assert "model_definition__key=model_key" not in source


def test_record_sort_value_uses_stable_revision_tie_breaker() -> None:
    record = _article_record()

    assert _record_sort_value(record, "revision") == (0, 3, "00000000-0000-0000-0000-000000000001")
    assert _record_sort_value(record, "title") == (0, "hello graphql", "00000000-0000-0000-0000-000000000001")


def test_record_matches_all_supports_exact_and_contains_filters() -> None:
    record = _article_record()

    assert _record_matches_all(
        record,
        exact_filters={"slug": "HELLO-GRAPHQL", "revision_state": "draft"},
        contains_filters={"title": "graphql"},
    )
    assert not _record_matches_all(record, exact_filters={"slug": "missing"}, contains_filters={})
    assert not _record_matches_all(record, exact_filters={}, contains_filters={"title": "absent"})


def test_query_rules_cover_builtin_graphql_models() -> None:
    assert list_graphql_query_rules() == {
        "article": GraphQLQueryRule(
            exact_filter_fields=frozenset({"slug", "revision_state"}),
            contains_filter_fields=frozenset({"title"}),
            sort_fields=frozenset({"title", "slug", "revision"}),
        ),
        "page": GraphQLQueryRule(
            exact_filter_fields=frozenset({"path", "revision_state"}),
            contains_filter_fields=frozenset({"title"}),
            sort_fields=frozenset({"title", "path", "revision"}),
        ),
        "reusable-section": GraphQLQueryRule(
            exact_filter_fields=frozenset({"section_key", "revision_state"}),
            contains_filter_fields=frozenset({"title"}),
            sort_fields=frozenset({"title", "section_key", "revision"}),
        ),
        "category": GraphQLQueryRule(
            exact_filter_fields=frozenset({"slug", "revision_state"}),
            contains_filter_fields=frozenset({"name"}),
            sort_fields=frozenset({"name", "slug", "revision"}),
        ),
    }


def test_build_graphql_query_plan_normalizes_and_bounds_query_inputs() -> None:
    plan = build_graphql_query_plan(
        site_id=UUID("00000000-0000-0000-0000-000000000111"),
        model_key="article",
        perspective="preview",
        exact_filters={"slug": "hello-graphql"},
        contains_filters={"title": "graphql"},
        sort_field="revision",
        sort_direction="desc",
        limit=-2,
        offset=-5,
    )

    assert plan == GraphQLQueryPlan(
        site_id=UUID("00000000-0000-0000-0000-000000000111"),
        model_key="article",
        perspective="preview",
        exact_filters={"slug": "hello-graphql"},
        contains_filters={"title": "graphql"},
        sort_field="revision",
        sort_direction="desc",
        limit=-2,
        offset=-5,
    )
    assert plan.bounded_limit == 0
    assert plan.bounded_offset == 0


@pytest.mark.asyncio
async def test_list_records_uses_query_plan_for_filter_sort_and_pagination() -> None:
    service = _service()
    runtime_id = UUID("00000000-0000-0000-0000-000000000222")
    site_id = UUID("00000000-0000-0000-0000-000000000111")
    service._document_runtime_boundary = SimpleNamespace(
        build_query_boundary=lambda records: SimpleNamespace(execute=lambda query: SimpleNamespace(records=records))
    )
    records = [
        DocumentQueryRecord(
            item=SimpleNamespace(id=UUID("00000000-0000-0000-0000-000000000002")),
            revision=2,
            revision_state="published",
            fields={"title": "Zulu", "slug": "zulu"},
            metadata=DocumentRuntimeMetadata(),
        ),
        DocumentQueryRecord(
            item=SimpleNamespace(id=UUID("00000000-0000-0000-0000-000000000001")),
            revision=1,
            revision_state="published",
            fields={"title": "Alpha", "slug": "alpha"},
            metadata=DocumentRuntimeMetadata(),
        ),
    ]

    async def _resolve_site_id(*, runtime_id):  # type: ignore[no-untyped-def]
        assert runtime_id == UUID("00000000-0000-0000-0000-000000000222")
        return site_id

    async def _list_plan_records(plan):  # type: ignore[no-untyped-def]
        assert plan == GraphQLQueryPlan(
            site_id=site_id,
            model_key="article",
            perspective="published",
            exact_filters={"revision_state": "published"},
            contains_filters={"title": "a"},
            sort_field="title",
            sort_direction="asc",
            limit=1,
            offset=0,
        )
        return records

    service._resolve_site_id = _resolve_site_id  # type: ignore[method-assign]
    service._list_plan_records = _list_plan_records  # type: ignore[method-assign]
    service._to_structured_record = lambda record: StructuredContentRecord(  # type: ignore[method-assign]
        item_id=record.item.id,
        model_key="article",
        locale="en-US",
        title=record.fields.get("title"),
        slug=record.fields.get("slug"),
        revision=record.revision,
        revision_state=record.revision_state,
        draft_revision=record.revision,
        published_revision=record.revision,
        fields=dict(record.fields),
        custom_fields={},
    )

    result = await service.list_records(
        runtime_id=runtime_id,
        model_key="article",
        perspective="published",
        exact_filters={"revision_state": "published"},
        contains_filters={"title": "a"},
        sort_field="title",
        sort_direction="asc",
        limit=1,
        offset=0,
    )

    assert [record.title for record in result] == ["Alpha"]


@pytest.mark.asyncio
async def test_list_records_runs_graphql_query_post_processors(monkeypatch: pytest.MonkeyPatch) -> None:
    service = _service()
    runtime_id = UUID("00000000-0000-0000-0000-000000000222")
    site_id = UUID("00000000-0000-0000-0000-000000000111")
    service._document_runtime_boundary = SimpleNamespace(
        build_query_boundary=lambda records: SimpleNamespace(execute=lambda query: SimpleNamespace(records=records))
    )
    records = [
        DocumentQueryRecord(
            item=SimpleNamespace(id=UUID("00000000-0000-0000-0000-000000000002")),
            revision=2,
            revision_state="published",
            fields={"title": "Zulu", "slug": "zulu"},
            metadata=DocumentRuntimeMetadata(),
        ),
        DocumentQueryRecord(
            item=SimpleNamespace(id=UUID("00000000-0000-0000-0000-000000000001")),
            revision=1,
            revision_state="published",
            fields={"title": "Alpha", "slug": "alpha"},
            metadata=DocumentRuntimeMetadata(),
        ),
    ]

    async def _list_plan_records(plan):  # type: ignore[no-untyped-def]
        return records

    async def _resolve_site_id(*, runtime_id):  # type: ignore[no-untyped-def]
        assert runtime_id == UUID("00000000-0000-0000-0000-000000000222")
        return site_id

    service._resolve_site_id = _resolve_site_id  # type: ignore[method-assign]
    service._list_plan_records = _list_plan_records  # type: ignore[method-assign]
    service._to_structured_record = lambda record: StructuredContentRecord(  # type: ignore[method-assign]
        item_id=record.item.id,
        model_key="article",
        locale="en-US",
        title=record.fields.get("title"),
        slug=record.fields.get("slug"),
        revision=record.revision,
        revision_state=record.revision_state,
        draft_revision=record.revision,
        published_revision=record.revision,
        fields=dict(record.fields),
        custom_fields={},
    )

    observed: list[tuple[str, list[str]]] = []

    def _apply_graphql_query_post_processors(*, plan, records):  # type: ignore[no-untyped-def]
        observed.append((plan.model_key, [record.title for record in records]))
        return list(reversed(records))

    monkeypatch.setattr(
        "src.modules.sites.graphql.service.apply_graphql_query_post_processors",
        _apply_graphql_query_post_processors,
    )

    result = await service.list_records(
        runtime_id=runtime_id,
        model_key="article",
        perspective="published",
    )

    assert observed == [("article", ["Zulu", "Alpha"])]
    assert [record.title for record in result] == ["Alpha", "Zulu"]


def test_assert_query_fields_allowed_accepts_article_contract() -> None:
    _assert_query_fields_allowed(
        model_key="article",
        exact_filters={"slug": "hello-graphql", "revision_state": "published"},
        contains_filters={"title": "hello"},
        sort_field="revision",
    )


def test_assert_query_fields_allowed_rejects_unknown_filter_and_sort_fields() -> None:
    with pytest.raises(BadRequest) as exc:
        _assert_query_fields_allowed(
            model_key="article",
            exact_filters={"path": "/pricing"},
            contains_filters={"name": "hello"},
            sort_field="path",
        )

    assert exc.value.error == "GRAPHQL_QUERY_FIELD_FORBIDDEN"
    assert exc.value.meta == {
        "modelKey": "article",
        "invalidExactFilters": ["path"],
        "invalidContainsFilters": ["name"],
        "invalidSortField": "path",
        "allowedExactFilters": ["revision_state", "slug"],
        "allowedContainsFilters": ["title"],
        "allowedSortFields": ["revision", "slug", "title"],
    }


def test_document_query_boundary_filters_by_model_status_and_route_metadata() -> None:
    article_item = SimpleNamespace(
        id=UUID("00000000-0000-0000-0000-000000000010"),
        site_id=UUID("00000000-0000-0000-0000-000000000111"),
        model_definition=SimpleNamespace(singular_key="article"),
    )
    page_item = SimpleNamespace(
        id=UUID("00000000-0000-0000-0000-000000000020"),
        site_id=UUID("00000000-0000-0000-0000-000000000111"),
        model_definition=SimpleNamespace(singular_key="page"),
    )
    boundary = DocumentQueryBoundary(
        records=[
            DocumentQueryRecord(
                item=article_item,
                revision=3,
                revision_state="draft",
                fields={"title": "Article"},
                metadata=DocumentRuntimeMetadata(protocol_key="article", route_path="/article"),
            ),
            DocumentQueryRecord(
                item=page_item,
                revision=5,
                revision_state="published",
                fields={"title": "Page"},
                metadata=DocumentRuntimeMetadata(protocol_key="page", route_path="/pricing"),
            ),
        ]
    )

    result = boundary.execute(
        DocumentQuery(
            site_id=UUID("00000000-0000-0000-0000-000000000111"),
            model_key="page",
            perspective="published",
            protocol_key="page",
            status="published",
            route_path="/pricing",
        )
    )

    assert len(result.records) == 1
    assert result.records[0].item.id == page_item.id


def test_graphql_error_extensions_normalize_details_and_meta() -> None:
    exc = APIError(
        "boom",
        status_code=409,
        error="CONFLICTED",
        details={"publishedAt": None, "count": 2},
        meta={"tags": ["graphql", 2]},
    )

    assert graphql_error_extensions(exc) == {
        "code": "CONFLICTED",
        "statusCode": 409,
        "details": {"publishedAt": None, "count": 2},
        "meta": {"tags": ["graphql", 2]},
    }


def _request(*, headers: dict[str, str] | None = None) -> Any:
    return SimpleNamespace(headers=headers or {}, state=SimpleNamespace())


def _api_key_record(**overrides) -> SimpleNamespace:
    payload = {
        "id": uuid4(),
        "site_id": uuid4(),
        "token_hash": "token-hash",
        "scopes": ["graphql.read"],
        "delivery_perspective": DeliveryKeyPerspective.PUBLISHED,
        "revoked_at": None,
        "expires_at": None,
    }
    payload.update(overrides)
    return SimpleNamespace(**payload)


def _service() -> Any:
    service = object.__new__(SiteGraphQLService)
    service._settings = SimpleNamespace(security=SimpleNamespace(master_key_path="/tmp/master.key"))
    service._repo = SimpleNamespace()
    service._content_service = SimpleNamespace(
        delivery_resolve_page=None,
        delivery_get_page_by_id=None,
        delivery_get_section_by_alias=None,
        delivery_get_global_set=None,
    )
    service._site_service = SimpleNamespace(assert_preview_access_async=None)
    service._api_keys_repo = SimpleNamespace(get_key_by_public_id=None, update_key=None)
    return service


@pytest.mark.asyncio
async def test_resolve_query_access_public_published_logs_without_key() -> None:
    service = _service()
    request = _request()
    runtime_id = uuid4()
    site_id = uuid4()
    logged: list[tuple[str, str | None]] = []

    async def _authenticate_delivery_key(*, request, site_id):  # type: ignore[no-untyped-def]
        return None

    def _log_query_access(**kwargs):  # type: ignore[no-untyped-def]
        logged.append((kwargs["perspective"], kwargs.get("preview_token")))

    async def _resolve_site_id(*, runtime_id: UUID):
        return site_id

    service._resolve_site_id = _resolve_site_id  # type: ignore[method-assign]
    service._authenticate_delivery_key = _authenticate_delivery_key  # type: ignore[method-assign]
    service._log_query_access = _log_query_access  # type: ignore[method-assign]

    await service.resolve_query_access(
        runtime_id=runtime_id, request=request, perspective="published", preview_token=None
    )

    assert logged == [("published", None)]


@pytest.mark.asyncio
async def test_resolve_query_access_preview_uses_preview_token_flow() -> None:
    service = _service()
    request = _request()
    runtime_id = uuid4()
    site_id = uuid4()
    preview_calls: list[tuple[object, str, str | None]] = []
    logged: list[tuple[str, str | None]] = []

    async def _authenticate_delivery_key(*, request, site_id):  # type: ignore[no-untyped-def]
        return None

    async def _assert_preview_access_async(*, site_id, mode, token):  # type: ignore[no-untyped-def]
        preview_calls.append((site_id, mode, token))

    def _log_query_access(**kwargs):  # type: ignore[no-untyped-def]
        logged.append((kwargs["perspective"], kwargs["preview_token"]))

    async def _resolve_site_id(*, runtime_id: UUID):
        return site_id

    service._resolve_site_id = _resolve_site_id  # type: ignore[method-assign]
    service._authenticate_delivery_key = _authenticate_delivery_key  # type: ignore[method-assign]
    service._site_service = SimpleNamespace(assert_preview_access_async=_assert_preview_access_async)
    service._log_query_access = _log_query_access  # type: ignore[method-assign]

    await service.resolve_query_access(
        runtime_id=runtime_id,
        request=request,
        perspective="preview",
        preview_token="preview-token",
    )

    assert preview_calls == [(site_id, "preview", "preview-token")]
    assert logged == [("preview", "preview-token")]


@pytest.mark.asyncio
async def test_resolve_query_access_rejects_wrong_scope_for_published_key() -> None:
    service = _service()
    request = _request()
    runtime_id = uuid4()
    site_id = uuid4()
    api_key = AuthenticatedDeliveryKey(
        record=_api_key_record(delivery_perspective=DeliveryKeyPerspective.PUBLISHED),
        granted_actions=frozenset(),
        graphql_read=False,
    )

    async def _authenticate_delivery_key(*, request, site_id):  # type: ignore[no-untyped-def]
        return api_key

    async def _resolve_site_id(*, runtime_id: UUID):
        return site_id

    service._resolve_site_id = _resolve_site_id  # type: ignore[method-assign]
    service._authenticate_delivery_key = _authenticate_delivery_key  # type: ignore[method-assign]

    with pytest.raises(Forbidden) as exc:
        await service.resolve_query_access(
            runtime_id=runtime_id,
            request=request,
            perspective="published",
            preview_token=None,
        )

    assert exc.value.error == "GRAPHQL_SCOPE_REQUIRED"


@pytest.mark.asyncio
async def test_resolve_query_access_rejects_wrong_perspective_for_preview_key() -> None:
    service = _service()
    request = _request()
    runtime_id = uuid4()
    site_id = uuid4()
    api_key = AuthenticatedDeliveryKey(
        record=_api_key_record(delivery_perspective=DeliveryKeyPerspective.PUBLISHED),
        granted_actions=frozenset({"project:delivery:graphql:read"}),
        graphql_read=True,
    )

    async def _authenticate_delivery_key(*, request, site_id):  # type: ignore[no-untyped-def]
        return api_key

    async def _resolve_site_id(*, runtime_id: UUID):
        return site_id

    service._resolve_site_id = _resolve_site_id  # type: ignore[method-assign]
    service._authenticate_delivery_key = _authenticate_delivery_key  # type: ignore[method-assign]

    with pytest.raises(Forbidden) as exc:
        await service.resolve_query_access(
            runtime_id=runtime_id,
            request=request,
            perspective="preview",
            preview_token=None,
        )

    assert exc.value.error == "DELIVERY_KEY_PERSPECTIVE_FORBIDDEN"


@pytest.mark.asyncio
async def test_delivery_record_lookup_helpers_and_snapshot_edges() -> None:
    service = _service()
    runtime_id = uuid4()
    article = _article_record(slug="hello")
    page = _article_record(model_key="page", slug="page", route_path="/pricing", fields={"path": "/pricing"})
    section = _article_record(
        model_key="reusable-section",
        fields={"section_key": "header-main", "title": "Header"},
        slug="header",
    )

    async def _list_records(*, runtime_id, model_key, perspective, **kwargs):  # type: ignore[no-untyped-def]
        if model_key == "article":
            return [article]
        if model_key == "page":
            return [page]
        if model_key == "reusable-section":
            return [section]
        return []

    service.list_records = _list_records  # type: ignore[method-assign]

    assert (
        await service.get_record_by_slug(runtime_id=runtime_id, model_key="article", slug="  ", perspective="preview")
        is None
    )
    assert (
        await service.get_record_by_slug(
            runtime_id=runtime_id,
            model_key="article",
            slug="hello",
            perspective="preview",
        )
        == article
    )
    assert await service.get_page_record_by_path(runtime_id=runtime_id, path=" ", perspective="preview") is None
    assert await service.get_page_record_by_path(runtime_id=runtime_id, path="/pricing", perspective="preview") == page
    assert (
        await service.get_reusable_section_record_by_alias(
            runtime_id=runtime_id,
            alias="header-main",
            perspective="preview",
        )
        == section
    )
    assert (
        await service.get_reusable_section_record_by_alias(
            runtime_id=runtime_id,
            alias=" ",
            perspective="preview",
        )
        is None
    )


@pytest.mark.asyncio
async def test_load_preview_snapshot_and_build_structured_record_edges() -> None:
    service = _service()
    item = SimpleNamespace(id=uuid4(), draft_version=0, published_version=0, title="Item", slug="item", locale="en-US")

    assert await service._load_preview_snapshot(item) is None

    version = SimpleNamespace(id=uuid4(), version=2)
    item = SimpleNamespace(
        id=uuid4(),
        draft_version=0,
        published_version=2,
        title="Fallback title",
        slug="fallback-slug",
        locale="en-US",
        model_definition=SimpleNamespace(
            singular_key="article",
            fields=[
                SimpleNamespace(key="body", config={}),
                SimpleNamespace(key="rating", config={}),
                SimpleNamespace(key="internalScore", config={"omitFromApiResponse": True}),
            ],
        ),
    )

    async def _get_content_revision_by_number(*, entry_id, revision):  # type: ignore[no-untyped-def]
        return version if revision == 2 else None

    async def _build_snapshot(*, item, version):  # type: ignore[no-untyped-def]
        return SimpleNamespace(fields={"body": {"ops": [{"insert": "Body"}]}, "rating": 9, "internalScore": 100})

    service._repo = SimpleNamespace(get_content_revision_by_number=_get_content_revision_by_number)
    service._build_snapshot = _build_snapshot  # type: ignore[method-assign]

    snapshot_meta = await service._load_preview_snapshot(item)
    assert snapshot_meta is not None
    revision, state, snapshot = snapshot_meta
    assert (revision, state) == (2, "published")

    query_record = service._build_query_record(
        item=item,
        revision=revision,
        revision_state=state,
        snapshot=snapshot,
        metadata=DocumentRuntimeMetadata(
            route_path="/article/fallback-slug",
            route_contract={"kind": "static"},
            protocol_key="article",
        ),
    )
    record = service._to_structured_record(query_record)

    assert record.title == "Fallback title"
    assert record.slug == "fallback-slug"
    assert record.custom_fields == {"rating": 9}
    assert "internalScore" not in record.fields


@pytest.mark.asyncio
async def test_authenticate_delivery_key_handles_cache_and_error_contracts(monkeypatch: pytest.MonkeyPatch) -> None:
    service = _service()
    site_id = uuid4()
    record = _api_key_record(
        site_id=site_id, scopes=["graphql.read"], delivery_perspective=DeliveryKeyPerspective.PREVIEW
    )
    updates: list[tuple[object, dict[str, object]]] = []

    async def _get_key_by_public_id(*, token_public_id):  # type: ignore[no-untyped-def]
        return record

    async def _update_key(current, *, fields):  # type: ignore[no-untyped-def]
        updates.append((current, fields))

    service._api_keys_repo = SimpleNamespace(
        get_key_by_public_id=_get_key_by_public_id,
        update_key=_update_key,
    )
    service._load_api_key_pepper = lambda: b"pepper"  # type: ignore[assignment]

    monkeypatch.setattr(
        "src.modules.sites.graphql.service.split_api_key_token",
        lambda token: (ApiKeyFamily.DELIVERY, "pub_123", "secret"),
    )
    monkeypatch.setattr("src.modules.sites.graphql.service.verify_api_key_token", lambda **kwargs: True)

    request = _request(headers={"x-api-key": "dlv_pub_123_secret"})
    authenticated = await service._authenticate_delivery_key(request=request, site_id=site_id)

    assert authenticated is not None
    assert authenticated.graphql_read is True
    assert request.state.graphql_delivery_key_checked is True
    assert updates and "last_used_at" in updates[0][1]
    assert await service._authenticate_delivery_key(request=request, site_id=site_id) == authenticated

    wrong_family_request = _request(headers={"x-api-key": "bad"})
    monkeypatch.setattr(
        "src.modules.sites.graphql.service.split_api_key_token",
        lambda token: (ApiKeyFamily.WORKSPACE_SERVICE, "pub_123", "secret"),
    )
    with pytest.raises(Forbidden) as exc:
        await service._authenticate_delivery_key(request=wrong_family_request, site_id=site_id)
    assert exc.value.error == "API_KEY_FAMILY_FORBIDDEN"

    expired_request = _request(headers={"x-api-key": "expired"})
    expired_record = _api_key_record(
        site_id=site_id,
        expires_at=datetime.now(tz=UTC) - timedelta(minutes=1),
    )

    async def _get_expired_key(*, token_public_id):  # type: ignore[no-untyped-def]
        return expired_record

    service._api_keys_repo = SimpleNamespace(get_key_by_public_id=_get_expired_key, update_key=_update_key)
    monkeypatch.setattr(
        "src.modules.sites.graphql.service.split_api_key_token",
        lambda token: (ApiKeyFamily.DELIVERY, "pub_123", "secret"),
    )
    with pytest.raises(Forbidden) as expired_exc:
        await service._authenticate_delivery_key(request=expired_request, site_id=site_id)
    assert expired_exc.value.error == "API_KEY_EXPIRED"


def test_extract_api_key_token_and_pepper_error_contracts(monkeypatch: pytest.MonkeyPatch) -> None:
    service = _service()

    assert service._extract_api_key_token(_request()) is None
    assert service._extract_api_key_token(_request(headers={"authorization": "Bearer token-1"})) == "token-1"
    assert (
        service._extract_api_key_token(_request(headers={"x-api-key": "token-1", "authorization": "Bearer token-1"}))
        == "token-1"
    )

    with pytest.raises(Forbidden) as exc:
        service._extract_api_key_token(_request(headers={"x-api-key": "token-1", "authorization": "Bearer token-2"}))
    assert exc.value.error == "API_KEY_CONFLICT"

    monkeypatch.setattr("src.modules.sites.graphql.service.master_key_exists", lambda path: False)
    with pytest.raises(ServiceUnavailable) as missing_exc:
        service._load_api_key_pepper()
    assert missing_exc.value.error == "MASTER_KEY_MISSING"

    monkeypatch.setattr("src.modules.sites.graphql.service.master_key_exists", lambda path: True)
    monkeypatch.setattr(
        "src.modules.sites.graphql.service.ensure_master_key", lambda path: (_ for _ in ()).throw(ValueError("bad"))
    )
    with pytest.raises(ServiceUnavailable) as invalid_exc:
        service._load_api_key_pepper()
    assert invalid_exc.value.error == "MASTER_KEY_INVALID"

    monkeypatch.setattr(
        "src.modules.sites.graphql.service.ensure_master_key", lambda path: (_ for _ in ()).throw(OSError("io"))
    )
    with pytest.raises(ServiceUnavailable) as hashing_exc:
        service._load_api_key_pepper()
    assert hashing_exc.value.error == "API_KEY_HASHING_UNAVAILABLE"


def test_low_level_normalizers_cover_datetime_and_string_fallbacks() -> None:
    timestamp = datetime(2026, 4, 18, 12, 0, tzinfo=UTC)

    assert _normalize_json_value({"createdAt": timestamp}) == {"createdAt": "2026-04-18T12:00:00+00:00"}
    assert _normalized_string("  hello  ") == "hello"
    assert _normalized_string(42) == "42"
    assert _normalized_contains("  GraphQL  ") == "graphql"
    assert _record_text_field(_article_record(fields={"name": "Hero"}), "name") == "Hero"
