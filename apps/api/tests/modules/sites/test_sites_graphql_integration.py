from __future__ import annotations

import pytest

from src.config import get_settings
from src.settings.crypto import ensure_master_key
from tests.modules.sites.test_sites_canonical_content_runtime_integration import (
    _create_page_item,
    _publish_article_version,
    _upsert_route_binding,
    _workspace_client,
)
from tests.modules.sites.test_sites_delivery_integration import _publish_release
from tests.modules.workspaces.content.test_content_items_integration import (
    _create_content_model,
    _create_page_model,
)

pytestmark = pytest.mark.integration


def _article_draft_payload(*, expected_version: int, title: str, slug: str, rating: int) -> dict:
    return {
        "expectedVersion": expected_version,
        "changeSummary": f"{title} draft",
        "fieldsSnapshot": {
            "title": title,
            "slug": slug,
            "summary": f"{title} summary",
            "content": f"{title} body",
            "rating": rating,
        },
        "presentations": [
            {
                "kind": "form_data",
                "payload": {
                    "title": title,
                    "slug": slug,
                    "summary": f"{title} summary",
                    "content": f"{title} body",
                    "rating": rating,
                },
            },
            {"kind": "rich_text_document", "payload": {"type": "doc", "content": []}},
        ],
    }


def _page_template_draft_payload(*, title: str, path: str) -> dict:
    return {
        "expectedVersion": 0,
        "changeSummary": f"{title} draft",
        "fieldsSnapshot": {"title": title, "path": path},
        "presentations": [
            {"kind": "form_data", "payload": {"title": title, "path": path}},
            {
                "kind": "visual_blueprint",
                "payload": {
                    "rootId": "page_root",
                    "nodesById": {
                        "page_root": {
                            "id": "page_root",
                            "type": "page_root",
                            "children": ["hero"],
                            "layout": {"children": {"mode": "auto", "direction": "column"}},
                        },
                        "hero": {
                            "id": "hero",
                            "type": "hero_banner",
                            "props": {},
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
                            "props": {
                                "headline": {
                                    "kind": "context_path",
                                    "source": "primary",
                                    "path": ["title"],
                                },
                                "rating": {
                                    "kind": "context_path",
                                    "source": "primary",
                                    "path": ["rating"],
                                },
                            },
                        }
                    },
                },
            },
        ],
    }


async def _create_article_item(client, workspace_id: str, *, title: str) -> str:
    item_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/items",
        json={"modelKey": "article", "title": title, "locale": "en-US"},
    )
    assert item_res.status_code == 201, item_res.text
    return item_res.json()["data"]["id"]


async def _publish_page_template(client, workspace_id: str, *, item_id: str, title: str, path: str) -> None:
    draft_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/draft",
        json=_page_template_draft_payload(title=title, path=path),
    )
    assert draft_res.status_code == 201, draft_res.text
    publish_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/publish",
        json={},
    )
    assert publish_res.status_code == 200, publish_res.text


async def _site_id_and_preview_token(client, workspace_id: str) -> tuple[str, str]:
    site_res = await client.get(f"/api/v1/workspaces/{workspace_id}/site")
    assert site_res.status_code == 200, site_res.text
    site_id = site_res.json()["data"]["siteId"]
    token_res = await client.post(f"/api/v1/sites/{site_id}/preview-tokens", json={"ttlSeconds": 600})
    assert token_res.status_code == 201, token_res.text
    return site_id, token_res.json()["data"]["token"]


async def _graphql(client, site_id: str, *, query: str, variables: dict | None = None, headers: dict | None = None):
    return await client.post(
        f"/api/v1/sites/{site_id}/graphql",
        json={"query": query, "variables": variables or {}},
        headers=headers or {},
    )


