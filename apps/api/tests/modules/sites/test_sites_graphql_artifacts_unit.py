from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

import pytest

from scripts.export_graphql_schema import (
    DEFAULT_MANIFEST_PATH,
    DEFAULT_SCHEMA_PATH,
    build_manifest,
    render_graphql_schema,
)
from src.modules.sites.graphql.hooks import graphql_hooks_manifest
from src.modules.sites.graphql.registry import graphql_schema_registry_manifest, list_graphql_model_schemas
from src.modules.sites.graphql.subscriptions import graphql_subscription_manifest


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
