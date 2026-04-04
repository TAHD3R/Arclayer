from __future__ import annotations

import pytest

from apps.api.src.common.utils.public_ids import decode_public_id
from apps.api.src.models.content._enums import ContentShapeState
from apps.api.src.models.content.content_item import ContentItemRecord
from apps.api.src.models.content.publish_artifact import PublishArtifactRecord
from apps.api.tests.modules.workspaces.content.test_content_items_integration import _workspace_client
from apps.api.tests.modules.workspaces.publish.test_publish_integration import _publish_item, _setup_publishable_items

pytestmark = pytest.mark.integration


async def _prepare_published_root_item(client, workspace_id: str) -> str:
    root_item_id, _ = await _setup_publishable_items(client, workspace_id)
    await _publish_item(client, workspace_id, root_item_id, "Home")

    root_route_res = await client.put(
        f"/api/v1/workspaces/{workspace_id}/content/routing/bindings/{root_item_id}",
        json={"locale": "en-US", "path": "/", "isActive": True},
    )
    assert root_route_res.status_code == 200, root_route_res.text

    root_node_res = await client.put(
        f"/api/v1/workspaces/{workspace_id}/content/routing/hierarchy/{root_item_id}",
        json={"parentItemId": None, "sortOrder": 0},
    )
    assert root_node_res.status_code == 200, root_node_res.text

    return root_item_id


@pytest.mark.asyncio
async def test_publish_impact_blocks_unshaped_items_from_resolved_truth(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        root_item_id = await _prepare_published_root_item(client, workspace_id)
        root_item = await ContentItemRecord.get(id=decode_public_id(root_item_id))
        root_item.resolved_surface = None
        root_item.shape_state = ContentShapeState.UNSHAPED
        root_item.shape_reason_code = "CONTINUATION_TRUTH_MISSING"
        root_item.shape_reason_meta = {"source": "test"}
        await root_item.save(
            update_fields=["resolved_surface", "shape_state", "shape_reason_code", "shape_reason_meta"]
        )

        impact_res = await client.get(f"/api/v1/workspaces/{workspace_id}/publish/impact")
        assert impact_res.status_code == 200, impact_res.text
        blocked_items = impact_res.json()["data"]["blockedItems"]
        assert blocked_items == [
            {
                "itemId": root_item_id,
                "reasonCode": "CONTINUATION_TRUTH_MISSING",
                "shapeState": "unshaped",
                "reasonMeta": {"source": "test"},
            }
        ]

        publish_res = await client.post(f"/api/v1/workspaces/{workspace_id}/publish/artifacts", json={})
        assert publish_res.status_code == 409, publish_res.text
        assert publish_res.json()["error"] == "PUBLISH_IMPACT_BLOCKING"


@pytest.mark.asyncio
async def test_publish_artifacts_emit_resolved_continuation_truth_instead_of_bootstrap_hints(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        root_item_id = await _prepare_published_root_item(client, workspace_id)

        publish_res = await client.post(f"/api/v1/workspaces/{workspace_id}/publish/artifacts", json={})
        assert publish_res.status_code == 200, publish_res.text

        artifact = await PublishArtifactRecord.get(
            item_id=decode_public_id(root_item_id),
            artifact_kind="render_hints",
        )
        payload = artifact.payload
        assert isinstance(payload, dict)
        assert payload["role"] == "page"
        assert payload["posture"] == "page"
        assert payload["surface"] == "structured"
        assert payload["shapeState"] == "ready"
        assert "modelKey" not in payload
        assert "capabilities" not in payload
