from __future__ import annotations

import pytest

from src.models.content.release import ContentReleaseRecord
from tests.modules.workspaces.content.test_content_items_integration import _workspace_client
from tests.modules.workspaces.publish.test_publish_integration import _publish_item, _setup_publishable_items
from tests.modules.workspaces.publish.test_publish_releases_integration import (
    _prepare_publishable_tree,
    _publish_version,
)

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_release_dry_run_reports_workflow_blockers(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        root_item_id, _ = await _setup_publishable_items(client, workspace_id)

        draft_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{root_item_id}/versions/draft",
            json={
                "expectedVersion": 0,
                "changeSummary": "initial draft",
                "fieldsSnapshot": {"title": "Home", "path": "/"},
                "presentations": [
                    {"kind": "form_data", "payload": {"title": "Home", "path": "/"}},
                    {
                        "kind": "visual_blueprint",
                        "payload": {"root": "page_root", "nodes": {"page_root": {"type": "stack", "children": []}}},
                    },
                ],
            },
        )
        assert draft_res.status_code == 201, draft_res.text
        approved_res = await client.patch(
            f"/api/v1/workspaces/{workspace_id}/content/items/{root_item_id}/workflow",
            json={"stage": "approved"},
        )
        assert approved_res.status_code == 200, approved_res.text
        publish_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{root_item_id}/versions/1/publish",
            json={},
        )
        assert publish_res.status_code == 200, publish_res.text
        review_res = await client.patch(
            f"/api/v1/workspaces/{workspace_id}/content/items/{root_item_id}/workflow",
            json={"stage": "in_review"},
        )
        assert review_res.status_code == 200, review_res.text

        dry_run_res = await client.get(f"/api/v1/workspaces/{workspace_id}/releases/dry-run")
        assert dry_run_res.status_code == 200, dry_run_res.text
        data = dry_run_res.json()["data"]
        assert data["readinessSummary"]["ready"] is False
        assert data["readinessSummary"]["blockerCodes"] == ["WORKFLOW_STAGE_NOT_APPROVED"]
        assert data["impact"]["blockedItems"][0]["reasonCode"] == "WORKFLOW_STAGE_NOT_APPROVED"


@pytest.mark.asyncio
async def test_release_lineage_tracks_parent_release_and_selection_count(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        root_item_id, child_item_id = await _prepare_publishable_tree(client, workspace_id)

        for item_id in (root_item_id, child_item_id):
            workflow_res = await client.patch(
                f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/workflow",
                json={"stage": "approved"},
            )
            assert workflow_res.status_code == 200, workflow_res.text

        await _publish_item(client, workspace_id, root_item_id, "Home", path="/")
        await _publish_item(client, workspace_id, child_item_id, "About", path="/about")

        first_publish = await client.post(f"/api/v1/workspaces/{workspace_id}/releases/publish", json={})
        assert first_publish.status_code == 200, first_publish.text
        first_release = first_publish.json()["data"]["release"]
        assert first_publish.json()["data"]["selectionCount"] == 2
        assert first_release["selectionCount"] == 2
        assert first_release["lineage"] == {}

        await _publish_version(client, workspace_id, root_item_id, version=2, title="Home v2", path="/")
        second_publish = await client.post(f"/api/v1/workspaces/{workspace_id}/releases/publish", json={})
        assert second_publish.status_code == 200, second_publish.text
        second_release = second_publish.json()["data"]["release"]
        assert second_release["lineage"]["parentReleaseId"] == first_release["id"]
        assert second_release["lineage"]["parentReleaseNumber"] == 1

        detail_res = await client.get(f"/api/v1/workspaces/{workspace_id}/releases/{second_release['id']}")
        assert detail_res.status_code == 200, detail_res.text
        assert detail_res.json()["data"]["lineage"]["parentReleaseId"] == first_release["id"]

        releases = await ContentReleaseRecord.all().order_by("release_number")
        assert releases[0].selection_count == 2
        assert releases[1].lineage_parent_release_id == releases[0].id
