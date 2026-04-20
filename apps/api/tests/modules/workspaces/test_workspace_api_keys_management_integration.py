from __future__ import annotations

import asyncio
from uuid import UUID

import pytest

from src.common.utils.public_ids import decode_public_id
from src.config import get_settings
from src.settings.crypto import ensure_master_key
from tests.modules.workspaces.content.test_content_items_integration import (
    _wait_latest_workspace_audit_event,
    _workspace_client,
)

pytestmark = pytest.mark.integration


async def _wait_latest_audit_event(
    *,
    event_name: str,
    entity_id: UUID | None = None,
    timeout_seconds: float = 3.0,
):
    from src.models.analytics.audit_event import AuditEvent

    deadline = asyncio.get_running_loop().time() + timeout_seconds
    while True:
        query = AuditEvent.filter(event_name=event_name)
        if entity_id is not None:
            query = query.filter(entity_id=entity_id)
        row = await query.order_by("-occurred_at", "-id").first()
        if row is not None:
            return row
        if asyncio.get_running_loop().time() >= deadline:
            recent = await AuditEvent.filter(event_name__icontains="api_key").order_by("-occurred_at", "-id").limit(5)
            snapshot = [
                {
                    "actor_user_id": str(item.actor_user_id) if item.actor_user_id is not None else None,
                    "entity_id": str(item.entity_id) if item.entity_id is not None else None,
                    "event_name": item.event_name,
                    "organization_id": str(item.organization_id) if item.organization_id is not None else None,
                    "workspace_id": str(item.workspace_id) if item.workspace_id is not None else None,
                }
                for item in recent
            ]
            raise AssertionError(f"expected audit event not found: {event_name}; recent_api_key_events={snapshot}")
        await asyncio.sleep(0.1)


def _personal_payload() -> dict:
    return {
        "name": "CLI Personal Key",
        "description": "Used by local scripts",
        "scopes": ["content.read", "settings.read"],
    }


def _project_api_key_payload() -> dict:
    return {
        "family": "workspace_service",
        "name": "Deploy Worker",
        "description": "Used by deployment worker",
        "scopes": ["content.read", "content.write", "keys.read"],
    }


