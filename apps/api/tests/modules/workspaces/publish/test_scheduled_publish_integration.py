from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, cast

import pytest

from src.common.utils.public_ids import decode_public_id, encode_uuid
from src.models.analytics.audit_event import AuditEvent
from src.models.content._enums import ContentReleaseStatus, PublishJobStatus
from src.models.content.publish_job import PublishJobRecord
from src.models.content.release import ContentReleaseRecord
from src.models.system.notification import NotificationRecord
from src.modules.projects.publish.jobs import service as publish_job_service_module
from src.modules.projects.publish.jobs.service import PublishJobService
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


@pytest.mark.asyncio
async def test_scheduled_publish_task_failure_writes_deployment_failed_and_rolls_back(
    prepared_db,
    integration_valkey_settings,
    monkeypatch,
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

        async with _tenant_conn(workspace_id) as conn:
            release = await ContentReleaseRecord.filter(id=release_id).using_db(conn).first()
        assert release is not None
        job = await PublishJobRecord.get(release_id=release.id)

        class _FailingPublishService:
            async def activate_scheduled_release(self, *, workspace_id, site_id, release, activated_at):  # type: ignore[no-untyped-def]
                _ = workspace_id
                _ = site_id
                _ = release
                _ = activated_at
                raise RuntimeError("forced deployment failure: activate_scheduled_release")

        service = PublishJobService(
            publish_service_factory=cast(Any, lambda tenant_context: _FailingPublishService()),
        )
        event_count_before = await AuditEvent.filter(event_name="deployment.failed").count()

        with pytest.raises(RuntimeError, match="forced deployment failure: activate_scheduled_release"):
            await service.execute_scheduled_release(release_id=release_id)

        failed_event = await AuditEvent.filter(event_name="deployment.failed", entity_id=job.id).first()
        assert failed_event is not None
        assert failed_event.actor_user_id == release.created_by_user_id
        assert failed_event.entity_type == "deployment"
        assert failed_event.properties["failure_kind"] == "RuntimeError"
        assert failed_event.properties["job_type"] == "scheduled_publish"
        assert failed_event.properties["release_id"] == str(release.id)
        assert failed_event.properties["status"] == "failed"
        assert await AuditEvent.filter(event_name="deployment.failed").count() == event_count_before + 1
        failed_job = await PublishJobRecord.get(id=job.id)
        assert failed_job.status == PublishJobStatus.FAILED
        async with _tenant_conn(workspace_id) as conn:
            reloaded_release = await ContentReleaseRecord.filter(id=release.id).using_db(conn).first()
        assert reloaded_release is not None
        assert reloaded_release.status == ContentReleaseStatus.SCHEDULED

        activity_res = await client.get(
            f"/api/v1/workspaces/{workspace_id}/activity"
            f"?eventName=deployment.failed&entityType=deployment&entityId={encode_uuid(job.id)}&page=1&size=10"
        )
        assert activity_res.status_code == 200, activity_res.text
        activity_items = activity_res.json()["data"]["items"]
        assert len(activity_items) == 1
        assert activity_items[0]["eventName"] == "deployment.failed"
        assert activity_items[0]["entityType"] == "deployment"
        assert activity_items[0]["entityId"] == encode_uuid(job.id)

        second_publish_res = await client.post(
            f"/api/v1/projects/{project_id}/releases/publish",
            json={"scheduledAt": scheduled_at.isoformat()},
        )
        assert second_publish_res.status_code == 200, second_publish_res.text
        second_release_id = decode_public_id(second_publish_res.json()["data"]["release"]["id"])
        async with _tenant_conn(workspace_id) as conn:
            await ContentReleaseRecord.filter(id=second_release_id).using_db(conn).update(scheduled_at=due_at)
        await PublishJobRecord.filter(release_id=second_release_id).update(scheduled_at=due_at)

        original_write_required_activity_event = publish_job_service_module.write_required_activity_event

        async def _failing_write_required_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
            if payload.event_name == "deployment.failed":
                raise RuntimeError("forced activity write failure: deployment.failed")
            return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

        monkeypatch.setattr(
            "src.modules.projects.publish.jobs.service.write_required_activity_event",
            _failing_write_required_activity_event,
        )
        second_job = await PublishJobRecord.get(release_id=second_release_id)
        with pytest.raises(RuntimeError, match="forced activity write failure: deployment.failed"):
            await service.execute_scheduled_release(release_id=second_release_id)
        monkeypatch.setattr(
            "src.modules.projects.publish.jobs.service.write_required_activity_event",
            original_write_required_activity_event,
        )

        assert await AuditEvent.filter(event_name="deployment.failed", entity_id=second_job.id).count() == 0
        rolled_back_job = await PublishJobRecord.get(id=second_job.id)
        assert rolled_back_job.status == PublishJobStatus.RUNNING
        async with _tenant_conn(workspace_id) as conn:
            rolled_back_release = await ContentReleaseRecord.filter(id=second_release_id).using_db(conn).first()
        assert rolled_back_release is not None
        assert rolled_back_release.status == ContentReleaseStatus.SCHEDULED
