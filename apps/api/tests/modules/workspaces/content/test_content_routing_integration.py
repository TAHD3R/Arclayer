from __future__ import annotations

import pytest

from apps.api.tests.modules.workspaces.content.test_content_items_integration import _workspace_client

pytestmark = pytest.mark.integration


def _routable_model_payload() -> dict:
    return {
        "key": "page",
        "name": "Page",
        "kind": "custom",
        "fields": [{"key": "title", "label": "Title", "scalar": "text", "required": True}],
        "relations": [],
        "capabilities": ["versioned", "publishable", "routable", "treeable"],
        "routing": {"mode": "single", "slugField": "title"},
        "workflow": {"states": ["draft", "published"], "initialState": "draft"},
        "views": [],
    }


def _item_payload(slug: str, title: str) -> dict:
    return {
        "modelKey": "page",
        "slug": slug,
        "title": title,
        "locale": "en-US",
        "visibility": "public",
        "status": "draft",
    }


async def _create_model_and_items(client, workspace_id: str) -> tuple[str, str]:
    model_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/models",
        json=_routable_model_payload(),
    )
    assert model_res.status_code == 201, model_res.text

    root_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/items",
        json=_item_payload("home", "Home"),
    )
    assert root_res.status_code == 201, root_res.text

    child_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/items",
        json=_item_payload("about", "About"),
    )
    assert child_res.status_code == 201, child_res.text
    return root_res.json()["data"]["id"], child_res.json()["data"]["id"]


@pytest.mark.asyncio
async def test_content_routing_upsert_bindings_and_hierarchy(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        root_item_id, child_item_id = await _create_model_and_items(client, workspace_id)

        root_route_res = await client.put(
            f"/api/v1/workspaces/{workspace_id}/content/routing/bindings/{root_item_id}",
            json={"locale": "en-US", "path": "/", "isActive": True},
        )
        assert root_route_res.status_code == 200, root_route_res.text

        child_route_res = await client.put(
            f"/api/v1/workspaces/{workspace_id}/content/routing/bindings/{child_item_id}",
            json={"locale": "en-US", "path": "/about", "isActive": True},
        )
        assert child_route_res.status_code == 200, child_route_res.text

        root_node_res = await client.put(
            f"/api/v1/workspaces/{workspace_id}/content/routing/hierarchy/{root_item_id}",
            json={"parentItemId": None, "sortOrder": 0},
        )
        assert root_node_res.status_code == 200, root_node_res.text

        child_node_res = await client.put(
            f"/api/v1/workspaces/{workspace_id}/content/routing/hierarchy/{child_item_id}",
            json={"parentItemId": root_item_id, "sortOrder": 10},
        )
        assert child_node_res.status_code == 200, child_node_res.text
        assert child_node_res.json()["data"]["parentItemId"] == root_item_id

        bindings_res = await client.get(f"/api/v1/workspaces/{workspace_id}/content/routing/bindings")
        assert bindings_res.status_code == 200, bindings_res.text
        assert len(bindings_res.json()["data"]) == 2

        hierarchy_res = await client.get(f"/api/v1/workspaces/{workspace_id}/content/routing/hierarchy")
        assert hierarchy_res.status_code == 200, hierarchy_res.text
        assert len(hierarchy_res.json()["data"]) == 2
