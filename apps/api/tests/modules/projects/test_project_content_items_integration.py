from __future__ import annotations

from uuid import UUID

import pytest

from src.common.utils.public_ids import decode_public_id
from src.models.content._enums import ContentItemStatus, ContentVersionState
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from tests.modules.projects.helpers import (
    project_page_draft_payload,
    setup_project_publishable_items,
)
from tests.modules.workspaces.content.test_content_items_integration import (
    _approve_content_item_for_publish,
    _workspace_client,
)

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_project_content_items_bulk_publish_and_unpublish(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
        first_item_id, second_item_id = await setup_project_publishable_items(client, project_id)

        for item_id, title, path in [
            (first_item_id, "Home", "/"),
            (second_item_id, "About", "/about"),
        ]:
            draft_res = await client.post(
                f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
                json=project_page_draft_payload(title, path=path),
            )
            assert draft_res.status_code == 201, draft_res.text
            await _approve_content_item_for_publish(client, project_id, item_id)

        publish_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/bulk/publish",
            json={"itemIds": [first_item_id, second_item_id]},
        )
        assert publish_res.status_code == 200, publish_res.text
        published_items = publish_res.json()["data"]["items"]
        assert [item["itemId"] for item in published_items] == [first_item_id, second_item_id]
        assert [item["versionNumber"] for item in published_items] == [1, 1]
        assert [item["state"] for item in published_items] == ["published", "published"]

        first_uuid = UUID(str(decode_public_id(first_item_id)))
        second_uuid = UUID(str(decode_public_id(second_item_id)))
        first_row = await ContentItemRecord.get(id=first_uuid)
        second_row = await ContentItemRecord.get(id=second_uuid)
        assert first_row.status == ContentItemStatus.PUBLISHED
        assert second_row.status == ContentItemStatus.PUBLISHED
        assert first_row.published_version == 1
        assert second_row.published_version == 1

        unpublish_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/bulk/unpublish",
            json={"itemIds": [first_item_id, second_item_id]},
        )
        assert unpublish_res.status_code == 200, unpublish_res.text
        unpublished_items = unpublish_res.json()["data"]["items"]
        assert [item["itemId"] for item in unpublished_items] == [first_item_id, second_item_id]
        assert [item["state"] for item in unpublished_items] == ["draft", "draft"]

        first_row = await ContentItemRecord.get(id=first_uuid)
        second_row = await ContentItemRecord.get(id=second_uuid)
        assert first_row.status == ContentItemStatus.DRAFT
        assert second_row.status == ContentItemStatus.DRAFT
        assert first_row.published_version is None
        assert second_row.published_version is None

        first_version = await ContentVersionRecord.get(item_id=first_uuid, version=1)
        second_version = await ContentVersionRecord.get(item_id=second_uuid, version=1)
        assert first_version.state == ContentVersionState.DRAFT
        assert second_version.state == ContentVersionState.DRAFT
