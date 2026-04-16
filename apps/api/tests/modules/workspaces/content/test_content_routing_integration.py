from __future__ import annotations

import pytest

from tests.modules.workspaces.content.test_content_items_integration import (
    _bootstrap_shape_payload,
    _create_article_model,
    _create_page_model,
    _workspace_client,
)

pytestmark = pytest.mark.integration


def _item_payload(title: str) -> dict:
    return {
        "title": title,
        "locale": "en-US",
        "modelKey": "page",
    }


async def _create_page_item(client, workspace_id: str, title: str) -> str:
    item_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/items",
        json=_item_payload(title),
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


@pytest.mark.asyncio
async def test_content_routing_lists_static_and_dynamic_route_contracts(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        await _create_page_model(client, workspace_id)
        await _create_article_model(client, workspace_id)
        static_item_id = await _create_page_item(client, workspace_id, "Static")
        dynamic_item_id = await _create_page_item(client, workspace_id, "Dynamic")

        static_route_res = await client.put(
            f"/api/v1/workspaces/{workspace_id}/content/routing/bindings/{static_item_id}",
            json={"locale": "en-US", "path": "/blog/new", "isActive": True},
        )
        assert static_route_res.status_code == 200, static_route_res.text
        assert static_route_res.json()["data"]["routeMode"] == "static"

        dynamic_route_res = await client.put(
            f"/api/v1/workspaces/{workspace_id}/content/routing/bindings/{dynamic_item_id}",
            json={
                "locale": "en-US",
                "path": "/blog/:slug",
                "routeMode": "dynamic",
                "primarySource": {
                    "modelKey": "article",
                    "fieldKey": "slug",
                    "paramName": "slug",
                },
                "routePriority": 5,
                "isActive": True,
            },
        )
        assert dynamic_route_res.status_code == 200, dynamic_route_res.text
        payload = dynamic_route_res.json()["data"]
        assert payload["routeMode"] == "dynamic"
        assert payload["routePriority"] == 5
        assert payload["structureSignature"] == "/blog/:"
        assert payload["primarySource"] == {
            "modelKey": "article",
            "fieldKey": "slug",
            "paramName": "slug",
        }

        bindings_res = await client.get(f"/api/v1/workspaces/{workspace_id}/content/routing/bindings")
        assert bindings_res.status_code == 200, bindings_res.text
        bindings = {row["itemId"]: row for row in bindings_res.json()["data"]}
        assert bindings[static_item_id]["routeMode"] == "static"
        assert bindings[dynamic_item_id]["routeMode"] == "dynamic"


@pytest.mark.asyncio
async def test_content_routing_rejects_ambiguous_dynamic_patterns(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        await _create_page_model(client, workspace_id)
        await _create_article_model(client, workspace_id)
        first_item_id = await _create_page_item(client, workspace_id, "First")
        second_item_id = await _create_page_item(client, workspace_id, "Second")

        first_res = await client.put(
            f"/api/v1/workspaces/{workspace_id}/content/routing/bindings/{first_item_id}",
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
        assert first_res.status_code == 200, first_res.text

        second_res = await client.put(
            f"/api/v1/workspaces/{workspace_id}/content/routing/bindings/{second_item_id}",
            json={
                "locale": "en-US",
                "path": "/blog/:id",
                "routeMode": "dynamic",
                "primarySource": {
                    "modelKey": "article",
                    "fieldKey": "slug",
                    "paramName": "id",
                },
                "isActive": True,
            },
        )
        assert second_res.status_code == 409, second_res.text
        assert second_res.json()["error"] == "CONTENT_ROUTE_PATTERN_CONFLICT"
