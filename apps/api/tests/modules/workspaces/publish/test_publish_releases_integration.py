from __future__ import annotations

import pytest

from src.common.utils.public_ids import decode_public_id
from src.models.analytics.audit_event import AuditEvent
from src.models.content.publish_artifact import PublishArtifactRecord
from src.models.content.published_graph import PublishedGraphRecord
from src.models.content.release import ContentReleaseRecord
from src.models.projects.deployment import ProjectDeploymentRecord
from tests.modules.projects.helpers import (
    bind_project_hierarchy,
    bind_project_route,
    project_context_ids,
)
from tests.modules.workspaces.content.test_content_items_integration import (
    _tenant_conn,
    _wait_latest_workspace_audit_event,
    _workspace_client,
)
from tests.modules.workspaces.publish.test_publish_integration import _setup_publishable_items
from tests.utils.project_context import project_site_id

pytestmark = pytest.mark.integration


async def _latest_draft_version(client, project_id: str, item_id: str) -> int:
    item_detail_res = await client.get(f"/api/v1/projects/{project_id}/content/items/{item_id}")
    assert item_detail_res.status_code == 200, item_detail_res.text
    return int(item_detail_res.json()["data"]["draftVersion"])


async def _prepare_publishable_tree(client, project_id: str) -> tuple[str, str]:
    root_item_id, child_item_id = await _setup_publishable_items(client, project_id)
    await bind_project_route(client, project_id, root_item_id, path="/")
    await bind_project_route(client, project_id, child_item_id, path="/about")
    await bind_project_hierarchy(client, project_id, root_item_id, parent_item_id=None, sort_order=0)
    await bind_project_hierarchy(client, project_id, child_item_id, parent_item_id=root_item_id, sort_order=10)
    return root_item_id, child_item_id


async def _release_rows(workspace_id: str) -> list[ContentReleaseRecord]:
    async with _tenant_conn(workspace_id) as conn:
        return await ContentReleaseRecord.all().using_db(conn).order_by("release_number")


async def _release_count(workspace_id: str) -> int:
    async with _tenant_conn(workspace_id) as conn:
        return await ContentReleaseRecord.all().using_db(conn).count()


async def _published_graph_rows(workspace_id: str, item_ids: list) -> list[PublishedGraphRecord]:  # type: ignore[type-arg]
    async with _tenant_conn(workspace_id) as conn:
        return await PublishedGraphRecord.filter(item_id__in=item_ids).using_db(conn).all()


async def _publish_artifact_rows(workspace_id: str, item_ids: list) -> list[PublishArtifactRecord]:  # type: ignore[type-arg]
    async with _tenant_conn(workspace_id) as conn:
        return await PublishArtifactRecord.filter(item_id__in=item_ids).using_db(conn).all()


async def _publish_artifact_count(workspace_id: str) -> int:
    async with _tenant_conn(workspace_id) as conn:
        return await PublishArtifactRecord.all().using_db(conn).count()


async def _published_graph_count(workspace_id: str) -> int:
    async with _tenant_conn(workspace_id) as conn:
        return await PublishedGraphRecord.all().using_db(conn).count()


async def _publish_next_version(client, project_id: str, item_id: str, *, title: str, path: str) -> None:
    draft_version = await _latest_draft_version(client, project_id, item_id)
    next_version = draft_version + 1
    await _publish_version(client, project_id, item_id, version=next_version, title=title, path=path)


async def _publish_version(client, project_id: str, item_id: str, *, version: int, title: str, path: str) -> None:
    draft_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
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

    workflow_res = await client.patch(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/workflow",
        json={
            "stage": "approved",
            "summary": f"{title} approved for publish",
        },
    )
    assert workflow_res.status_code == 200, workflow_res.text

    publish_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/{version}/publish",
        json={},
    )
    assert publish_res.status_code == 200, publish_res.text


