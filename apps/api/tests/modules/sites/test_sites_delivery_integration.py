from __future__ import annotations

import pytest

from tests.modules.sites.test_sites_canonical_content_runtime_integration import (
    _article_draft_payload,
    _article_item_payload,
    _create_page_item,
    _publish_article_version,
    _publish_page_item,
    _save_article_draft,
    _upsert_route_binding,
    _workspace_client,
)
from tests.modules.workspaces.content.test_content_items_integration import (
    _bootstrap_shape_payload,
    _create_article_model,
    _create_content_model,
    _create_page_model,
)
from tests.utils.project_context import project_id_for_workspace

pytestmark = pytest.mark.integration


def _section_item_payload(title: str) -> dict:
    return {
        "modelKey": "reusable-section",
        "title": title,
        "locale": "en-US",
    }


def _section_draft_payload(*, title: str, alias: str) -> dict:
    return {
        "expectedVersion": 0,
        "changeSummary": f"{title} draft",
        "fieldsSnapshot": {
            "title": title,
            "section_key": alias,
            "props_defaults": {"tone": "primary"},
        },
        "presentations": [
            {
                "kind": "form_data",
                "payload": {
                    "title": title,
                    "section_key": alias,
                    "props_defaults": {"tone": "primary"},
                },
            },
            {
                "kind": "visual_blueprint",
                "payload": {
                    "rootId": "section_root",
                    "nodesById": {
                        "section_root": {
                            "id": "section_root",
                            "type": "page_root",
                            "children": ["header_hero"],
                            "layout": {"children": {"mode": "auto", "direction": "column"}},
                        },
                        "header_hero": {
                            "id": "header_hero",
                            "type": "hero_banner",
                            "props": {"headline": title},
                        },
                    },
                },
            },
            {
                "kind": "slot_mapping",
                "payload": {
                    "version": 1,
                    "sections": {
                        "header_hero": {
                            "propsDefaults": {"tone": "primary"},
                        }
                    },
                },
            },
        ],
    }


def _page_binding_failure_draft_payload(*, title: str, path: str) -> dict:
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
                                    "path": ["missing_field"],
                                }
                            },
                        }
                    },
                },
            },
        ],
    }


async def _create_article_item(client, project_id: str, *, slug: str, title: str) -> str:
    item_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items",
        json=_article_item_payload(slug, title),
    )
    assert item_res.status_code == 201, item_res.text
    return item_res.json()["data"]["id"]


async def _create_reusable_section_model(client, workspace_id: str) -> dict:
    project_id = await project_id_for_workspace(client, workspace_id)
    return await _create_content_model(
        client,
        project_id,
        singularKey="reusable-section",
        pluralKey="reusable-sections",
        name="Reusable Section",
        category="site_builder",
        capabilities=["publishable"],
        defaultRole="reusable-section",
        defaultPosture="composition",
        defaultSurface="structured",
    )


async def _create_reusable_section_item(client, project_id: str, *, title: str) -> str:
    item_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items",
        json=_section_item_payload(title),
    )
    assert item_res.status_code == 201, item_res.text
    item_id = item_res.json()["data"]["id"]
    shape_res = await client.patch(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/bootstrap-shape",
        json=_bootstrap_shape_payload(
            preset_key="section",
            capability_pack_ids=["publishable"],
        ),
    )
    assert shape_res.status_code == 200, shape_res.text
    return item_id


async def _save_section_draft(
    client,
    project_id: str,
    *,
    item_id: str,
    title: str,
    alias: str,
) -> None:
    draft_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
        json=_section_draft_payload(title=title, alias=alias),
    )
    assert draft_res.status_code == 201, draft_res.text


async def _approve_item_for_publish(client, project_id: str, *, item_id: str, summary: str) -> None:
    workflow_res = await client.patch(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/workflow",
        json={"stage": "approved", "summary": summary},
    )
    assert workflow_res.status_code == 200, workflow_res.text


async def _publish_release(client, project_id: str) -> None:
    publish_res = await client.post(f"/api/v1/projects/{project_id}/releases/publish", json={})
    assert publish_res.status_code == 200, publish_res.text


async def _runtime_id_and_preview_token(client, project_id: str) -> tuple[str, str]:
    project_res = await client.get(f"/api/v1/projects/{project_id}")
    assert project_res.status_code == 200, project_res.text
    runtime_id = project_res.json()["data"]["primaryRuntime"]["id"]
    token_res = await client.post(
        f"/api/v1/projects/{project_id}/site/preview-tokens",
        json={"ttlSeconds": 600},
    )
    assert token_res.status_code == 201, token_res.text
    return runtime_id, token_res.json()["data"]["token"]


