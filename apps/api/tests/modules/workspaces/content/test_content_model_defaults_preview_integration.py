from __future__ import annotations

from uuid import uuid4

import pytest

from apps.api.src.common.utils.public_ids import decode_public_id
from apps.api.src.models.content._enums import (
    ContentBootstrapPresetState,
    ContentItemStatus,
    ContentItemVisibility,
    ContentShapeState,
)
from apps.api.src.models.content.content_item import ContentItemRecord
from apps.api.src.models.content.model_definition import ContentModelDefinitionRecord
from apps.api.tests.modules.workspaces.content.test_content_items_integration import (
    _wait_latest_workspace_audit_event,
)
from apps.api.tests.modules.workspaces.content.test_content_models_integration import (
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
        model = await ContentModelDefinitionRecord.get(id=decode_public_id(model_id))

        await _seed_model_item(
            workspace_id=workspace_id,
            model_key=model.key,
            model_id=model_id,
            site_id=model.site_id,
            title="First Article",
            resolved_role="article",
            resolved_posture="structured",
            resolved_surface="structured",
        )
        await _seed_model_item(
            workspace_id=workspace_id,
            model_key=model.key,
            model_id=model_id,
            site_id=model.site_id,
            title="Second Article",
            resolved_role="article",
            resolved_posture="structured",
            resolved_surface="structured",
        )

        preview = await _preview_model_update(
            client,
            workspace_id=workspace_id,
            model_id=model_id,
            payload={
                "defaultSurface": "writing",
                "defaultPosture": "entry",
            },
        )
        assert preview["affectedItemsCount"] == 2
        assert preview["recoveryItemsCount"] == 0
        assert preview["reshapeItemsCount"] == 2
        assert preview["hasBlockingChanges"] is False
        assert isinstance(preview["previewToken"], str)
        assert preview["previewToken"]
        assert preview["impact"]["hasBreakingChanges"] is False


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
            "defaultSurface": "writing",
            "defaultPosture": "entry",
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
async def test_content_model_blocking_preview_prevents_patch(
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
        model = await ContentModelDefinitionRecord.get(id=decode_public_id(model_id))

        await _seed_model_item(
            workspace_id=workspace_id,
            model_key=model.key,
            model_id=model_id,
            site_id=model.site_id,
            title="Blocking Article",
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

        patch_response = await client.patch(
            f"/api/v1/workspaces/{workspace_id}/content/models/{model_id}",
            json={
                "defaultSurface": None,
                "impactPreviewToken": preview["previewToken"],
            },
        )
        assert patch_response.status_code == 409, patch_response.text
        assert patch_response.json()["error"] == "CONTENT_MODEL_IMPACT_PREVIEW_BLOCKING"


@pytest.mark.asyncio
async def test_content_model_patch_emits_model_default_audit_event(
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
        model = await ContentModelDefinitionRecord.get(id=model_uuid)

        await _seed_model_item(
            workspace_id=workspace_id,
            model_key=model.key,
            model_id=model_id,
            site_id=model.site_id,
            title="Audited Article",
            resolved_role="article",
            resolved_posture="structured",
            resolved_surface="structured",
        )

        preview = await _preview_model_update(
            client,
            workspace_id=workspace_id,
            model_id=model_id,
            payload={
                "defaultSurface": "writing",
                "defaultPosture": "entry",
                "starterPackPolicy": {"mode": "optional"},
                "surfacePolicy": {"writing": {"enabled": True}},
            },
        )
        patch_response = await client.patch(
            f"/api/v1/workspaces/{workspace_id}/content/models/{model_id}",
            json={
                "defaultSurface": "writing",
                "defaultPosture": "entry",
                "starterPackPolicy": {"mode": "optional"},
                "surfacePolicy": {"writing": {"enabled": True}},
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
        assert event.properties["impact_preview"]["affected_items_count"] == 1
        assert event.properties["impact_preview"]["recovery_items_count"] == 0
        assert event.properties["impact_preview"]["reshape_items_count"] == 1
        assert event.properties["impact_preview"]["has_blocking_changes"] is False
        assert event.properties["default_changes"]["default_surface"] == {
            "before": "structured",
            "after": "writing",
        }
        assert event.properties["default_changes"]["default_posture"] == {
            "before": "structured",
            "after": "entry",
        }
        assert event.properties["default_changes"]["starter_pack_policy"] == {
            "before": None,
            "after": {"mode": "optional"},
        }
        assert event.properties["default_changes"]["surface_policy"] == {
            "before": None,
            "after": {"writing.enabled": True},
        }
