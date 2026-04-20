from __future__ import annotations

import pytest

from tests.modules.workspaces.content.test_content_items_integration import (
    _bootstrap_shape_payload,
    _create_page_model,
    _workspace_client,
)
from tests.modules.workspaces.publish.test_publish_integration import _draft_payload, _item_payload

pytestmark = pytest.mark.integration


async def _create_publish_candidate(client, project_id: str, workspace_id: str) -> str:
    await _create_page_model(client, workspace_id)
    item_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items",
        json=_item_payload("home", "Home"),
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

    draft_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
        json=_draft_payload("Home", path="/"),
    )
    assert draft_res.status_code == 201, draft_res.text
    return item_id


@pytest.mark.asyncio
async def test_content_item_publish_requires_approved_workflow_stage(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        item_id = await _create_publish_candidate(client, project_id, workspace_id)

        publish_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/1/publish",
            json={},
        )
        assert publish_res.status_code == 409, publish_res.text
        assert publish_res.json()["error"] == "CONTENT_WORKFLOW_GATE_FAILED"


@pytest.mark.asyncio
async def test_content_item_workflow_patch_enables_publish_after_approval(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        item_id = await _create_publish_candidate(client, project_id, workspace_id)

        workflow_res = await client.patch(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/workflow",
            json={
                "stage": "approved",
                "summary": "Editorial review approved",
                "note": {"body": "Ready for release"},
            },
        )
        assert workflow_res.status_code == 200, workflow_res.text
        workflow_data = workflow_res.json()["data"]
        assert workflow_data["workflowStage"] == "approved"
        assert workflow_data["publishReadiness"]["ready"] is True

        publish_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/1/publish",
            json={},
        )
        assert publish_res.status_code == 200, publish_res.text