@pytest.mark.asyncio
async def test_delivery_pages_resolve_and_by_id_honor_release_world_and_preview_draft(
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
            expected_version=1,
            title="Entry world v1",
            slug="world",
        )
        await _publish_article_version(client, project_id, item_id=article_item_id, version=2)

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
        await _publish_release(client, project_id)

        runtime_id, preview_token = await _runtime_id_and_preview_token(client, project_id)
        await _save_article_draft(
            client,
            project_id,
            item_id=article_item_id,
            expected_version=2,
            title="Entry world v2 (draft)",
            slug="world",
        )

        published_res = await client.get(
            f"/content-api/v1/runtimes/{runtime_id}/delivery/pages/resolve",
            params={"path": "/blog/world", "perspective": "published"},
        )
        assert published_res.status_code == 200, published_res.text
        published_payload = published_res.json()["data"]
        assert published_payload["context"]["primary"]["title"] == "Entry world v1"
        assert published_payload["document"]["sections"][0]["props"]["headline"] == "Entry world v1"

        preview_res = await client.get(
            f"/content-api/v1/runtimes/{runtime_id}/delivery/pages/resolve",
            params={"path": "/blog/world", "perspective": "preview", "token": preview_token},
        )
        assert preview_res.status_code == 200, preview_res.text
        preview_payload = preview_res.json()["data"]
        assert preview_payload["context"]["primary"]["title"] == "Entry world v2 (draft)"
        assert preview_payload["document"]["sections"][0]["props"]["headline"] == "Entry world v2 (draft)"

        by_id_res = await client.get(
            f"/content-api/v1/runtimes/{runtime_id}/delivery/pages/{static_item_id}",
            params={"perspective": "published"},
        )
        assert by_id_res.status_code == 200, by_id_res.text
        by_id_payload = by_id_res.json()["data"]
        assert by_id_payload["document"]["path"] == "/blog/new"
        assert by_id_payload["document"]["sections"][0]["props"]["headline"] == "New Landing"


@pytest.mark.asyncio
async def test_delivery_pages_resolve_surfaces_binding_resolution_failures(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_page_model(client, workspace_id)
        await _create_article_model(client, workspace_id)

        template_item_id = await _create_page_item(client, project_id, title="Broken Template")
        article_item_id = await _create_article_item(client, project_id, slug="world", title="Entry world v1")

        draft_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{template_item_id}/versions/draft",
            json=_page_binding_failure_draft_payload(title="Broken Template", path="/broken/:slug"),
        )
        assert draft_res.status_code == 201, draft_res.text
        await _approve_item_for_publish(
            client,
            project_id,
            item_id=template_item_id,
            summary="Broken template approved for binding diagnostics",
        )
        publish_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{template_item_id}/versions/1/publish",
            json={},
        )
        assert publish_res.status_code == 200, publish_res.text

        article_draft_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{article_item_id}/versions/draft",
            json=_article_draft_payload(expected_version=1, title="Entry world v1", slug="world"),
        )
        assert article_draft_res.status_code == 201, article_draft_res.text
        await _publish_article_version(client, project_id, item_id=article_item_id, version=2)

        await _upsert_route_binding(
            client,
            project_id,
            item_id=template_item_id,
            path="/broken/:slug",
            route_mode="dynamic",
            primary_source={
                "modelKey": "article",
                "fieldKey": "slug",
                "paramName": "slug",
            },
        )
        await _publish_release(client, project_id)

        runtime_id, _ = await _runtime_id_and_preview_token(client, project_id)
        published_res = await client.get(
            f"/content-api/v1/runtimes/{runtime_id}/delivery/pages/resolve",
            params={"path": "/broken/world", "perspective": "published"},
        )
        assert published_res.status_code == 409, published_res.text
        assert published_res.json()["error"] == "PAGE_BINDING_RESOLUTION_FAILED"


@pytest.mark.asyncio
async def test_delivery_sections_and_global_sets_resolve_reusable_section_contract(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_reusable_section_model(client, workspace_id)

        section_item_id = await _create_reusable_section_item(client, project_id, title="Header Section")
        await _save_section_draft(
            client,
            project_id,
            item_id=section_item_id,
            title="Header Section",
            alias="site-header",
        )
        await _approve_item_for_publish(
            client,
            project_id,
            item_id=section_item_id,
            summary="Reusable section approved for delivery contract",
        )
        publish_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{section_item_id}/versions/1/publish",
            json={},
        )
        assert publish_res.status_code == 200, publish_res.text
        await _publish_release(client, project_id)

        runtime_id, preview_token = await _runtime_id_and_preview_token(client, project_id)

        section_res = await client.get(
            f"/content-api/v1/runtimes/{runtime_id}/delivery/sections/site-header",
            params={"perspective": "preview", "token": preview_token},
        )
        assert section_res.status_code == 200, section_res.text
        section_payload = section_res.json()["data"]
        assert section_payload["alias"] == "site-header"
        assert section_payload["document"]["sections"][0]["props"]["headline"] == "Header Section"
        assert section_payload["document"]["sections"][0]["props"]["tone"] == "primary"

        global_set_res = await client.get(
            f"/content-api/v1/runtimes/{runtime_id}/delivery/global-sets/header",
            params={"perspective": "preview", "token": preview_token},
        )
        assert global_set_res.status_code == 404, global_set_res.text
        assert global_set_res.json()["error"] == "GLOBAL_SET_NOT_FOUND"

        published_page_res = await client.get(
            f"/content-api/v1/runtimes/{runtime_id}/delivery/pages/{section_item_id}",
            params={"perspective": "published"},
        )
        assert published_page_res.status_code == 404, published_page_res.text
        assert published_page_res.json()["error"] == "PAGE_NOT_FOUND"

        preview_page_res = await client.get(
            f"/content-api/v1/runtimes/{runtime_id}/delivery/pages/{section_item_id}",
            params={"perspective": "preview", "token": preview_token},
        )
        assert preview_page_res.status_code == 404, preview_page_res.text
        assert preview_page_res.json()["error"] == "PAGE_NOT_FOUND"
