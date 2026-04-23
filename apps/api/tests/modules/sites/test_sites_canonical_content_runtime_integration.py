from __future__ import annotations

import pytest

from src.common.utils.public_ids import decode_public_id
from src.models.content.content_item import ContentItemRecord
from tests.modules.workspaces.content.test_content_items_integration import (
    _bootstrap_shape_payload,
    _create_article_model,
    _create_page_model,
    _workspace_client,
)

pytestmark = pytest.mark.integration


async def _runtime_id(client, project_id: str) -> str:
    project_res = await client.get(f"/api/v1/projects/{project_id}")
    assert project_res.status_code == 200, project_res.text
    return project_res.json()["data"]["primaryRuntime"]["id"]


def _page_item_payload(title: str) -> dict:
    return {
        "modelKey": "page",
        "title": title,
        "locale": "en-US",
    }


def _article_item_payload(slug: str, title: str) -> dict:
    return {
        "modelKey": "article",
        "title": title,
        "locale": "en-US",
    }


def _page_draft_payload(*, title: str, path: str) -> dict:
    return {
        "expectedVersion": 0,
        "changeSummary": f"{title} draft",
        "fieldsSnapshot": {"title": title, "path": path},
        "presentations": [
            {"kind": "form_data", "payload": {"title": title, "path": path}},
            {
                "kind": "visual_blueprint",
                "payload": {
                    "root": "page_root",
                    "nodes": {
                        "page_root": {
                            "type": "stack",
                            "layout": {"direction": "column"},
                            "children": ["hero"],
                        },
                        "hero": {
                            "type": "hero_banner",
                            "props": {"headline": "fallback"},
                        },
                    },
                },
            },
            {
                "kind": "slot_mapping",
                "payload": {
                    "version": 1,
                    "sections": {
                        "hero": {
                            "propsDefaults": {"tone": "default"},
                            "props": {
                                "headline": {
                                    "kind": "context_path",
                                    "source": "primary",
                                    "path": ["title"],
                                },
                                "slug": {
                                    "kind": "context_path",
                                    "source": "routeParams",
                                    "path": ["slug"],
                                },
                                "eyebrow": {"kind": "literal", "value": "From template"},
                            },
                        }
                    },
                },
            },
            {
                "kind": "seo",
                "payload": {
                    "metaTitle": f"{title} | Arclayer",
                    "metaDescription": f"{title} description",
                },
            },
        ],
    }


def _page_dependency_draft_payload(*, title: str, path: str, ref_entry_id: str) -> dict:
    return {
        "expectedVersion": 0,
        "changeSummary": f"{title} draft",
        "fieldsSnapshot": {"title": title, "path": path},
        "presentations": [
            {"kind": "form_data", "payload": {"title": title, "path": path}},
            {
                "kind": "visual_blueprint",
                "payload": {
                    "version": 1,
                    "rootId": "page",
                    "nodesById": {
                        "page": {
                            "id": "page",
                            "type": "page_root",
                            "children": ["dependency_ref"],
                            "layout": {"children": {"mode": "absolute"}},
                        },
                        "dependency_ref": {
                            "id": "dependency_ref",
                            "type": "content_ref",
                            "refEntryId": ref_entry_id,
                            "refState": "auto",
                        },
                    },
                },
            },
            {
                "kind": "slot_mapping",
                "payload": {
                    "version": 1,
                    "sections": {},
                },
            },
            {
                "kind": "seo",
                "payload": {
                    "metaTitle": f"{title} | Arclayer",
                    "metaDescription": f"{title} dependency page",
                },
            },
        ],
    }


def _article_draft_payload(*, expected_version: int, title: str, slug: str) -> dict:
    return {
        "expectedVersion": expected_version,
        "changeSummary": f"{title} draft",
        "fieldsSnapshot": {
            "title": title,
            "slug": slug,
            "summary": f"{title} summary",
            "body": f"{title} body",
        },
        "presentations": [
            {
                "kind": "form_data",
                "payload": {
                    "title": title,
                    "slug": slug,
                    "summary": f"{title} summary",
                    "body": f"{title} body",
                },
            },
            {"kind": "rich_text_document", "payload": {"type": "doc", "content": []}},
            {
                "kind": "seo",
                "payload": {
                    "metaTitle": f"{title} | Arclayer",
                    "metaDescription": f"{title} summary",
                },
            },
        ],
    }


