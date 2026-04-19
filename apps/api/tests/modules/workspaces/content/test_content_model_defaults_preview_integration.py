from __future__ import annotations

from uuid import uuid4

import pytest

from src.common.utils.public_ids import decode_public_id
from src.models.content._enums import (
    ContentBootstrapPresetState,
    ContentItemStatus,
    ContentItemVisibility,
    ContentShapeState,
)
from src.models.content.content_item import ContentItemRecord
from tests.modules.workspaces.content.test_content_items_integration import (
    _wait_latest_workspace_audit_event,
)
from tests.modules.workspaces.content.test_content_models_integration import (
    _blank_first_create_payload,
    _preview_model_update,
    _workspace_client,
)

pytestmark = pytest.mark.integration


async def _seed_model_item(
    *,
    workspace_id: str,
    model_key: str,
    model_id: str,
    site_id,
    title: str,
    resolved_role: str,
    resolved_posture: str,
    resolved_surface: str,
    shape_state: str = str(ContentShapeState.READY),
    shape_reason_code: str | None = None,
) -> ContentItemRecord:
    return await ContentItemRecord.create(
        workspace_id=decode_public_id(workspace_id),
        site_id=site_id,
        model_definition_id=decode_public_id(model_id),
        slug=f"{model_key}-{uuid4().hex[:8]}",
        title=title,
        locale="en-US",
        status=ContentItemStatus.DRAFT,
        visibility=ContentItemVisibility.PUBLIC,
        bootstrap_preset_key=None,
        bootstrap_preset_state=ContentBootstrapPresetState.NONE,
        capability_pack_ids=[],
        resolved_role=resolved_role,
        resolved_posture=resolved_posture,
        resolved_surface=resolved_surface,
        shape_state=shape_state,
        shape_reason_code=shape_reason_code,
        shape_reason_meta=None,
    )


@pytest.mark.asyncio
async def test_content_model_impact_preview_returns_counts_and_preview_token(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        create_response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_blank_first_create_payload(),
        )
        assert create_response.status_code == 201, create_response.text
        model_payload = create_response.json()["data"]
        model_id = model_payload["id"]
        preview = await _preview_model_update(
            client,
            workspace_id=workspace_id,
            model_id=model_id,
            payload={
                "fields": [
                    {
                        "key": "reading_time_minutes",
                        "label": "Reading Time",
                        "scalar": "number",
                        "required": False,
                    }
                ],
            },
        )
        assert preview["affectedItemsCount"] == 0
        assert preview["recoveryItemsCount"] == 0
        assert preview["reshapeItemsCount"] == 0
        assert preview["hasBlockingChanges"] is False
        assert isinstance(preview["previewToken"], str)
        assert preview["previewToken"]
        assert preview["impact"]["hasBreakingChanges"] is False
        assert preview["changePlan"]["revisions"] == {
            "currentDraftRevision": 1,
            "publishedRevision": 1,
            "nextDraftRevision": 2,
        }
        assert preview["changePlan"]["currentSnapshot"]["stage"] == "current_draft"
        assert preview["changePlan"]["nextSnapshot"]["stage"] == "next_draft"
        assert preview["changePlan"]["publishedSnapshot"]["stage"] == "published"
        assert preview["changePlan"]["diff"]["hasChanges"] is True
        assert preview["changePlan"]["diff"]["entries"][0]["target"] == "fields.reading_time_minutes"
        assert preview["changePlan"]["applyReady"] is True
        assert any(
            gate["code"] == "revision_delta" and gate["status"] == "review"
            for gate in preview["changePlan"]["applyGates"]
        )


@pytest.mark.asyncio
async def test_content_model_patch_requires_valid_preview_token(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        create_response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_blank_first_create_payload(),
        )
        assert create_response.status_code == 201, create_response.text
        model_id = create_response.json()["data"]["id"]
        payload = {
            "fields": [
                {
                    "key": "reading_time_minutes",
                    "label": "Reading Time",
                    "scalar": "number",
                    "required": False,
                }
            ],
        }

        missing_preview_response = await client.patch(
            f"/api/v1/workspaces/{workspace_id}/content/models/{model_id}",
            json=payload,
        )
        assert missing_preview_response.status_code == 409, missing_preview_response.text
        assert missing_preview_response.json()["error"] == "CONTENT_MODEL_IMPACT_PREVIEW_REQUIRED"

        invalid_preview_response = await client.patch(
            f"/api/v1/workspaces/{workspace_id}/content/models/{model_id}",
            json={
                **payload,
                "impactPreviewToken": "invalid.preview.token",
            },
        )
        assert invalid_preview_response.status_code == 409, invalid_preview_response.text
        assert invalid_preview_response.json()["error"] == "CONTENT_MODEL_IMPACT_PREVIEW_TOKEN_INVALID"


