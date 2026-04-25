from __future__ import annotations

from uuid import UUID

import pytest

from src.common.utils.public_ids import decode_public_id
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from tests.modules.projects.helpers import (
    create_project_page_model,
    create_project_publishable_page_item,
    project_page_draft_payload,
    publish_project_item_version,
)
from tests.modules.workspaces.content.test_content_items_integration import _workspace_client

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_project_content_version_compare_and_restore_to_draft(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
        await create_project_page_model(client, project_id)
        item_id = await create_project_publishable_page_item(client, project_id, title="Home")

        await publish_project_item_version(
            client,
            project_id,
            item_id,
            title="Home v1",
            path="/",
        )
        draft_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
            json=project_page_draft_payload("Home v2", path="/home", expected_version=1),
        )
        assert draft_res.status_code == 201, draft_res.text

        compare_res = await client.get(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/1/compare/2",
        )
        assert compare_res.status_code == 200, compare_res.text
        changes = compare_res.json()["data"]["changes"]
        assert {change["path"] for change in changes} >= {
            "fields.title",
            "fields.path",
            "presentations.form_data",
            "presentations.visual_blueprint",
            "presentations.seo",
        }

        restore_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/1/restore",
            json={},
        )
        assert restore_res.status_code == 201, restore_res.text
        restored = restore_res.json()["data"]
        assert restored["versionNumber"] == 3
        assert restored["state"] == "draft"
        assert restored["fieldsSnapshot"]["title"] == "Home v1"
        assert restored["fieldsSnapshot"]["path"] == "/"

        item_uuid = UUID(str(decode_public_id(item_id)))
        item = await ContentItemRecord.get(id=item_uuid)
        assert item.draft_version == 3
        assert item.published_version == 1

        version = await ContentVersionRecord.get(item_id=item_uuid, version=3)
        assert version.fields_snapshot["title"] == "Home v1"