async def _create_page_item(client, project_id: str, *, title: str) -> str:
    item_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items",
        json=_page_item_payload(title),
    )
    assert item_res.status_code == 201, item_res.text
    item_id = item_res.json()["data"]["id"]
    shape_res = await client.patch(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/bootstrap-shape",
        json=_bootstrap_shape_payload(
            preset_key="page",
            capability_pack_ids=["publishable", "routable", "treeable"],
        ),
    )
    assert shape_res.status_code == 200, shape_res.text
    return item_id


async def _create_article_item(client, project_id: str, *, slug: str, title: str) -> str:
    item_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items",
        json=_article_item_payload(slug, title),
    )
    assert item_res.status_code == 201, item_res.text
    return item_res.json()["data"]["id"]


async def _publish_page_item(client, project_id: str, *, item_id: str, title: str, path: str) -> None:
    draft_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
        json=_page_draft_payload(title=title, path=path),
    )
    assert draft_res.status_code == 201, draft_res.text
    workflow_res = await client.patch(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/workflow",
        json={"stage": "approved", "summary": f"{title} approved for publish"},
    )
    assert workflow_res.status_code == 200, workflow_res.text
    publish_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/1/publish",
        json={},
    )
    assert publish_res.status_code == 200, publish_res.text


async def _publish_dependency_page_item(
    client,
    project_id: str,
    *,
    item_id: str,
    title: str,
    path: str,
    ref_entry_id: str,
) -> None:
    draft_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
        json=_page_dependency_draft_payload(title=title, path=path, ref_entry_id=ref_entry_id),
    )
    assert draft_res.status_code == 201, draft_res.text
    workflow_res = await client.patch(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/workflow",
        json={"stage": "approved", "summary": f"{title} approved for publish"},
    )
    assert workflow_res.status_code == 200, workflow_res.text
    publish_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/1/publish",
        json={},
    )
    assert publish_res.status_code == 200, publish_res.text


async def _save_article_draft(
    client,
    project_id: str,
    *,
    item_id: str,
    expected_version: int,
    title: str,
    slug: str,
) -> None:
    draft_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
        json=_article_draft_payload(expected_version=expected_version, title=title, slug=slug),
    )
    assert draft_res.status_code == 201, draft_res.text


async def _publish_article_version(client, project_id: str, *, item_id: str, version: int) -> None:
    workflow_res = await client.patch(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/workflow",
        json={"stage": "approved", "summary": f"Version {version} approved for publish"},
    )
    assert workflow_res.status_code == 200, workflow_res.text
    publish_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/{version}/publish",
        json={},
    )
    assert publish_res.status_code == 200, publish_res.text


async def _upsert_route_binding(
    client,
    project_id: str,
    *,
    item_id: str,
    path: str,
    route_mode: str | None = None,
    primary_source: dict | None = None,
) -> None:
    payload: dict[str, object] = {
        "locale": "en-US",
        "path": path,
        "isActive": True,
    }
    if route_mode is not None:
        payload["routeMode"] = route_mode
    if primary_source is not None:
        payload["primarySource"] = primary_source
    route_res = await client.put(
        f"/api/v1/projects/{project_id}/content/routing/bindings/{item_id}",
        json=payload,
    )
    assert route_res.status_code == 200, route_res.text


