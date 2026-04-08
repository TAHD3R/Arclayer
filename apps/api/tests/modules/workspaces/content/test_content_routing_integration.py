from __future__ import annotations

import pytest

from apps.api.tests.modules.workspaces.content.test_content_items_integration import (
    _bootstrap_shape_payload,
    _create_page_model,
    _workspace_client,
)

pytestmark = pytest.mark.integration


def _item_payload(slug: str, title: str) -> dict:
    return {
        "title": title,
        "locale": "en-US",
        "modelKey": "page",
    }


async def _create_model_and_items(client, workspace_id: str) -> tuple[str, str]:
    await _create_page_model(client, workspace_id)
    root_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/items",
        json=_item_payload("home", "Home"),
    )
    assert root_res.status_code == 201, root_res.text
    root_item_id = root_res.json()["data"]["id"]
    root_shape_res = await client.patch(
        f"/api/v1/workspaces/{workspace_id}/content/items/{root_item_id}/bootstrap-shape",
        json=_bootstrap_shape_payload(
            preset_key="page",
            capability_pack_ids=["publishable", "routable", "treeable"],
        ),
    )
    assert root_shape_res.status_code == 200, root_shape_res.text

    child_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/items",
        json=_item_payload("about", "About"),
    )
    assert child_res.status_code == 201, child_res.text
    child_item_id = child_res.json()["data"]["id"]
    child_shape_res = await client.patch(
        f"/api/v1/workspaces/{workspace_id}/content/items/{child_item_id}/bootstrap-shape",
        json=_bootstrap_shape_payload(
            preset_key="page",
            capability_pack_ids=["publishable", "routable", "treeable"],
        ),
    )
    assert child_shape_res.status_code == 200, child_shape_res.text
    return root_item_id, child_item_id


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
