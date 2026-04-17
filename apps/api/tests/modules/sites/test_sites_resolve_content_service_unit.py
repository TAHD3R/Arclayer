from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import pytest

from src.config import Settings
from src.core.exceptions import Conflict, NotFound
from src.core.exceptions.types import InternalServerError
from src.modules.sites.publishing.routes.resolve.content.service import (
    ContentPageRouteResolver,
    _extract_section_defaults,
    _extract_sections,
    _flatten_sections,
    _legacy_section_mapping,
    _localized_or_literal,
    _normalize_json_value,
    _resolve_json_path,
    _resolve_mapping_value,
    _summarize_depth_one,
)


class _FakeRepo:
    async def list_content_presentations(self, *, version_id):  # type: ignore[no-untyped-def]
        return []

    async def get_content_seo_profile(self, *, version_id):  # type: ignore[no-untyped-def]
        return None


def _resolver() -> Any:
    return ContentPageRouteResolver(
        Settings(),
        repo=_FakeRepo(),  # type: ignore[arg-type]
        includes=SimpleNamespace(resolve_content_refs=None),
    )


def test_resolve_json_path_reads_nested_dicts() -> None:
    assert _resolve_json_path({"article": {"title": "Hello"}}, ["article", "title"]) == "Hello"
    assert _resolve_json_path({"article": {"title": "Hello"}}, ["article", "slug"]) is None


def test_normalize_json_value_drops_none_from_nested_payloads() -> None:
    normalized = _normalize_json_value({
        "title": "Hello",
        "empty": None,
        "nested": {"summary": "World", "ignored": None},
        "items": ["x", None, {"count": 2, "skip": None}],
    })

    assert normalized == {
        "title": "Hello",
        "nested": {"summary": "World"},
        "items": ["x", {"count": 2}],
    }


def test_summarize_depth_one_keeps_only_scalar_leafs() -> None:
    summary = _summarize_depth_one({
        "title": "Hello",
        "nested": {"summary": "World", "count": 2, "deep": {"skip": True}},
        "list": [1, 2, 3],
    })

    assert summary == {
        "title": "Hello",
        "nested": {"summary": "World", "count": 2},
    }


def test_localized_or_literal_prefers_binding_literal_and_locale() -> None:
    assert _localized_or_literal({"kind": "binding", "path": ["title"]}) == {"kind": "binding", "path": ["title"]}
    assert _localized_or_literal({"kind": "literal", "value": "Hero"}) == "Hero"
    assert _localized_or_literal({"en-US": "English", "zh-CN": "中文"}) == "English"
    assert _localized_or_literal({"fr-FR": "Bonjour", "zh-CN": "中文"}) == "Bonjour"


def test_extract_section_defaults_supports_text_image_embed_and_props() -> None:
    assert _extract_section_defaults({"type": "text", "text": {"kind": "literal", "value": "Hero"}, "tag": "h1"}) == {
        "text": "Hero",
        "tag": "h1",
    }
    assert _extract_section_defaults({"type": "image", "src": {"en-US": "/hero.png"}, "alt": "Hero"}) == {
        "src": "/hero.png",
        "alt": "Hero",
    }
    assert _extract_section_defaults({"type": "embed", "url": {"kind": "literal", "value": "https://example.com"}}) == {
        "url": "https://example.com"
    }
    assert _extract_section_defaults({"type": "hero", "props": {"title": {"en-US": "Hello"}, "theme": "dark"}}) == {
        "title": "Hello",
        "theme": "dark",
    }


def test_extract_sections_supports_nodes_by_id_and_nodes_shapes() -> None:
    layout, sections = _extract_sections({
        "rootId": "root",
        "nodesById": {
            "root": {"layout": {"kind": "stack"}, "children": ["hero"]},
            "hero": {"id": "hero", "type": "hero", "props": {"title": "Hello"}},
        },
    })

    assert layout == {"kind": "stack"}
    assert sections == [{"id": "hero", "componentKey": "hero", "propsDefaults": {"title": "Hello"}}]

    layout, sections = _extract_sections({
        "root": "root",
        "nodes": {
            "root": {"layout": {"kind": "grid"}, "children": ["cta"]},
            "cta": {"type": "cta", "props": {"label": {"kind": "literal", "value": "Buy"}}},
        },
    })

    assert layout == {"kind": "grid"}
    assert sections == [{"id": "cta", "componentKey": "cta", "propsDefaults": {"label": "Buy"}}]

    layout, sections = _extract_sections({"rootId": "missing", "nodesById": {}})
    assert layout is None
    assert sections == []

    layout, sections = _extract_sections({"root": "missing", "nodes": {}})
    assert layout is None
    assert sections == []


def test_legacy_section_mapping_builds_context_path_mapping() -> None:
    mapping = _legacy_section_mapping(
        {
            "bindings": [
                {
                    "componentKey": "hero",
                    "bindingKey": "title",
                    "payload": {"field": "title"},
                },
                {
                    "componentKey": "hero",
                    "bindingKey": "slug",
                    "payload": {"field": "slug"},
                },
            ]
        },
        "hero",
    )

    assert mapping == {
        "title": {"kind": "context_path", "source": "primary", "path": ["title"]},
        "slug": {"kind": "context_path", "source": "primary", "path": ["slug"]},
    }