@pytest.mark.asyncio
async def test_sites_route_resolve_prefers_static_route_and_flattens_dynamic_delivery(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_page_model(client, workspace_id)
        await _create_article_model(client, workspace_id)

        template_item_id = await _create_page_item(client, project_id, title="Blog Template")
        static_item_id = await _create_page_item(client, project_id, title="New Landing")
        article_item_id = await _create_article_item(client, project_id, slug="world", title="Entry world v1")

        await _publish_page_item(
            client,
            project_id,
            item_id=template_item_id,
            title="Blog Template",
            path="/blog/:slug",
        )
        await _publish_page_item(
            client,
            project_id,
            item_id=static_item_id,
            title="New Landing",
            path="/blog/new",
        )
        await _save_article_draft(
            client,
            project_id,
            item_id=article_item_id,
            expected_version=0,
            title="Entry world v1",
            slug="world",
        )
        await _publish_article_version(client, project_id, item_id=article_item_id, version=1)

        await _upsert_route_binding(
            client,
            project_id,
            item_id=template_item_id,
            path="/blog/:slug",
            route_mode="dynamic",
            primary_source={
                "modelKey": "article",
                "fieldKey": "slug",
                "paramName": "slug",
            },
        )
        await _upsert_route_binding(client, project_id, item_id=static_item_id, path="/blog/new")

        site_res = await client.get(f"/api/v1/projects/{project_id}/site")
        assert site_res.status_code == 200, site_res.text
        site_id = site_res.json()["data"]["siteId"]
        runtime_id = await _runtime_id(client, project_id)

        token_res = await client.post(f"/api/v1/sites/{site_id}/preview-tokens", json={"ttlSeconds": 600})
        assert token_res.status_code == 201, token_res.text
        preview_token = token_res.json()["data"]["token"]

        await _save_article_draft(
            client,
            project_id,
            item_id=article_item_id,
            expected_version=1,
            title="Entry world v2 (draft)",
            slug="world",
        )

        public_res = await client.get(
            f"/api/v1/runtimes/{runtime_id}/routes/resolve",
            params={"path": "/blog/world", "mode": "public"},
        )
        assert public_res.status_code == 200, public_res.text
        public_payload = public_res.json()["data"]
        assert public_payload["match"]["kind"] == "page"
        assert public_payload["match"]["pageId"] == template_item_id
        assert public_payload["match"]["params"] == {"slug": "world"}
        assert public_payload["context"]["primary"]["id"] == article_item_id
        assert public_payload["context"]["primary"]["title"] == "Entry world v1"
        assert public_payload["document"]["path"] == "/blog/world"
        assert public_payload["document"]["sections"] == [
            {
                "id": "hero",
                "componentKey": "hero_banner",
                "props": {
                    "headline": "Entry world v1",
                    "tone": "default",
                    "slug": "world",
                    "eyebrow": "From template",
                },
            }
        ]

        preview_res = await client.get(
            f"/api/v1/runtimes/{runtime_id}/routes/resolve",
            params={"path": "/blog/world", "mode": "preview", "token": preview_token},
        )
        assert preview_res.status_code == 200, preview_res.text
        preview_payload = preview_res.json()["data"]
        assert preview_payload["context"]["primary"]["title"] == "Entry world v2 (draft)"
        assert preview_payload["document"]["sections"][0]["props"]["headline"] == "Entry world v2 (draft)"

        static_res = await client.get(
            f"/api/v1/runtimes/{runtime_id}/routes/resolve",
            params={"path": "/blog/new", "mode": "public"},
        )
        assert static_res.status_code == 200, static_res.text
        static_payload = static_res.json()["data"]
        assert static_payload["match"]["pageId"] == static_item_id
        assert static_payload["document"]["sections"][0]["props"]["headline"] == "New Landing"


@pytest.mark.asyncio
async def test_sites_route_resolve_returns_primary_record_unavailable_for_public_dynamic_route(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_page_model(client, workspace_id)
        await _create_article_model(client, workspace_id)

        template_item_id = await _create_page_item(client, project_id, title="Draft Only Template")
        article_item_id = await _create_article_item(client, project_id, slug="world", title="Draft only world")

        await _publish_page_item(
            client,
            project_id,
            item_id=template_item_id,
            title="Draft Only Template",
            path="/draft-only/:slug",
        )
        await _save_article_draft(
            client,
            project_id,
            item_id=article_item_id,
            expected_version=0,
            title="Draft only world",
            slug="world",
        )
        await _upsert_route_binding(
            client,
            project_id,
            item_id=template_item_id,
            path="/draft-only/:slug",
            route_mode="dynamic",
            primary_source={
                "modelKey": "article",
                "fieldKey": "slug",
                "paramName": "slug",
            },
        )

        site_res = await client.get(f"/api/v1/projects/{project_id}/site")
        assert site_res.status_code == 200, site_res.text
        site_id = site_res.json()["data"]["siteId"]
        runtime_id = await _runtime_id(client, project_id)

        token_res = await client.post(f"/api/v1/sites/{site_id}/preview-tokens", json={"ttlSeconds": 600})
        assert token_res.status_code == 201, token_res.text
        preview_token = token_res.json()["data"]["token"]

        public_res = await client.get(
            f"/api/v1/runtimes/{runtime_id}/routes/resolve",
            params={"path": "/draft-only/world", "mode": "public"},
        )
        assert public_res.status_code == 409, public_res.text
        assert public_res.json()["error"] == "PAGE_PRIMARY_RECORD_UNAVAILABLE"

        preview_res = await client.get(
            f"/api/v1/runtimes/{runtime_id}/routes/resolve",
            params={"path": "/draft-only/world", "mode": "preview", "token": preview_token},
        )
        assert preview_res.status_code == 200, preview_res.text
        preview_payload = preview_res.json()["data"]
        assert preview_payload["context"]["primary"]["id"] == article_item_id
        assert preview_payload["context"]["primary"]["title"] == "Draft only world"
        assert preview_payload["match"]["revisionState"] == "draft"


@pytest.mark.asyncio
async def test_sites_route_resolve_enforces_dependency_availability_and_preview_diagnostics(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_page_model(client, workspace_id)
        await _create_article_model(client, workspace_id)

        public_page_id = await _create_page_item(client, project_id, title="Public Dependency Page")
        fallback_page_id = await _create_page_item(client, project_id, title="Preview Fallback Dependency Page")
        missing_page_id = await _create_page_item(client, project_id, title="Preview Missing Dependency Page")

        draft_only_dependency_id = await _create_article_item(client, project_id, slug="draft-dep", title="Draft Dep")
        fallback_dependency_id = await _create_article_item(
            client,
            project_id,
            slug="fallback-dep",
            title="Fallback Dep v1",
        )
        missing_dependency_id = await _create_article_item(
            client,
            project_id,
            slug="missing-dep",
            title="Missing Dep",
        )

        await _save_article_draft(
            client,
            project_id,
            item_id=draft_only_dependency_id,
            expected_version=0,
            title="Draft Dep",
            slug="draft-dep",
        )
        await _save_article_draft(
            client,
            project_id,
            item_id=fallback_dependency_id,
            expected_version=0,
            title="Fallback Dep v1",
            slug="fallback-dep",
        )
        await _publish_article_version(client, project_id, item_id=fallback_dependency_id, version=1)

        fallback_dependency_uuid = decode_public_id(fallback_dependency_id)
        fallback_dependency = await ContentItemRecord.get(id=fallback_dependency_uuid)
        fallback_dependency.draft_version = 0
        await fallback_dependency.save(update_fields=["draft_version"])

        await _publish_dependency_page_item(
            client,
            project_id,
            item_id=public_page_id,
            title="Public Dependency Page",
            path="/dependency-public",
            ref_entry_id=draft_only_dependency_id,
        )
        await _publish_dependency_page_item(
            client,
            project_id,
            item_id=fallback_page_id,
            title="Preview Fallback Dependency Page",
            path="/dependency-fallback",
            ref_entry_id=fallback_dependency_id,
        )
        await _publish_dependency_page_item(
            client,
            project_id,
            item_id=missing_page_id,
            title="Preview Missing Dependency Page",
            path="/dependency-missing",
            ref_entry_id=missing_dependency_id,
        )

        await _upsert_route_binding(client, project_id, item_id=public_page_id, path="/dependency-public")
        await _upsert_route_binding(client, project_id, item_id=fallback_page_id, path="/dependency-fallback")
        await _upsert_route_binding(client, project_id, item_id=missing_page_id, path="/dependency-missing")

        site_res = await client.get(f"/api/v1/projects/{project_id}/site")
        assert site_res.status_code == 200, site_res.text
        site_id = site_res.json()["data"]["siteId"]
        runtime_id = await _runtime_id(client, project_id)

        token_res = await client.post(f"/api/v1/sites/{site_id}/preview-tokens", json={"ttlSeconds": 600})
        assert token_res.status_code == 201, token_res.text
        preview_token = token_res.json()["data"]["token"]

        public_res = await client.get(
            f"/api/v1/runtimes/{runtime_id}/routes/resolve",
            params={"path": "/dependency-public", "mode": "public"},
        )
        assert public_res.status_code == 409, public_res.text
        assert public_res.json()["error"] == "PAGE_DEPENDENCY_UNAVAILABLE"

        fallback_res = await client.get(
            f"/api/v1/runtimes/{runtime_id}/routes/resolve",
            params={"path": "/dependency-fallback", "mode": "preview", "token": preview_token},
        )
        assert fallback_res.status_code == 200, fallback_res.text
        fallback_payload = fallback_res.json()["data"]
        assert fallback_payload["warnings"] == [
            {
                "code": "DEPENDENCY_FALLBACK_PUBLISHED",
                "message": f"preview fallback to published dependency {fallback_dependency_id}",
                "refEntryId": fallback_dependency_id,
                "refNodeId": "dependency_ref",
            }
        ]

        missing_res = await client.get(
            f"/api/v1/runtimes/{runtime_id}/routes/resolve",
            params={"path": "/dependency-missing", "mode": "preview", "token": preview_token},
        )
        assert missing_res.status_code == 500, missing_res.text
        assert missing_res.json()["error"] == "PAGE_PREVIEW_DEPENDENCY_UNAVAILABLE"
