from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID

import pytest

from scripts.export_graphql_schema import (
    DEFAULT_MANIFEST_PATH,
    DEFAULT_SCHEMA_PATH,
    build_manifest,
    render_graphql_schema,
)
from src.modules.sites.graphql.hooks import graphql_hooks_manifest
from src.modules.sites.graphql.registry import (
    GraphQLFieldDefinition,
    GraphQLModelSchemaDefinition,
    GraphQLQueryFilterDefinition,
    GraphQLQueryInputDefinition,
    GraphQLQuerySortDefinition,
    GraphQLSingleQueryDefinition,
    graphql_schema_registry_manifest,
    list_graphql_model_schemas,
)
from src.modules.sites.graphql.schema import (
    _build_entry_type,
    _build_filter_input_type,
    get_graphql_schema_sdl,
)
from src.modules.sites.graphql.schema import (
    schema as delivery_graphql_schema,
)
from src.modules.sites.graphql.service import StructuredContentRecord
from src.modules.sites.graphql.subscriptions import graphql_subscription_manifest


def _schema_definition(**overrides: Any) -> GraphQLModelSchemaDefinition:
    payload = {
        "model_key": "article",
        "entry_type": "ArticleEntry",
        "list_query_name": "articles",
        "single_query": GraphQLSingleQueryDefinition(
            query_name="articleBySlug",
            argument="slug",
            resolver="get_record_by_slug",
        ),
        "filter_input": GraphQLQueryInputDefinition(input_name="ArticleFilterInput", fields=("slug",)),
        "sort_input": GraphQLQueryInputDefinition(input_name="ArticleSortInput", fields=("TITLE",)),
        "filters": (GraphQLQueryFilterDefinition("slug", "slug", "exact"),),
        "sorts": (GraphQLQuerySortDefinition("TITLE", "title"),),
        "system_fields": (GraphQLFieldDefinition("title", "title", "String"),),
        "custom_fields_container": "customFields",
        "schema_field_provider": "official-protocol-system-fields",
        "query_post_processor": "official-protocol-query-contract",
        "sdk_data_type": "ArticleEntriesQueryData",
        "sdk_variables_type": "ArticleEntriesQueryVariables",
    }
    payload.update(overrides)
    return GraphQLModelSchemaDefinition(**payload)


def test_graphql_schema_registry_describes_builtin_model_query_contracts() -> None:
    schemas = {schema.model_key: schema for schema in list_graphql_model_schemas()}

    assert tuple(schemas) == ("article", "category", "page", "reusable-section")
    assert schemas["article"].entry_type == "ArticleEntry"
    assert schemas["article"].list_query_name == "articles"
    assert schemas["article"].single_query_name == "articleBySlug"
    assert schemas["article"].filter_input.fields == ("slug", "titleContains", "revisionState")
    assert schemas["article"].sort_input.fields == ("TITLE", "SLUG", "REVISION")
    assert [field.field_name for field in schemas["article"].system_fields] == [
        "title",
        "slug",
        "summary",
        "content",
        "publishedAt",
    ]
    assert schemas["page"].single_query_argument == "path"
    assert schemas["reusable-section"].single_query_argument == "alias"
    assert schemas["category"].sdk_variables_type == "CategoryEntriesQueryVariables"


def test_graphql_registry_manifest_is_sdk_and_artifact_friendly() -> None:
    manifest = graphql_schema_registry_manifest()
    model_entries = cast(list[dict[str, Any]], manifest["models"])
    models = {model["modelKey"]: model for model in model_entries}

    assert models["article"]["customFieldsContainer"] == "customFields"
    assert models["article"]["filterInput"] == {
        "fields": ["slug", "titleContains", "revisionState"],
        "name": "ArticleFilterInput",
    }
    assert models["page"]["sortInput"] == {"fields": ["TITLE", "PATH", "REVISION"], "name": "PageSortInput"}
    assert models["reusable-section"]["listQueryName"] == "reusableSections"


def test_graphql_schema_keeps_generated_query_argument_names_without_exec() -> None:
    schema_text = get_graphql_schema_sdl()

    assert "articleBySlug(slug: String!" in schema_text
    assert "pageEntryByPath(path: String!" in schema_text
    assert "reusableSectionByAlias(alias: String!" in schema_text