def test_resolve_mapping_value_supports_literal_primary_and_route_sources() -> None:
    primary = {"title": "Hello", "author": {"name": "Ada"}}
    route_params = {"slug": "hello-world"}

    assert (
        _resolve_mapping_value({"kind": "literal", "value": "Hero"}, primary=primary, route_params=route_params)
        == "Hero"
    )
    assert (
        _resolve_mapping_value(
            {"kind": "context_path", "source": "primary", "path": ["author", "name"]},
            primary=primary,
            route_params=route_params,
        )
        == "Ada"
    )
    assert (
        _resolve_mapping_value(
            {"kind": "context_path", "source": "route", "path": "slug"},
            primary=primary,
            route_params=route_params,
        )
        == "hello-world"
    )
    assert _resolve_mapping_value({"kind": "unknown"}, primary=primary, route_params=route_params) is None
    assert (
        _resolve_mapping_value(
            {"kind": "context_path", "source": "routeParams", "path": ["slug"]},
            primary=primary,
            route_params=route_params,
        )
        == "hello-world"
    )
    assert (
        _resolve_mapping_value(
            {"kind": "context_path", "source": "primary", "path": []}, primary=primary, route_params=route_params
        )
        is None
    )


def test_flatten_sections_applies_structured_mapping_and_defaults() -> None:
    layout, sections = _flatten_sections(
        raw_page_blueprint={
            "rootId": "root",
            "nodesById": {
                "root": {"layout": {"kind": "stack"}, "children": ["hero"]},
                "hero": {"id": "hero", "type": "hero", "props": {"eyebrow": "Docs"}},
            },
        },
        raw_slot_mapping={
            "sections": {
                "hero": {
                    "propsDefaults": {"theme": "dark"},
                    "propsMapping": {
                        "title": {"kind": "context_path", "source": "primary", "path": ["title"]},
                        "slug": {"kind": "context_path", "source": "route", "path": ["slug"]},
                    },
                }
            }
        },
        primary={"title": "Hello GraphQL"},
        route_params={"slug": "hello-graphql"},
    )

    assert layout == {"kind": "stack"}
    assert len(sections) == 1
    assert sections[0].props == {
        "eyebrow": "Docs",
        "theme": "dark",
        "title": "Hello GraphQL",
        "slug": "hello-graphql",
    }


def test_flatten_sections_raises_when_strict_binding_misses() -> None:
    with pytest.raises(Conflict) as exc:
        _flatten_sections(
            raw_page_blueprint={
                "rootId": "root",
                "nodesById": {
                    "root": {"layout": {"kind": "stack"}, "children": ["hero"]},
                    "hero": {"id": "hero", "type": "hero"},
                },
            },
            raw_slot_mapping={
                "sections": {
                    "hero": {
                        "propsMapping": {
                            "title": {"kind": "context_path", "source": "primary", "path": ["missing"]},
                        }
                    }
                }
            },
            primary={"title": "Hello"},
            route_params={},
            strict_bindings=True,
        )

    assert exc.value.error == "PAGE_BINDING_RESOLUTION_FAILED"


def test_flatten_sections_normalizes_layout_and_legacy_mapping() -> None:
    marker = object()
    layout, sections = _flatten_sections(
        raw_page_blueprint={
            "rootId": "root",
            "nodesById": {
                "root": {
                    "layout": {"columns": 2, "updatedAt": marker},
                    "children": ["hero"],
                },
                "hero": {"id": "hero", "type": "hero"},
            },
        },
        raw_slot_mapping={
            "bindings": [
                {
                    "componentKey": "hero",
                    "bindingKey": "title",
                    "payload": {"field": "title"},
                }
            ]
        },
        primary={"title": "Hello world"},
        route_params={},
    )

    assert layout == {"columns": 2, "updatedAt": str(marker)}
    assert sections[0].props == {"title": "Hello world"}


