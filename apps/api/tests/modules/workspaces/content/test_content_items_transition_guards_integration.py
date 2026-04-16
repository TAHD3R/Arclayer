from __future__ import annotations

import pytest

from src.common.utils.public_ids import decode_public_id
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from tests.modules.workspaces.content.test_content_items_integration import (
    _draft_payload,
    _item_payload,
    _model_payload,
    _workspace_client,
)

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_content_items_reject_duplicate_presentation_kind_payload(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        model_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_model_payload(),
        )
        assert model_res.status_code == 201, model_res.text

        item_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        duplicate_payload = _draft_payload()
        duplicate_payload["presentations"].append({"kind": "form_data", "payload": {"duplicate": True}})
        draft_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/draft",
            json=duplicate_payload,
        )
        assert draft_res.status_code == 409, draft_res.text
        assert draft_res.json()["error"] == "CONTENT_PRESENTATION_DUPLICATE_KIND"


@pytest.mark.asyncio
async def test_content_items_keep_published_status_when_transitioning_non_live_version(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        model_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_model_payload(),
        )
        assert model_res.status_code == 201, model_res.text

        item_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        first_draft_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/draft",
            json=_draft_payload(),
        )
        assert first_draft_res.status_code == 201, first_draft_res.text

        publish_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/publish",
            json={},
        )
        assert publish_res.status_code == 200, publish_res.text

        second_draft_payload = _draft_payload()
        second_draft_payload["expectedVersion"] = 1
        second_draft_payload["changeSummary"] = "second draft"
        second_draft_payload["fieldsSnapshot"]["body"] = "Second draft body"
        second_draft_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/draft",
            json=second_draft_payload,
        )
        assert second_draft_res.status_code == 201, second_draft_res.text
        assert second_draft_res.json()["data"]["versionNumber"] == 2

        schedule_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/2/schedule",
            json={},
        )
        assert schedule_res.status_code == 200, schedule_res.text

        item_uuid = decode_public_id(item_id)
        item_after_schedule = await ContentItemRecord.get(id=item_uuid)
        assert item_after_schedule.published_version == 1
        assert str(item_after_schedule.status) == "published"

        archive_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/2/archive",
            json={},
        )
        assert archive_res.status_code == 200, archive_res.text

        item_after_archive = await ContentItemRecord.get(id=item_uuid)
        assert item_after_archive.published_version == 1
        assert str(item_after_archive.status) == "published"


@pytest.mark.asyncio
async def test_content_items_archive_live_version_clears_published_pointer(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        model_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_model_payload(),
        )
        assert model_res.status_code == 201, model_res.text

        item_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        draft_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/draft",
            json=_draft_payload(),
        )
        assert draft_res.status_code == 201, draft_res.text

        publish_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/publish",
            json={},
        )
        assert publish_res.status_code == 200, publish_res.text

        archive_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/archive",
            json={},
        )
        assert archive_res.status_code == 200, archive_res.text
        assert archive_res.json()["data"]["state"] == "archived"

        item_uuid = decode_public_id(item_id)
        item = await ContentItemRecord.get(id=item_uuid)
        assert item.published_version is None
        assert str(item.status) == "archived"


@pytest.mark.asyncio
async def test_content_items_unarchive_live_archived_version_restores_draft(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        model_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_model_payload(),
        )
        assert model_res.status_code == 201, model_res.text

        item_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        draft_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/draft",
            json=_draft_payload(),
        )
        assert draft_res.status_code == 201, draft_res.text

        publish_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/publish",
            json={},
        )
        assert publish_res.status_code == 200, publish_res.text

        archive_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/archive",
            json={},
        )
        assert archive_res.status_code == 200, archive_res.text
        assert archive_res.json()["data"]["status"] == "archived"

        unarchive_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/unarchive",
            json={},
        )
        assert unarchive_res.status_code == 200, unarchive_res.text
        assert unarchive_res.json()["data"]["status"] == "draft"
        assert unarchive_res.json()["data"].get("publishedVersion") is None

        item_uuid = decode_public_id(item_id)
        item = await ContentItemRecord.get(id=item_uuid)
        version = await ContentVersionRecord.get(item_id=item_uuid, version=1)
        assert str(item.status) == "draft"
        assert item.published_version is None
        assert str(version.state) == "draft"


@pytest.mark.asyncio
async def test_content_items_patch_draft_propagates_actor_audit_fields(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        model_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_model_payload(),
        )
        assert model_res.status_code == 201, model_res.text

        item_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]
        item_uuid = decode_public_id(item_id)

        draft_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/draft",
            json=_draft_payload(),
        )
        assert draft_res.status_code == 201, draft_res.text
        await ContentItemRecord.filter(id=item_uuid).update(updated_by_user_id=None)
        await ContentVersionRecord.filter(item_id=item_uuid, version=1).update(last_transition_by_user_id=None)

        patch_res = await client.patch(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1",
            json={"changeSummary": "patch draft"},
        )
        assert patch_res.status_code == 200, patch_res.text
        assert patch_res.json()["data"]["lastTransitionByUserId"] is not None

        item = await ContentItemRecord.get(id=item_uuid)
        version = await ContentVersionRecord.get(item_id=item_uuid, version=1)
        assert item.updated_by_user_id is not None
        assert version.last_transition_by_user_id is not None


@pytest.mark.asyncio
async def test_content_items_publish_rejects_missing_required_official_system_fields(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        model_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_model_payload(),
        )
        assert model_res.status_code == 201, model_res.text

        item_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        invalid_draft = _draft_payload()
        invalid_draft["fieldsSnapshot"].pop("slug", None)
        invalid_draft["presentations"][0]["payload"].pop("slug", None)
        draft_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/draft",
            json=invalid_draft,
        )
        assert draft_res.status_code == 201, draft_res.text

        publish_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/publish",
            json={},
        )
        assert publish_res.status_code == 409, publish_res.text
        assert publish_res.json()["error"] == "CONTENT_PUBLISH_VALIDATION_FAILED"
        assert publish_res.json()["meta"]["reasons"] == [
            {
                "code": "REQUIRED_SYSTEM_FIELD_MISSING",
                "fieldKey": "slug",
            }
        ]


@pytest.mark.asyncio
async def test_content_items_publish_rejects_disallowed_official_presentation_kind(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        model_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_model_payload(),
        )
        assert model_res.status_code == 201, model_res.text

        item_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        invalid_draft = _draft_payload()
        invalid_draft["presentations"].append({"kind": "visual_blueprint", "payload": {"root": "page"}})
        draft_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/draft",
            json=invalid_draft,
        )
        assert draft_res.status_code == 201, draft_res.text

        publish_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/publish",
            json={},
        )
        assert publish_res.status_code == 409, publish_res.text
        assert publish_res.json()["error"] == "CONTENT_PUBLISH_VALIDATION_FAILED"
        assert publish_res.json()["meta"]["reasons"] == [
            {
                "code": "PRESENTATION_KIND_NOT_ALLOWED",
                "kind": "visual_blueprint",
            }
        ]