@pytest.mark.asyncio
async def test_graphql_single_query_runtime_uses_generated_argument_name_without_exec() -> None:
    captured: dict[str, object] = {}

    class FakeGraphQLService:
        async def resolve_query_access(self, **kwargs: object) -> str:
            return str(kwargs["perspective"])

        async def get_record_by_slug(self, **kwargs: object) -> StructuredContentRecord:
            captured.update(kwargs)
            slug = str(kwargs["slug"])
            return StructuredContentRecord(
                item_id=UUID("00000000-0000-0000-0000-000000000001"),
                model_key="article",
                locale="en-US",
                title="Runtime Article",
                slug=slug,
                revision=1,
                revision_state="published",
                draft_revision=1,
                published_revision=1,
                fields={"title": "Runtime Article", "slug": slug},
                custom_fields={},
            )

    result = await delivery_graphql_schema.execute(
        '{ articleBySlug(slug: "runtime-article") { id title slug customFields } }',
        context_value=SimpleNamespace(
            graphql=FakeGraphQLService(),
            runtime_id=UUID("00000000-0000-0000-0000-000000000002"),
            environment_id=None,
            request=SimpleNamespace(),
        ),
    )

    assert result.errors is None
    assert captured["slug"] == "runtime-article"
    assert captured["environment_id"] is None
    assert result.data == {
        "articleBySlug": {
            "id": "00000000-0000-0000-0000-000000000001",
            "title": "Runtime Article",
            "slug": "runtime-article",
            "customFields": {},
        }
    }


def test_graphql_schema_generation_rejects_invalid_entry_type_name() -> None:
    with pytest.raises(ValueError, match="Invalid GraphQL entry type name"):
        _build_entry_type(_schema_definition(entry_type="ArticleEntry; raise RuntimeError()"))


def test_graphql_schema_generation_rejects_invalid_filter_field_name() -> None:
    invalid_schema = _schema_definition(
        filters=(GraphQLQueryFilterDefinition("title;drop", "title", "exact"),),
    )

    with pytest.raises(ValueError, match="Invalid GraphQL filter field name"):
        _build_filter_input_type(invalid_schema)


def test_graphql_schema_generation_reflects_changed_model_fields() -> None:
    first_type = _build_entry_type(
        _schema_definition(
            entry_type="AuditEntryV1",
            system_fields=(GraphQLFieldDefinition("title", "title", "String"),),
        )
    )
    second_type = _build_entry_type(
        _schema_definition(
            entry_type="AuditEntryV2",
            system_fields=(
                GraphQLFieldDefinition("title", "title", "String"),
                GraphQLFieldDefinition("publishedAt", "published_at", "String"),
            ),
        )
    )

    assert first_type.__annotations__["title"] == str | None
    assert "published_at" not in first_type.__annotations__
    assert second_type.__annotations__["title"] == str | None
    assert second_type.__annotations__["published_at"] == str | None


def test_graphql_hooks_manifest_projects_protocol_contract_hooks() -> None:
    assert graphql_hooks_manifest() == {
        "queryPostProcessors": [
            {
                "description": "Applies the official model protocol query contract to delivery GraphQL records.",
                "modelKeys": ["article", "category", "page", "reusable-section"],
                "name": "official-protocol-query-contract",
                "phase": "query",
            }
        ],
        "schemaFieldProviders": [
            {
                "description": "Projects official model protocol system fields into the delivery GraphQL schema.",
                "modelKeys": ["article", "category", "page", "reusable-section"],
                "name": "official-protocol-system-fields",
                "phase": "schema",
            }
        ],
    }


def test_graphql_artifact_manifest_matches_live_registry_and_schema_snapshot() -> None:
    schema_text = render_graphql_schema()
    expected = build_manifest(schema_text=schema_text, schema_path=DEFAULT_SCHEMA_PATH)
    actual = json.loads(DEFAULT_MANIFEST_PATH.read_text(encoding="utf-8"))

    assert actual == expected
    assert Path(actual["schemaFile"]).name == DEFAULT_SCHEMA_PATH.name
    assert actual["hooks"] == graphql_hooks_manifest()
    assert actual["registry"] == graphql_schema_registry_manifest()
    assert actual["subscriptions"] == graphql_subscription_manifest()


def test_graphql_artifact_manifest_detects_stale_registry_metadata() -> None:
    schema_text = render_graphql_schema()
    expected = build_manifest(schema_text=schema_text, schema_path=DEFAULT_SCHEMA_PATH)
    stale = {**expected, "registry": {"models": []}}

    with pytest.raises(AssertionError):
        assert stale == expected