@pytest.mark.asyncio
async def test_resolve_primary_context_handles_page_fallback_release_and_errors() -> None:
    resolver = _resolver()
    page_item = SimpleNamespace(
        id=uuid4(),
        slug="landing",
        title="Landing",
        model_definition=SimpleNamespace(key="page"),
    )
    page_snapshot = SimpleNamespace(
        fields={"headline": "Hello", "seo": {"title": "SEO"}, "empty": {"nested": object()}}
    )

    result = await resolver._resolve_primary_context(
        site_id=uuid4(),
        page_item=page_item,
        page_snapshot=page_snapshot,  # type: ignore[arg-type]
        route_contract={},
        route_params={},
        mode="preview",
    )

    assert result is not None
    assert result.model_key == "page"
    assert result.data == {"headline": "Hello", "seo": {"title": "SEO"}}

    assert (
        await resolver._resolve_primary_context(
            site_id=uuid4(),
            page_item=page_item,
            page_snapshot=None,
            route_contract={},
            route_params={},
            mode="preview",
        )
        is None
    )

    release_candidate = SimpleNamespace(
        id=uuid4(),
        slug="candidate",
        title="Candidate",
        model_definition=SimpleNamespace(key="article"),
    )
    graph_node = SimpleNamespace(
        item=release_candidate,
        version=SimpleNamespace(id=uuid4(), version=4),
    )

    async def _list_active_release_nodes_by_model_key(*, site_id, model_key):  # type: ignore[no-untyped-def]
        return [graph_node]

    async def _load_snapshot_from_version(*, item, version, state):  # type: ignore[no-untyped-def]
        return (
            4,
            state,
            SimpleNamespace(fields={"slug": "hello-world", "title": "Release title", "category": {"name": "Docs"}}),
        )

    resolver._repo = SimpleNamespace(  # type: ignore[attr-defined]
        list_active_release_nodes_by_model_key=_list_active_release_nodes_by_model_key,
        list_content_entries_by_model_key=None,
    )
    resolver._load_snapshot_from_version = _load_snapshot_from_version  # type: ignore[method-assign]

    released = await resolver._resolve_primary_context(
        site_id=uuid4(),
        page_item=page_item,
        page_snapshot=None,
        route_contract={"primarySource": {"modelKey": "article", "fieldKey": "slug", "paramName": "slug"}},
        route_params={"slug": "hello-world"},
        mode="public",
        release_id=uuid4(),
    )

    assert released is not None
    assert released.slug == "hello-world"
    assert released.title == "Release title"
    assert released.data == {"slug": "hello-world", "title": "Release title", "category": {"name": "Docs"}}

    preview_candidate = SimpleNamespace(
        id=uuid4(),
        slug="preview-fallback",
        title="Preview fallback",
        model_definition=SimpleNamespace(key="article"),
        draft_version=1,
        published_version=1,
    )

    async def _list_content_entries_by_model_key(*, site_id, model_key):  # type: ignore[no-untyped-def]
        return [preview_candidate]

    async def _load_snapshot_for_state_preview(*, item, state):  # type: ignore[no-untyped-def]
        if state == "draft":
            return None
        return SimpleNamespace(fields={"slug": "preview-slug", "title": "Published title"})

    resolver._repo = SimpleNamespace(  # type: ignore[attr-defined]
        list_content_entries_by_model_key=_list_content_entries_by_model_key,
    )
    resolver._load_snapshot_for_state = _load_snapshot_for_state_preview  # type: ignore[method-assign]

    preview_result = await resolver._resolve_primary_context(
        site_id=uuid4(),
        page_item=page_item,
        page_snapshot=None,
        route_contract={"primarySource": {"modelKey": "article", "fieldKey": "slug", "paramName": "slug"}},
        route_params={"slug": "preview-slug"},
        mode="preview",
    )

    assert preview_result is not None
    assert preview_result.title == "Published title"

    hidden_candidate = SimpleNamespace(
        id=uuid4(),
        slug="hidden",
        title="Hidden",
        model_definition=SimpleNamespace(key="article"),
        draft_version=1,
        published_version=0,
    )

    async def _list_hidden_entries(*, site_id, model_key):  # type: ignore[no-untyped-def]
        return [hidden_candidate]

    async def _load_hidden_snapshot(*, item, state):  # type: ignore[no-untyped-def]
        return SimpleNamespace(fields={"slug": "unpublished-copy"})

    resolver._repo = SimpleNamespace(list_content_entries_by_model_key=_list_hidden_entries)  # type: ignore[attr-defined]
    resolver._load_snapshot_for_state = _load_hidden_snapshot  # type: ignore[method-assign]

    with pytest.raises(InternalServerError) as preview_exc:
        await resolver._resolve_primary_context(
            site_id=uuid4(),
            page_item=page_item,
            page_snapshot=None,
            route_contract={"primarySource": {"modelKey": "article", "fieldKey": "slug", "paramName": "slug"}},
            route_params={"slug": "hidden"},
            mode="preview",
        )
    assert preview_exc.value.error == "PAGE_PRIMARY_RECORD_PREVIEW_UNAVAILABLE"

    with pytest.raises(Conflict) as public_exc:
        await resolver._resolve_primary_context(
            site_id=uuid4(),
            page_item=page_item,
            page_snapshot=None,
            route_contract={"primarySource": {"modelKey": "article", "fieldKey": "slug", "paramName": "slug"}},
            route_params={"slug": "hidden"},
            mode="public",
        )
    assert public_exc.value.error == "PAGE_PRIMARY_RECORD_UNAVAILABLE"

    async def _list_empty_entries(*, site_id, model_key):  # type: ignore[no-untyped-def]
        return []

    resolver._repo = SimpleNamespace(list_content_entries_by_model_key=_list_empty_entries)  # type: ignore[attr-defined]
    with pytest.raises(NotFound) as not_found_exc:
        await resolver._resolve_primary_context(
            site_id=uuid4(),
            page_item=page_item,
            page_snapshot=None,
            route_contract={"primarySource": {"modelKey": "article", "fieldKey": "slug", "paramName": "slug"}},
            route_params={"slug": "missing"},
            mode="public",
        )
    assert not_found_exc.value.error == "PAGE_PRIMARY_RECORD_NOT_FOUND"
