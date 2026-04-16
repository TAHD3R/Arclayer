from __future__ import annotations

import pytest

from tests.modules.workspaces.content.test_content_items_integration import (
    _bootstrap_shape_payload,
    _create_article_model,
    _create_page_model,
    _workspace_client,
)

pytestmark = pytest.mark.integration


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


async def _create_page_item(client, workspace_id: str, *, title: str) -> str:
    item_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/items",
        json=_page_item_payload(title),
    )
    assert item_res.status_code == 201, item_res.text
    item_id = item_res.json()["data"]["id"]
    shape_res = await client.patch(
        f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/bootstrap-shape",
        json=_bootstrap_shape_payload(
            preset_key="page",
            capability_pack_ids=["publishable", "routable", "treeable"],
        ),
    )
    assert shape_res.status_code == 200, shape_res.text
    return item_id


async def _create_article_item(client, workspace_id: str, *, slug: str, title: str) -> str:
    item_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/items",
        json=_article_item_payload(slug, title),
    )
    assert item_res.status_code == 201, item_res.text
    return item_res.json()["data"]["id"]


async def _publish_page_item(client, workspace_id: str, *, item_id: str, title: str, path: str) -> None:
    draft_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/draft",
        json=_page_draft_payload(title=title, path=path),
    )
    assert draft_res.status_code == 201, draft_res.text
    publish_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/publish",
        json={},
    )
    assert publish_res.status_code == 200, publish_res.text


async def _save_article_draft(
    client,
    workspace_id: str,
    *,
    item_id: str,
    expected_version: int,
    title: str,
    slug: str,
) -> None:
    draft_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/draft",
        json=_article_draft_payload(expected_version=expected_version, title=title, slug=slug),
    )
    assert draft_res.status_code == 201, draft_res.text


async def _publish_article_version(client, workspace_id: str, *, item_id: str, version: int) -> None:
    publish_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/{version}/publish",
        json={},
    )
    assert publish_res.status_code == 200, publish_res.text


@pytest.mark.asyncio
async def test_sites_route_resolve_prefers_static_route_and_flattens_dynamic_delivery(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        await _create_page_model(client, workspace_id)
        await _create_article_model(client, workspace_id)

        template_item_id = await _create_page_item(client, workspace_id, title="Blog Template")
        static_item_id = await _create_page_item(client, workspace_id, title="New Landing")
        article_item_id = await _create_article_item(client, workspace_id, slug="world", title="Entry world v1")

        await _publish_page_item(
            client,
            workspace_id,
            item_id=template_item_id,
            title="Blog Template",
            path="/blog/:slug",
        )
        await _publish_page_item(
            client,
            workspace_id,
            item_id=static_item_id,
            title="New Landing",
            path="/blog/new",
        )
        await _save_article_draft(
            client,
            workspace_id,
            item_id=article_item_id,
            expected_version=0,
            title="Entry world v1",
            slug="world",
        )
        await _publish_article_version(client, workspace_id, item_id=article_item_id, version=1)

        dynamic_route_res = await client.put(
            f"/api/v1/workspaces/{workspace_id}/content/routing/bindings/{template_item_id}",
            json={
                "locale": "en-US",
                "path": "/blog/:slug",
                "routeMode": "dynamic",
                "primarySource": {
                    "modelKey": "article",
                    "fieldKey": "slug",
                    "paramName": "slug",
                },
                "isActive": True,
            },
        )
        assert dynamic_route_res.status_code == 200, dynamic_route_res.text

        static_route_res = await client.put(
            f"/api/v1/workspaces/{workspace_id}/content/routing/bindings/{static_item_id}",
            json={"locale": "en-US", "path": "/blog/new", "isActive": True},
        )
        assert static_route_res.status_code == 200, static_route_res.text

        site_res = await client.get(f"/api/v1/workspaces/{workspace_id}/site")
        assert site_res.status_code == 200, site_res.text
        site_id = site_res.json()["data"]["siteId"]

        token_res = await client.post(f"/api/v1/sites/{site_id}/preview-tokens", json={"ttlSeconds": 600})
        assert token_res.status_code == 201, token_res.text
        preview_token = token_res.json()["data"]["token"]

        await _save_article_draft(
            client,
            workspace_id,
            item_id=article_item_id,
            expected_version=1,
            title="Entry world v2 (draft)",
            slug="world",
        )

        public_res = await client.get(
            f"/api/v1/sites/{site_id}/routes/resolve",
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
            f"/api/v1/sites/{site_id}/routes/resolve",
            params={"path": "/blog/world", "mode": "preview", "token": preview_token},
        )
        assert preview_res.status_code == 200, preview_res.text
        preview_payload = preview_res.json()["data"]
        assert preview_payload["context"]["primary"]["title"] == "Entry world v2 (draft)"
        assert preview_payload["document"]["sections"][0]["props"]["headline"] == "Entry world v2 (draft)"

        static_res = await client.get(
            f"/api/v1/sites/{site_id}/routes/resolve",
            params={"path": "/blog/new", "mode": "public"},
        )
        assert static_res.status_code == 200, static_res.text
        static_payload = static_res.json()["data"]
        assert static_payload["match"]["pageId"] == static_item_id
        assert static_payload["document"]["sections"][0]["props"]["headline"] == "New Landing"
