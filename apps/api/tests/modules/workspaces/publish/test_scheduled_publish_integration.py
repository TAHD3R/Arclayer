from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from src.common.utils.public_ids import decode_public_id
from src.models.content._enums import ContentReleaseStatus, PublishJobStatus
from src.models.content.publish_job import PublishJobRecord
from src.models.content.release import ContentReleaseRecord
from src.models.system.notification import NotificationRecord
from src.platform.jobs.scheduled_publish import check_scheduled_publishes
from tests.modules.projects.helpers import project_context_ids
from tests.modules.workspaces.content.test_content_items_integration import _tenant_conn, _workspace_client
from tests.modules.workspaces.publish.test_publish_integration import _draft_payload
from tests.modules.workspaces.publish.test_publish_releases_integration import _prepare_publishable_tree

pytestmark = pytest.mark.integration


async def _prepare_publishable_release(client, project_id: str) -> None:
    root_item_id, child_item_id = await _prepare_publishable_tree(client, project_id)
    await _publish_current_draft(client, project_id, root_item_id, "Home", path="/")
    await _publish_current_draft(client, project_id, child_item_id, "About", path="/about")


async def _publish_current_draft(client, project_id: str, item_id: str, title: str, *, path: str) -> None:
    item_res = await client.get(f"/api/v1/projects/{project_id}/content/items/{item_id}")
    assert item_res.status_code == 200, item_res.text
    draft_version = int(item_res.json()["data"]["draftVersion"])

    draft_payload = _draft_payload(title, path=path)
    draft_payload["expectedVersion"] = draft_version
    draft_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
        json=draft_payload,
    )
    assert draft_res.status_code == 201, draft_res.text

    next_version = draft_version + 1
    workflow_res = await client.patch(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/workflow",
        json={
            "stage": "approved",
            "summary": f"{title} approved for scheduled publish",
        },
    )
    assert workflow_res.status_code == 200, workflow_res.text

    publish_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/{next_version}/publish",
        json={},
    )
    assert publish_res.status_code == 200, publish_res.text


@pytest.mark.asyncio
async def test_release_publish_can_schedule_and_cancel(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        project_id, _runtime_id = await project_context_ids(client, workspace_id)
        await _prepare_publishable_release(client, project_id)
        scheduled_at = datetime.now(tz=UTC) + timedelta(hours=1)

        publish_res = await client.post(
            f"/api/v1/projects/{project_id}/releases/publish",
            json={"scheduledAt": scheduled_at.isoformat()},
        )
        assert publish_res.status_code == 200, publish_res.text
        data = publish_res.json()["data"]
        assert data["release"]["status"] == "scheduled"
        assert data["release"]["isActive"] is False
        assert data["job"]["status"] == "pending"

        release_id = data["release"]["id"]
        cancel_res = await client.post(f"/api/v1/projects/{project_id}/releases/{release_id}/cancel-schedule")
        assert cancel_res.status_code == 200, cancel_res.text
        assert cancel_res.json()["data"]["release"]["status"] == "cancelled"
        assert cancel_res.json()["data"]["job"]["status"] == "cancelled"

        async with _tenant_conn(workspace_id) as conn:
            release = await ContentReleaseRecord.filter(id=decode_public_id(release_id)).using_db(conn).first()
        assert release is not None
        job = await PublishJobRecord.get(release_id=release.id)
        assert release.status == ContentReleaseStatus.CANCELLED
        assert job.status == PublishJobStatus.CANCELLED


@pytest.mark.asyncio
async def test_scheduled_publish_task_executes_due_release_and_notifies_creator(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        project_id, _runtime_id = await project_context_ids(client, workspace_id)
        await _prepare_publishable_release(client, project_id)
        scheduled_at = datetime.now(tz=UTC) + timedelta(minutes=5)

        publish_res = await client.post(
            f"/api/v1/projects/{project_id}/releases/publish",
            json={"scheduledAt": scheduled_at.isoformat()},
        )
        assert publish_res.status_code == 200, publish_res.text
        release_id = decode_public_id(publish_res.json()["data"]["release"]["id"])
        due_at = datetime.now(tz=UTC) - timedelta(minutes=1)
        async with _tenant_conn(workspace_id) as conn:
            await ContentReleaseRecord.filter(id=release_id).using_db(conn).update(scheduled_at=due_at)
        await PublishJobRecord.filter(release_id=release_id).update(scheduled_at=due_at)

        processed = await check_scheduled_publishes()
        assert processed == 1

        async with _tenant_conn(workspace_id) as conn:
            release = await ContentReleaseRecord.filter(id=release_id).using_db(conn).first()
        assert release is not None
        job = await PublishJobRecord.get(release_id=release.id)
        assert release.status == ContentReleaseStatus.ACTIVE
        assert release.is_active is True
        assert release.activated_at is not None
        assert job.status == PublishJobStatus.COMPLETED
        assert job.completed_at is not None
        notification = await NotificationRecord.get_or_none(event_name="project.release.scheduled_publish.completed")
        assert notification is not None
        assert notification.workspace_id == release.workspace_id
