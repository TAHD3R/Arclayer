from __future__ import annotations

import pytest

from apps.api.tests.modules.workspaces.content.test_content_items_integration import _workspace_client
from apps.api.tests.modules.workspaces.publish.test_publish_integration import _publish_item, _setup_publishable_items

pytestmark = pytest.mark.integration


async def _prepare_published_graph(client, workspace_id: str) -> None:
    root_item_id, child_item_id = await _setup_publishable_items(client, workspace_id)
    await _publish_item(client, workspace_id, root_item_id, "Home")
    await _publish_item(client, workspace_id, child_item_id, "About")
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
    publish_res = await client.post(f"/api/v1/workspaces/{workspace_id}/publish/artifacts", json={})
    assert publish_res.status_code == 200, publish_res.text


def _assert_bundle_core_contract(data: dict, target: str) -> None:
    assert data["target"] == target
    assert data["requiresHostedRuntime"] is False
    contract = data["publishContract"]
    route_pointers = contract["routePointers"]
    artifacts = contract["artifacts"]
    assert len(route_pointers) == 2
    assert len(artifacts) == len(route_pointers)
    assert all(pointer["artifactKey"] for pointer in route_pointers)
    assert all(item["kind"] in {"json", "html"} for item in artifacts)


@pytest.mark.asyncio
async def test_export_nextjs_bundle_uses_publish_contract(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        await _prepare_published_graph(client, workspace_id)
        export_res = await client.post(f"/api/v1/workspaces/{workspace_id}/publish/exports/nextjs", json={})
        assert export_res.status_code == 200, export_res.text
        data = export_res.json()["data"]
        _assert_bundle_core_contract(data, "nextjs")
        file_paths = {entry["path"] for entry in data["files"]}
        assert "app/[...slug]/page.tsx" in file_paths
        assert "src/lib/published-contract.ts" in file_paths
        assert "src/lib/component-registry.ts" in file_paths
        assert "export-meta.json" in file_paths
        assert all("portal" not in path.lower() for path in file_paths)


@pytest.mark.asyncio
async def test_export_sveltekit_bundle_uses_publish_contract_without_hosted_runtime_dependency(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        await _prepare_published_graph(client, workspace_id)
        export_res = await client.post(f"/api/v1/workspaces/{workspace_id}/publish/exports/sveltekit", json={})
        assert export_res.status_code == 200, export_res.text
        data = export_res.json()["data"]
        _assert_bundle_core_contract(data, "sveltekit")
        file_paths = {entry["path"] for entry in data["files"]}
        assert "src/routes/[...slug]/+page.server.ts" in file_paths
        assert "src/lib/published-contract.ts" in file_paths
        assert "src/lib/component-registry.ts" in file_paths
        assert "export-meta.json" in file_paths
        assert all("portal" not in path.lower() and "vike" not in path.lower() for path in file_paths)
