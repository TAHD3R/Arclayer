from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

from src.common.utils.public_ids import decode_public_id
from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_platform_app
from src.models.content._enums import PublishJobStatus, PublishJobType
from src.models.content.publish_job import PublishJobRecord
from src.modules.platform_identity.http import get_current_platform_session
from tests.modules.projects.helpers import project_context_ids
from tests.modules.workspaces.content.test_content_items_integration import _workspace_client
from tests.modules.workspaces.publish.test_publish_releases_integration import _prepare_publishable_tree
from tests.modules.workspaces.publish.test_scheduled_publish_integration import _publish_current_draft

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_system_jobs_list_filters_publish_jobs(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        project_id, _runtime_id = await project_context_ids(client, workspace_id)
        root_item_id, child_item_id = await _prepare_publishable_tree(client, project_id)
        await _publish_current_draft(client, project_id, root_item_id, "Home", path="/")
        await _publish_current_draft(client, project_id, child_item_id, "About", path="/about")
        scheduled_at = datetime.now(tz=UTC) + timedelta(hours=1)

        publish_res = await client.post(
            f"/api/v1/projects/{project_id}/releases/publish",
            json={"scheduledAt": scheduled_at.isoformat()},
        )
        assert publish_res.status_code == 200, publish_res.text
        job_id = publish_res.json()["data"]["job"]["id"]
        await PublishJobRecord.filter(id=decode_public_id(job_id)).update(
            status=PublishJobStatus.FAILED, error_message="boom"
        )
        job = await PublishJobRecord.get(id=decode_public_id(job_id))

    async def _platform_owner():
        return SimpleNamespace(actor_id=job.created_by_user_id, is_instance_owner=True)

    app = create_platform_app()
    app.dependency_overrides[get_current_platform_session] = _platform_owner
    transport = ASGITransport(app=app)
    async with app.router.lifespan_context(app):
        await verify_db_ready(get_settings())
        async with AsyncClient(transport=transport, base_url="http://test") as system_client:
            res = await system_client.get(
                "/platform-api/v1/jobs?status=failed&jobType=scheduled_publish&page=1&size=20"
            )

    assert res.status_code == 200, res.text
    page = res.json()["data"]
    assert page["total"] == 1
    item = page["items"][0]
    assert item["id"] == job_id
    assert item["status"] == PublishJobStatus.FAILED
    assert item["jobType"] == PublishJobType.SCHEDULED_PUBLISH