@pytest.mark.asyncio
async def test_personal_api_key_management_flow(
    monkeypatch, tmp_path, prepared_db, integration_valkey_settings
) -> None:
    monkeypatch.setenv("SECURITY__MASTER_KEY_PATH", str(tmp_path / "master.key"))
    get_settings.cache_clear()
    ensure_master_key(get_settings().security.master_key_path)

    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, _project_id):
        create_res = await client.post("/api/v1/me/api-keys", json=_personal_payload())
        assert create_res.status_code == 200, create_res.text
        created = create_res.json()["data"]
        key_id = created["key"]["id"]
        assert created["secretToken"].startswith("ark_mgmt_")
        assert created["key"]["family"] == "personal_management"
        created_event = await _wait_latest_audit_event(
            event_name="me.api_key.created",
            entity_id=decode_public_id(key_id),
        )
        assert created_event.properties["key_family"] == "personal_management"

        list_res = await client.get("/api/v1/me/api-keys")
        assert list_res.status_code == 200, list_res.text
        items = list_res.json()["data"]["items"]
        assert len(items) == 1
        assert items[0]["id"] == key_id
        assert "secretToken" not in items[0]

        detail_res = await client.get(f"/api/v1/me/api-keys/{key_id}")
        assert detail_res.status_code == 200, detail_res.text
        assert detail_res.json()["data"]["tokenMask"].startswith("ark_mgmt_")

        rotate_res = await client.post(f"/api/v1/me/api-keys/{key_id}/rotate")
        assert rotate_res.status_code == 200, rotate_res.text
        rotated = rotate_res.json()["data"]
        assert rotated["key"]["id"] == key_id
        assert rotated["secretToken"].startswith("ark_mgmt_")
        assert rotated["key"]["tokenPublicId"] != created["key"]["tokenPublicId"]
        rotated_event = await _wait_latest_audit_event(
            event_name="me.api_key.rotated",
            entity_id=decode_public_id(key_id),
        )
        assert rotated_event.properties["key_family"] == "personal_management"

        revoke_res = await client.post(f"/api/v1/me/api-keys/{key_id}/revoke")
        assert revoke_res.status_code == 200, revoke_res.text
        assert revoke_res.json()["data"]["revokedAt"] is not None
        revoked_event = await _wait_latest_audit_event(
            event_name="me.api_key.revoked",
            entity_id=decode_public_id(key_id),
        )
        assert revoked_event.properties["key_family"] == "personal_management"

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_project_api_key_management_flow(monkeypatch, tmp_path, prepared_db, integration_valkey_settings) -> None:
    monkeypatch.setenv("SECURITY__MASTER_KEY_PATH", str(tmp_path / "master.key"))
    get_settings.cache_clear()
    ensure_master_key(get_settings().security.master_key_path)

    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        workspace_uuid = decode_public_id(workspace_id)
        create_res = await client.post(f"/api/v1/projects/{project_id}/api-keys", json=_project_api_key_payload())
        assert create_res.status_code == 200, create_res.text
        created = create_res.json()["data"]
        key_id = created["key"]["id"]
        assert created["secretToken"].startswith("ark_ws_")
        assert created["key"]["family"] == "workspace_service"
        assert created["key"]["workspaceId"] == workspace_id
        created_event = await _wait_latest_workspace_audit_event(
            event_name="project.api_key.created",
            workspace_id=workspace_uuid,
            entity_id=decode_public_id(key_id),
        )
        assert created_event.properties["key_family"] == "workspace_service"

        list_res = await client.get(f"/api/v1/projects/{project_id}/api-keys")
        assert list_res.status_code == 200, list_res.text
        items = list_res.json()["data"]["items"]
        assert len(items) == 1
        assert items[0]["id"] == key_id

        detail_res = await client.get(f"/api/v1/projects/{project_id}/api-keys/{key_id}")
        assert detail_res.status_code == 200, detail_res.text
        assert detail_res.json()["data"]["tokenMask"].startswith("ark_ws_")

        rotate_res = await client.post(f"/api/v1/projects/{project_id}/api-keys/{key_id}/rotate")
        assert rotate_res.status_code == 200, rotate_res.text
        rotated = rotate_res.json()["data"]
        assert rotated["key"]["id"] == key_id
        assert rotated["secretToken"].startswith("ark_ws_")
        rotated_event = await _wait_latest_workspace_audit_event(
            event_name="project.api_key.rotated",
            workspace_id=workspace_uuid,
            entity_id=decode_public_id(key_id),
        )
        assert rotated_event.properties["key_family"] == "workspace_service"

        revoke_res = await client.post(f"/api/v1/projects/{project_id}/api-keys/{key_id}/revoke")
        assert revoke_res.status_code == 200, revoke_res.text
        assert revoke_res.json()["data"]["revokedAt"] is not None
        revoked_event = await _wait_latest_workspace_audit_event(
            event_name="project.api_key.revoked",
            workspace_id=workspace_uuid,
            entity_id=decode_public_id(key_id),
        )
        assert revoked_event.properties["key_family"] == "workspace_service"

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_workspace_delivery_key_requires_delivery_scope_and_perspective(
    monkeypatch,
    tmp_path,
    prepared_db,
    integration_valkey_settings,
) -> None:
    monkeypatch.setenv("SECURITY__MASTER_KEY_PATH", str(tmp_path / "master.key"))
    get_settings.cache_clear()
    ensure_master_key(get_settings().security.master_key_path)

    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        missing_perspective_res = await client.post(
            f"/api/v1/projects/{project_id}/api-keys",
            json={
                "family": "delivery",
                "name": "Preview Runtime",
                "scopes": ["delivery.read"],
            },
        )
        assert missing_perspective_res.status_code == 400, missing_perspective_res.text
        assert missing_perspective_res.json()["error"] == "DELIVERY_KEY_PERSPECTIVE_REQUIRED"

        valid_res = await client.post(
            f"/api/v1/projects/{project_id}/api-keys",
            json={
                "family": "delivery",
                "name": "Preview Runtime",
                "scopes": ["delivery.read", "graphql.read"],
                "deliveryPerspective": "preview",
            },
        )
        assert valid_res.status_code == 200, valid_res.text
        created = valid_res.json()["data"]
        assert created["secretToken"].startswith("ark_deliv_")
        assert created["key"]["deliveryPerspective"] == "preview"

    get_settings.cache_clear()
