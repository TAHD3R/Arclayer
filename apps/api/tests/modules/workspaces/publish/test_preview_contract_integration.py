from __future__ import annotations

import pytest

from tests.modules.workspaces.content.test_content_items_integration import _workspace_client
from tests.modules.workspaces.publish.test_publish_integration import _publish_item, _setup_publishable_items

pytestmark = pytest.mark.integration


async def _prepare_published_site(client, workspace_id: str) -> None:
    root_item_id, child_item_id = await _setup_publishable_items(client, workspace_id)
    await _publish_item(client, workspace_id, root_item_id, "Home", path="/")
    await _publish_item(client, workspace_id, child_item_id, "About", path="/about")

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


def _artifact_for_path(contract: dict, path: str) -> dict:
    route = next(pointer for pointer in contract["routePointers"] if pointer["path"] == path)
    return next(artifact for artifact in contract["artifacts"] if artifact["artifactKey"] == route["artifactKey"])


@pytest.mark.asyncio
async def test_preview_contract_reads_publish_artifacts_as_runtime_truth(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        await _prepare_published_site(client, workspace_id)

        preview_res = await client.get(f"/api/v1/workspaces/{workspace_id}/publish/preview-contract")
        assert preview_res.status_code == 200, preview_res.text
        contract = preview_res.json()["data"]

        assert len(contract["routePointers"]) == 2
        assert len(contract["artifacts"]) == 2

        about_artifact = _artifact_for_path(contract, "/about")
        assert about_artifact["kind"] == "json"
        assert about_artifact["payload"]["route"]["path"] == "/about"
        assert about_artifact["payload"]["renderHints"]["role"] == "page"
        assert about_artifact["payload"]["renderHints"]["posture"] == "page"
        assert about_artifact["payload"]["renderHints"]["surface"] == "canvas"
        assert "modelKey" not in about_artifact["payload"]["renderHints"]
        assert about_artifact["payload"]["seo"]["metaTitle"] == "About | Arclayer"
        assert about_artifact["payload"]["bindings"]["bindings"][0]["componentKey"] == "hero_banner"
        assert {presentation["kind"] for presentation in about_artifact["payload"]["components"]["presentations"]} == {
            "form_data",
            "visual_blueprint",
        }