@pytest.mark.asyncio
async def test_sites_graphql_queries_follow_published_preview_and_custom_fields(
    monkeypatch,
    tmp_path,
    prepared_db,
    integration_valkey_settings,
) -> None:
    monkeypatch.setenv("SECURITY__MASTER_KEY_PATH", str(tmp_path / "master.key"))
    get_settings.cache_clear()
    ensure_master_key(get_settings().security.master_key_path)

    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        await _create_page_model(client, workspace_id)
        await _create_content_model(
            client,
            workspace_id,
            key="article",
            name="Article",
            category="content_library",
            fields=[{"key": "rating", "label": "Rating", "scalar": "number", "required": False}],
            capabilities=["publishable", "rich_text_editable"],
            defaultRole="article",
            defaultPosture="structured",
            defaultSurface="writing",
        )

        page_item_id = await _create_page_item(client, workspace_id, title="Article Template")
        article_item_id = await _create_article_item(client, workspace_id, title="World v1")

        await _publish_page_template(
            client, workspace_id, item_id=page_item_id, title="Article Template", path="/blog/:slug"
        )
        patch_v1_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{article_item_id}/versions/draft",
            json=_article_draft_payload(expected_version=0, title="World v1", slug="world", rating=5),
        )
        assert patch_v1_res.status_code == 201, patch_v1_res.text
        await _publish_article_version(client, workspace_id, item_id=article_item_id, version=1)

        await _upsert_route_binding(
            client,
            workspace_id,
            item_id=page_item_id,
            path="/blog/:slug",
            route_mode="dynamic",
            primary_source={"modelKey": "article", "fieldKey": "slug", "paramName": "slug"},
        )
        await _publish_release(client, workspace_id)

        site_id, preview_token = await _site_id_and_preview_token(client, workspace_id)
        preview_key_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/api-keys",
            json={
                "family": "delivery",
                "name": "Preview GraphQL",
                "scopes": ["graphql.read"],
                "deliveryPerspective": "preview",
            },
        )
        assert preview_key_res.status_code == 200, preview_key_res.text
        preview_key = preview_key_res.json()["data"]["secretToken"]

        preview_draft_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{article_item_id}/versions/draft",
            json=_article_draft_payload(expected_version=1, title="World v2 draft", slug="world", rating=9),
        )
        assert preview_draft_res.status_code == 201, preview_draft_res.text

        query = """
        query ReadContent($path: String!, $slug: String!, $perspective: DeliveryPerspective!, $previewToken: String) {
          resolvePage(path: $path, perspective: $perspective, previewToken: $previewToken) {
            context {
              primary {
                title
              }
            }
            document {
              sections {
                componentKey
                props
              }
            }
          }
          articleBySlug(slug: $slug, perspective: $perspective, previewToken: $previewToken) {
            title
            slug
            content
            customFields
            revisionState
          }
        }
        """

        published_res = await _graphql(
            client,
            site_id,
            query=query,
            variables={"path": "/blog/world", "slug": "world", "perspective": "PUBLISHED"},
        )
        assert published_res.status_code == 200, published_res.text
        published_payload = published_res.json()
        assert "errors" not in published_payload, published_payload
        assert published_payload["data"]["resolvePage"]["context"]["primary"]["title"] == "World v1"
        assert published_payload["data"]["resolvePage"]["document"]["sections"][0]["props"]["headline"] == "World v1"
        assert published_payload["data"]["resolvePage"]["document"]["sections"][0]["props"]["rating"] == 5
        assert published_payload["data"]["articleBySlug"]["title"] == "World v1"
        assert published_payload["data"]["articleBySlug"]["content"] == "World v1 body"
        assert published_payload["data"]["articleBySlug"]["customFields"]["rating"] == 5
        assert published_payload["data"]["articleBySlug"]["revisionState"] == "published"

        preview_res = await _graphql(
            client,
            site_id,
            query=query,
            variables={
                "path": "/blog/world",
                "slug": "world",
                "perspective": "PREVIEW",
                "previewToken": preview_token,
            },
        )
        assert preview_res.status_code == 200, preview_res.text
        preview_payload = preview_res.json()
        assert "errors" not in preview_payload, preview_payload
        assert preview_payload["data"]["resolvePage"]["context"]["primary"]["title"] == "World v2 draft"
        assert preview_payload["data"]["resolvePage"]["document"]["sections"][0]["props"]["rating"] == 9
        assert preview_payload["data"]["articleBySlug"]["title"] == "World v2 draft"
        assert preview_payload["data"]["articleBySlug"]["customFields"]["rating"] == 9
        assert preview_payload["data"]["articleBySlug"]["revisionState"] == "draft"

        preview_key_res = await _graphql(
            client,
            site_id,
            query=query,
            variables={"path": "/blog/world", "slug": "world", "perspective": "PREVIEW"},
            headers={"X-API-Key": preview_key},
        )
        assert preview_key_res.status_code == 200, preview_key_res.text
        preview_key_payload = preview_key_res.json()
        assert "errors" not in preview_key_payload, preview_key_payload
        assert preview_key_payload["data"]["articleBySlug"]["title"] == "World v2 draft"

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_sites_graphql_rejects_delivery_keys_without_graphql_scope(
    monkeypatch,
    tmp_path,
    prepared_db,
    integration_valkey_settings,
) -> None:
    monkeypatch.setenv("SECURITY__MASTER_KEY_PATH", str(tmp_path / "master.key"))
    get_settings.cache_clear()
    ensure_master_key(get_settings().security.master_key_path)

    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        await _create_page_model(client, workspace_id)
        page_item_id = await _create_page_item(client, workspace_id, title="Landing")
        await _publish_page_template(client, workspace_id, item_id=page_item_id, title="Landing", path="/landing")
        await _upsert_route_binding(client, workspace_id, item_id=page_item_id, path="/landing")
        await _publish_release(client, workspace_id)

        site_id, _preview_token = await _site_id_and_preview_token(client, workspace_id)
        published_key_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/api-keys",
            json={
                "family": "delivery",
                "name": "Published Runtime",
                "scopes": ["delivery.read"],
                "deliveryPerspective": "published",
            },
        )
        assert published_key_res.status_code == 200, published_key_res.text
        published_key = published_key_res.json()["data"]["secretToken"]

        query = """
        query Landing($path: String!, $perspective: DeliveryPerspective!) {
          resolvePage(path: $path, perspective: $perspective) {
            document {
              path
            }
          }
        }
        """
        response = await _graphql(
            client,
            site_id,
            query=query,
            variables={"path": "/landing", "perspective": "PUBLISHED"},
            headers={"X-API-Key": published_key},
        )
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["data"]["resolvePage"] is None
        assert payload["errors"][0]["extensions"]["code"] == "GRAPHQL_SCOPE_REQUIRED"

    get_settings.cache_clear()
