from __future__ import annotations

import pytest

from tests.modules.projects.helpers import (
    create_project_article_model,
    create_project_content_model,
    create_project_page_model,
)
from tests.modules.workspaces.content.test_content_items_integration import (
    _bootstrap_shape_payload,
    _item_payload,
    _workspace_client,
)
from tests.modules.workspaces.content.test_content_library_views_integration import _view_payload
from tests.modules.workspaces.content.test_content_models_integration import _blank_first_create_payload
from tests.modules.workspaces.content.test_content_presentations_integration import (
    _draft_payload as _page_draft_payload,
)
from tests.modules.workspaces.content.test_content_presentations_integration import (
    _item_payload as _page_item_payload,
)

pytestmark = pytest.mark.integration


async def _create_project_content_model(client, project_id: str, **overrides: object) -> dict:
    return await create_project_content_model(client, project_id, **overrides)


async def _create_project_article_model(client, project_id: str) -> dict:
    return await create_project_article_model(client, project_id)


async def _create_project_page_model(client, project_id: str) -> dict:
    return await create_project_page_model(client, project_id)


@pytest.mark.asyncio
async def test_project_content_models_and_items_use_project_entry_paths(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
        model_res = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json=_blank_first_create_payload(),
        )
        assert model_res.status_code == 201, model_res.text
        assert model_res.json()["data"]["key"] == "article"

        item_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item = item_res.json()["data"]
        assert item["modelKey"] == "article"
        assert item["title"] == "Hello World"

        list_res = await client.get(
            f"/api/v1/projects/{project_id}/content/items",
            params={"modelKey": "article"},
        )
        assert list_res.status_code == 200, list_res.text
        payload = list_res.json()["data"]
        assert payload["total"] == 1
        assert payload["items"][0]["id"] == item["id"]


@pytest.mark.asyncio
async def test_project_content_library_views_use_project_entry_paths(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
        empty_res = await client.get(f"/api/v1/projects/{project_id}/content/library/views")
        assert empty_res.status_code == 200, empty_res.text
        assert empty_res.json()["data"]["items"] == []

        create_res = await client.post(
            f"/api/v1/projects/{project_id}/content/library/views",
            json=_view_payload("Project editorial queue", visibility="private", pinned=True),
        )
        assert create_res.status_code == 201, create_res.text
        created = create_res.json()["data"]["items"][0]
        assert created["name"] == "Project editorial queue"
        assert created["visibility"] == "private"

        patch_res = await client.patch(
            f"/api/v1/projects/{project_id}/content/library/views/{created['id']}",
            json={"name": "Project launch board", "pinned": False},
        )
        assert patch_res.status_code == 200, patch_res.text
        updated = patch_res.json()["data"]["items"][0]
        assert updated["name"] == "Project launch board"
        assert updated["pinned"] is False


@pytest.mark.asyncio
async def test_project_content_routing_uses_project_entry_paths(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
        await _create_project_page_model(client, project_id)
        await _create_project_article_model(client, project_id)

        item_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json={
                "title": "Project Route",
                "locale": "en-US",
                "modelKey": "page",
            },
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

        route_res = await client.put(
            f"/api/v1/projects/{project_id}/content/routing/bindings/{item_id}",
            json={"locale": "en-US", "path": "/project-route", "isActive": True},
        )
        assert route_res.status_code == 200, route_res.text
        assert route_res.json()["data"]["routeMode"] == "static"

        bindings_res = await client.get(f"/api/v1/projects/{project_id}/content/routing/bindings")
        assert bindings_res.status_code == 200, bindings_res.text
        assert {row["itemId"] for row in bindings_res.json()["data"]} == {item_id}


@pytest.mark.asyncio
async def test_project_content_version_auxiliary_endpoints_use_project_entry_paths(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
        await _create_project_page_model(client, project_id)

        item_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json=_page_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        shape_res = await client.patch(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/bootstrap-shape",
            json=_bootstrap_shape_payload(
                preset_key="page",
                capability_pack_ids=["publishable", "visual_editable", "has_slots", "seo_managed"],
            ),
        )
        assert shape_res.status_code == 200, shape_res.text

        draft_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
            json=_page_draft_payload("Project Launch"),
        )
        assert draft_res.status_code == 201, draft_res.text

        presentations_res = await client.get(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/1/presentations",
        )
        assert presentations_res.status_code == 200, presentations_res.text
        presentation_kinds = {entry["kind"] for entry in presentations_res.json()["data"]["items"]}
        assert {"form_data", "visual_blueprint", "slot_mapping", "seo"} <= presentation_kinds

        seo_res = await client.get(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/1/seo",
        )
        assert seo_res.status_code == 200, seo_res.text
        assert seo_res.json()["data"]["metaTitle"] == "Project Launch | Arclayer"

        bindings_res = await client.get(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/1/bindings",
        )
        assert bindings_res.status_code == 200, bindings_res.text
        binding = bindings_res.json()["data"]["items"][0]
        assert binding["componentKey"] == "hero"
        assert binding["bindingKey"] == "headline"
