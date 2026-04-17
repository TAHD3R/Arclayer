from __future__ import annotations

import pytest

from src.common.utils.public_ids import decode_public_id
from src.models.content.publish_artifact import PublishArtifactRecord
from src.models.content.published_graph import PublishedGraphRecord
from src.models.content.release import ContentReleaseRecord
from tests.modules.workspaces.content.test_content_items_integration import _workspace_client
from tests.modules.workspaces.publish.test_publish_integration import _publish_item, _setup_publishable_items

pytestmark = pytest.mark.integration


async def _prepare_publishable_tree(client, workspace_id: str) -> tuple[str, str]:
    root_item_id, child_item_id = await _setup_publishable_items(client, workspace_id)

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
    return root_item_id, child_item_id


async def _publish_version(client, workspace_id: str, item_id: str, *, version: int, title: str, path: str) -> None:
    draft_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/draft",
        json={
            "expectedVersion": version - 1,
            "changeSummary": f"draft {version}",
            "fieldsSnapshot": {"title": title, "path": path},
            "presentations": [
                {"kind": "form_data", "payload": {"title": title, "path": path}},
                {
                    "kind": "visual_blueprint",
                    "payload": {
                        "root": "page_root",
                        "nodes": {
                            "page_root": {"type": "stack", "children": ["hero"]},
                            "hero": {"type": "hero_banner", "props": {"headline": title}},
                        },
                    },
                },
                {
                    "kind": "slot_mapping",
                    "payload": {
                        "bindings": [
                            {
                                "componentKey": "hero_banner",
                                "bindingKey": "headline",
                                "payload": {"field": "title"},
                            }
                        ]
                    },
                },
                {"kind": "seo", "payload": {"metaTitle": title, "metaDescription": title}},
            ],
        },
    )
    assert draft_res.status_code == 201, draft_res.text

    publish_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/{version}/publish",
        json={},
    )
    assert publish_res.status_code == 200, publish_res.text


@pytest.mark.asyncio
async def test_publish_artifacts_create_active_release_and_link_rows(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        root_item_id, child_item_id = await _prepare_publishable_tree(client, workspace_id)
        await _publish_item(client, workspace_id, root_item_id, "Home", path="/")
        await _publish_item(client, workspace_id, child_item_id, "About", path="/about")

        publish_res = await client.post(f"/api/v1/workspaces/{workspace_id}/releases/publish", json={})
        assert publish_res.status_code == 200, publish_res.text
        assert publish_res.json()["data"]["release"]["releaseNumber"] == 1

        releases = await ContentReleaseRecord.all().order_by("release_number")
        assert len(releases) == 1
        assert releases[0].is_active is True

        release_id = releases[0].id
        root_uuid = decode_public_id(root_item_id)
        child_uuid = decode_public_id(child_item_id)
        graph_rows = await PublishedGraphRecord.filter(item_id__in=[root_uuid, child_uuid]).all()
        artifact_rows = await PublishArtifactRecord.filter(item_id__in=[root_uuid, child_uuid]).all()

        assert graph_rows
        assert artifact_rows
        assert {row.release_id for row in graph_rows} == {release_id}
        assert {row.release_id for row in artifact_rows} == {release_id}


@pytest.mark.asyncio
async def test_publish_artifacts_rotate_active_release_forward(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        root_item_id, child_item_id = await _prepare_publishable_tree(client, workspace_id)
        await _publish_item(client, workspace_id, root_item_id, "Home", path="/")
        await _publish_item(client, workspace_id, child_item_id, "About", path="/about")

        first_publish = await client.post(f"/api/v1/workspaces/{workspace_id}/releases/publish", json={})
        assert first_publish.status_code == 200, first_publish.text

        await _publish_version(client, workspace_id, root_item_id, version=2, title="Home v2", path="/")
        second_publish = await client.post(f"/api/v1/workspaces/{workspace_id}/releases/publish", json={})
        assert second_publish.status_code == 200, second_publish.text

        releases = await ContentReleaseRecord.all().order_by("release_number")
        assert [release.release_number for release in releases] == [1, 2]
        assert [release.is_active for release in releases] == [False, True]

        active_release = releases[-1]
        latest_route_artifact = await PublishArtifactRecord.get(
            release_id=active_release.id,
            item_id=decode_public_id(root_item_id),
            artifact_kind="route_manifest",
        )
        assert latest_route_artifact.release_id == active_release.id


@pytest.mark.asyncio
async def test_release_management_list_detail_and_rollback(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        root_item_id, child_item_id = await _prepare_publishable_tree(client, workspace_id)
        await _publish_item(client, workspace_id, root_item_id, "Home", path="/")
        await _publish_item(client, workspace_id, child_item_id, "About", path="/about")

        first_publish = await client.post(f"/api/v1/workspaces/{workspace_id}/releases/publish", json={})
        assert first_publish.status_code == 200, first_publish.text

        await _publish_version(client, workspace_id, root_item_id, version=2, title="Home v2", path="/")
        second_publish = await client.post(f"/api/v1/workspaces/{workspace_id}/releases/publish", json={})
        assert second_publish.status_code == 200, second_publish.text

        list_res = await client.get(f"/api/v1/workspaces/{workspace_id}/releases")
        assert list_res.status_code == 200, list_res.text
        items = list_res.json()["data"]["items"]
        assert [item["releaseNumber"] for item in items] == [2, 1]

        first_release = next(item for item in items if item["releaseNumber"] == 1)
        second_release = next(item for item in items if item["releaseNumber"] == 2)

        detail_res = await client.get(f"/api/v1/workspaces/{workspace_id}/releases/{first_release['id']}")
        assert detail_res.status_code == 200, detail_res.text
        assert detail_res.json()["data"]["releaseNumber"] == 1
        assert detail_res.json()["data"]["isActive"] is False

        rollback_res = await client.post(f"/api/v1/workspaces/{workspace_id}/releases/{first_release['id']}/rollback")
        assert rollback_res.status_code == 200, rollback_res.text
        rollback_data = rollback_res.json()["data"]
        assert rollback_data["release"]["id"] == first_release["id"]
        assert rollback_data["release"]["isActive"] is True
        assert rollback_data["previousActiveReleaseId"] == second_release["id"]

        releases = await ContentReleaseRecord.all().order_by("release_number")
        assert [release.release_number for release in releases] == [1, 2]
        assert [release.is_active for release in releases] == [True, False]