@pytest.mark.asyncio
async def test_publish_artifacts_create_active_release_and_link_rows(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        project_id, _runtime_id = await project_context_ids(client, workspace_id)
        root_item_id, child_item_id = await _prepare_publishable_tree(client, project_id)
        await _publish_next_version(client, project_id, root_item_id, title="Home", path="/")
        await _publish_next_version(client, project_id, child_item_id, title="About", path="/about")

        publish_res = await client.post(f"/api/v1/projects/{project_id}/releases/publish", json={})
        assert publish_res.status_code == 200, publish_res.text
        assert publish_res.json()["data"]["release"]["releaseNumber"] == 1

        releases = await _release_rows(workspace_id)
        assert len(releases) == 1
        assert releases[0].is_active is True

        release_id = releases[0].id
        root_uuid = decode_public_id(root_item_id)
        child_uuid = decode_public_id(child_item_id)
        graph_rows = await _published_graph_rows(workspace_id, [root_uuid, child_uuid])
        artifact_rows = await _publish_artifact_rows(workspace_id, [root_uuid, child_uuid])

        assert graph_rows
        assert artifact_rows
        assert {row.release_id for row in graph_rows} == {release_id}
        assert {row.release_id for row in artifact_rows} == {release_id}


@pytest.mark.asyncio
async def test_publish_artifacts_rotate_active_release_forward(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        project_id, _runtime_id = await project_context_ids(client, workspace_id)
        root_item_id, child_item_id = await _prepare_publishable_tree(client, project_id)
        await _publish_next_version(client, project_id, root_item_id, title="Home", path="/")
        await _publish_next_version(client, project_id, child_item_id, title="About", path="/about")

        first_publish = await client.post(f"/api/v1/projects/{project_id}/releases/publish", json={})
        assert first_publish.status_code == 200, first_publish.text

        await _publish_next_version(client, project_id, root_item_id, title="Home v2", path="/")
        second_publish = await client.post(f"/api/v1/projects/{project_id}/releases/publish", json={})
        assert second_publish.status_code == 200, second_publish.text

        releases = await _release_rows(workspace_id)
        assert [release.release_number for release in releases] == [1, 2]
        assert [release.is_active for release in releases] == [False, True]

        active_release = releases[-1]
        async with _tenant_conn(workspace_id) as conn:
            latest_route_artifact = await (
                PublishArtifactRecord
                .filter(
                    release_id=active_release.id,
                    item_id=decode_public_id(root_item_id),
                    artifact_kind="route_manifest",
                )
                .using_db(conn)
                .get()
            )
        assert latest_route_artifact.release_id == active_release.id


@pytest.mark.asyncio
async def test_release_management_list_detail_and_rollback(
    monkeypatch,
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        project_id, _runtime_id = await project_context_ids(client, workspace_id)
        site_id = await project_site_id(client, project_id)
        workspace_uuid = decode_public_id(workspace_id)
        root_item_id, child_item_id = await _prepare_publishable_tree(client, project_id)
        await _publish_next_version(client, project_id, root_item_id, title="Home", path="/")
        await _publish_next_version(client, project_id, child_item_id, title="About", path="/about")

        first_publish = await client.post(f"/api/v1/projects/{project_id}/releases/publish", json={})
        assert first_publish.status_code == 200, first_publish.text
        first_release_id = first_publish.json()["data"]["release"]["id"]
        published_event = await _wait_latest_workspace_audit_event(
            event_name="release.published",
            workspace_id=workspace_uuid,
            entity_id=decode_public_id(first_release_id),
        )
        assert published_event.properties["release_number"] == 1
        assert published_event.properties["outcome"] == "published"
        assert published_event.properties["site_id"] == str(decode_public_id(site_id))

        await _publish_next_version(client, project_id, root_item_id, title="Home v2", path="/")
        second_publish = await client.post(f"/api/v1/projects/{project_id}/releases/publish", json={})
        assert second_publish.status_code == 200, second_publish.text

        list_res = await client.get(f"/api/v1/projects/{project_id}/releases")
        assert list_res.status_code == 200, list_res.text
        items = list_res.json()["data"]["items"]
        assert [item["releaseNumber"] for item in items] == [2, 1]

        first_release = next(item for item in items if item["releaseNumber"] == 1)
        second_release = next(item for item in items if item["releaseNumber"] == 2)

        detail_res = await client.get(f"/api/v1/projects/{project_id}/releases/{first_release['id']}")
        assert detail_res.status_code == 200, detail_res.text
        assert detail_res.json()["data"]["releaseNumber"] == 1
        assert detail_res.json()["data"]["isActive"] is False

        rollback_res = await client.post(f"/api/v1/projects/{project_id}/releases/{first_release['id']}/rollback")
        assert rollback_res.status_code == 200, rollback_res.text
        rollback_data = rollback_res.json()["data"]
        assert rollback_data["release"]["id"] == first_release["id"]
        assert rollback_data["release"]["isActive"] is True
        assert rollback_data["previousActiveReleaseId"] == second_release["id"]
        rollback_event = await _wait_latest_workspace_audit_event(
            event_name="release.rolled_back",
            workspace_id=workspace_uuid,
            entity_id=decode_public_id(first_release["id"]),
        )
        assert rollback_event.properties["previous_active_release_id"] == str(decode_public_id(second_release["id"]))
        assert rollback_event.properties["outcome"] == "rolled_back"

        activity_res = await client.get(
            f"/api/v1/workspaces/{workspace_id}/activity"
            f"?eventName=release.&entityType=release&entityId={first_release['id']}&page=1&size=10"
        )
        assert activity_res.status_code == 200, activity_res.text
        activity_items = activity_res.json()["data"]["items"]
        release_event_names = [
            entry["eventName"]
            for entry in activity_items
            if entry["eventName"] in {"release.published", "release.rolled_back"}
        ]
        assert set(release_event_names[:2]) == {"release.published", "release.rolled_back"}
        assert all(entry["entityId"] == first_release["id"] for entry in activity_items[:2])

        releases = await _release_rows(workspace_id)
        assert [release.release_number for release in releases] == [1, 2]
        assert [release.is_active for release in releases] == [True, False]

        from src.modules.projects.releases import service as release_service_module

        original_write_required_activity_event = release_service_module.write_required_activity_event

        async def _failing_write_required_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
            if payload.event_name.startswith("release."):
                raise RuntimeError(f"forced activity write failure: {payload.event_name}")
            return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

        monkeypatch.setattr(
            "src.modules.projects.releases.service.write_required_activity_event",
            _failing_write_required_activity_event,
        )

        await _publish_next_version(client, project_id, child_item_id, title="About v2", path="/about")
        release_count_before = await _release_count(workspace_id)
        artifact_count_before = await _publish_artifact_count(workspace_id)
        graph_count_before = await _published_graph_count(workspace_id)
        deployment_count_before = await ProjectDeploymentRecord.all().count()
        audit_count_before = await AuditEvent.filter(event_name__startswith="release.").count()

        failed_publish_res = await client.post(f"/api/v1/projects/{project_id}/releases/publish", json={})
        assert failed_publish_res.status_code == 500, failed_publish_res.text
        assert await _release_count(workspace_id) == release_count_before
        assert await _publish_artifact_count(workspace_id) == artifact_count_before
        assert await _published_graph_count(workspace_id) == graph_count_before
        assert await ProjectDeploymentRecord.all().count() == deployment_count_before
        assert await AuditEvent.filter(event_name__startswith="release.").count() == audit_count_before

        failed_rollback_res = await client.post(
            f"/api/v1/projects/{project_id}/releases/{second_release['id']}/rollback"
        )
        assert failed_rollback_res.status_code == 500, failed_rollback_res.text
        releases_after_failed_rollback = await _release_rows(workspace_id)
        assert [release.release_number for release in releases_after_failed_rollback] == [1, 2]
        assert [release.is_active for release in releases_after_failed_rollback] == [True, False]
        assert await ProjectDeploymentRecord.all().count() == deployment_count_before
        assert await AuditEvent.filter(event_name__startswith="release.").count() == audit_count_before