@pytest.mark.asyncio
async def test_content_model_impact_preview_blocks_apply_when_defaults_break_item_truth(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        create_response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_blank_first_create_payload(),
        )
        assert create_response.status_code == 201, create_response.text
        model_payload = create_response.json()["data"]
        model_id = model_payload["id"]
        model_site_id = decode_public_id(model_payload["siteId"])

        await _seed_model_item(
            workspace_id=workspace_id,
            model_key="article",
            model_id=model_id,
            site_id=model_site_id,
            title="Existing Article",
            resolved_role="article",
            resolved_posture="structured",
            resolved_surface="structured",
        )

        preview = await _preview_model_update(
            client,
            workspace_id=workspace_id,
            model_id=model_id,
            payload={"defaultSurface": None},
        )

        assert preview["affectedItemsCount"] == 1
        assert preview["recoveryItemsCount"] == 1
        assert preview["reshapeItemsCount"] == 0
        assert preview["hasBlockingChanges"] is True
        assert preview["changePlan"]["applyReady"] is False
        assert any(
            gate["code"] == "continuation_recovery" and gate["status"] == "blocked"
            for gate in preview["changePlan"]["applyGates"]
        )
        assert any(
            entry["target"] == "defaults.default_surface" and entry["operation"] == "removed"
            for entry in preview["changePlan"]["diff"]["entries"]
        )


@pytest.mark.asyncio
async def test_content_model_locked_system_fields_are_rejected(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        create_response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_blank_first_create_payload(),
        )
        assert create_response.status_code == 201, create_response.text
        model_id = create_response.json()["data"]["id"]
        patch_response = await client.patch(
            f"/api/v1/workspaces/{workspace_id}/content/models/{model_id}",
            json={"name": "Renamed Article"},
        )
        assert patch_response.status_code == 409, patch_response.text
        assert patch_response.json()["error"] == "CONTENT_MODEL_SYSTEM_FIELD_LOCKED"


@pytest.mark.asyncio
async def test_content_model_patch_emits_model_contract_audit_event(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        create_response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_blank_first_create_payload(),
        )
        assert create_response.status_code == 201, create_response.text
        model_id = create_response.json()["data"]["id"]
        model_uuid = decode_public_id(model_id)
        workspace_uuid = decode_public_id(workspace_id)
        preview = await _preview_model_update(
            client,
            workspace_id=workspace_id,
            model_id=model_id,
            payload={
                "description": "Article extensions",
                "fields": [
                    {
                        "key": "reading_time_minutes",
                        "label": "Reading Time",
                        "scalar": "number",
                        "required": False,
                    }
                ],
            },
        )
        patch_response = await client.patch(
            f"/api/v1/workspaces/{workspace_id}/content/models/{model_id}",
            json={
                "description": "Article extensions",
                "fields": [
                    {
                        "key": "reading_time_minutes",
                        "label": "Reading Time",
                        "scalar": "number",
                        "required": False,
                    }
                ],
                "impactPreviewToken": preview["previewToken"],
            },
        )
        assert patch_response.status_code == 200, patch_response.text

        event = await _wait_latest_workspace_audit_event(
            event_name="workspace.content.model.updated",
            workspace_id=workspace_uuid,
            entity_id=model_uuid,
        )
        assert event.properties is not None
        assert event.properties["model_key"] == "article"
        assert event.properties["draft_contract_revision"] == 2
        assert event.properties["published_contract_revision"] == 1
        assert event.properties["impact_preview"]["affected_items_count"] == 0
        assert event.properties["impact_preview"]["recovery_items_count"] == 0
        assert event.properties["impact_preview"]["reshape_items_count"] == 0
        assert event.properties["impact_preview"]["has_blocking_changes"] is False
        assert event.properties["default_changes"] == {}
