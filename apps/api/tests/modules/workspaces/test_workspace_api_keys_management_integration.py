from __future__ import annotations

import asyncio
from uuid import UUID, uuid4

import pytest

from src.common.utils.public_ids import decode_public_id
from src.config import get_settings
from src.models.projects.api_key import ApiKeyRecord
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
        assert created["secretToken"] not in str(created_event.properties)

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
        assert rotated["secretToken"] not in str(rotated_event.properties)

        revoke_res = await client.post(f"/api/v1/projects/{project_id}/api-keys/{key_id}/revoke")
        assert revoke_res.status_code == 200, revoke_res.text
        assert revoke_res.json()["data"]["revokedAt"] is not None
        revoked_event = await _wait_latest_workspace_audit_event(
            event_name="project.api_key.revoked",
            workspace_id=workspace_uuid,
            entity_id=decode_public_id(key_id),
        )
        assert revoked_event.properties["key_family"] == "workspace_service"
        assert revoked_event.properties["project_id"] == str(decode_public_id(project_id))

        activity_res = await client.get(
            f"/api/v1/workspaces/{workspace_id}/activity"
            f"?eventName=project.api_key.&entityType=api_key&entityId={key_id}&page=1&size=10"
        )
        assert activity_res.status_code == 200, activity_res.text
        activity_items = activity_res.json()["data"]["items"]
        activity_event_names = [entry["eventName"] for entry in activity_items]
        assert set(activity_event_names[:3]) == {
            "project.api_key.created",
            "project.api_key.rotated",
            "project.api_key.revoked",
        }
        assert all(entry["entityId"] == key_id for entry in activity_items[:3])
        assert created["secretToken"] not in str(activity_items)
        assert rotated["secretToken"] not in str(activity_items)

        from src.models.analytics.audit_event import AuditEvent
        from src.modules.projects.api_keys import service as api_key_service_module

        original_write_required_activity_event = api_key_service_module.write_required_activity_event

        async def _failing_write_required_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
            if payload.event_name.startswith("project.api_key."):
                raise RuntimeError(f"forced activity write failure: {payload.event_name}")
            return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

        monkeypatch.setattr(
            "src.modules.projects.api_keys.service.write_required_activity_event",
            _failing_write_required_activity_event,
        )

        event_count_before = await AuditEvent.filter(event_name__startswith="project.api_key.").count()
        key_count_before = await ApiKeyRecord.filter(workspace_id=workspace_uuid).count()

        failed_create_res = await client.post(
            f"/api/v1/projects/{project_id}/api-keys",
            json={**_project_api_key_payload(), "name": "Rollback Worker"},
        )
        assert failed_create_res.status_code == 500, failed_create_res.text
        assert await ApiKeyRecord.filter(workspace_id=workspace_uuid).count() == key_count_before
        assert await AuditEvent.filter(event_name__startswith="project.api_key.").count() == event_count_before

        monkeypatch.setattr(
            "src.modules.projects.api_keys.service.write_required_activity_event",
            original_write_required_activity_event,
        )
        rotate_seed_res = await client.post(
            f"/api/v1/projects/{project_id}/api-keys",
            json={**_project_api_key_payload(), "name": "Rotate Seed"},
        )
        assert rotate_seed_res.status_code == 200, rotate_seed_res.text
        rotate_seed = rotate_seed_res.json()["data"]
        rotate_seed_id = rotate_seed["key"]["id"]
        rotate_seed_public_id = rotate_seed["key"]["tokenPublicId"]

        monkeypatch.setattr(
            "src.modules.projects.api_keys.service.write_required_activity_event",
            _failing_write_required_activity_event,
        )
        key_count_before = await ApiKeyRecord.filter(workspace_id=workspace_uuid).count()
        event_count_before = await AuditEvent.filter(event_name__startswith="project.api_key.").count()
        failed_rotate_res = await client.post(f"/api/v1/projects/{project_id}/api-keys/{rotate_seed_id}/rotate")
        assert failed_rotate_res.status_code == 500, failed_rotate_res.text
        rotate_seed_record = await ApiKeyRecord.get(id=decode_public_id(rotate_seed_id))
        assert rotate_seed_record.token_public_id == rotate_seed_public_id
        assert await ApiKeyRecord.filter(workspace_id=workspace_uuid).count() == key_count_before
        assert await AuditEvent.filter(event_name__startswith="project.api_key.").count() == event_count_before

        monkeypatch.setattr(
            "src.modules.projects.api_keys.service.write_required_activity_event",
            original_write_required_activity_event,
        )
        revoke_seed_res = await client.post(
            f"/api/v1/projects/{project_id}/api-keys",
            json={**_project_api_key_payload(), "name": "Revoke Seed"},
        )
        assert revoke_seed_res.status_code == 200, revoke_seed_res.text
        revoke_seed_id = revoke_seed_res.json()["data"]["key"]["id"]

        monkeypatch.setattr(
            "src.modules.projects.api_keys.service.write_required_activity_event",
            _failing_write_required_activity_event,
        )
        key_count_before = await ApiKeyRecord.filter(workspace_id=workspace_uuid).count()
        event_count_before = await AuditEvent.filter(event_name__startswith="project.api_key.").count()
        failed_revoke_res = await client.post(f"/api/v1/projects/{project_id}/api-keys/{revoke_seed_id}/revoke")
        assert failed_revoke_res.status_code == 500, failed_revoke_res.text
        revoke_seed_record = await ApiKeyRecord.get(id=decode_public_id(revoke_seed_id))
        assert revoke_seed_record.revoked_at is None
        assert await ApiKeyRecord.filter(workspace_id=workspace_uuid).count() == key_count_before
        assert await AuditEvent.filter(event_name__startswith="project.api_key.").count() == event_count_before

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


@pytest.mark.asyncio
async def test_project_api_key_routes_are_site_scoped_per_project(
    monkeypatch,
    tmp_path,
    prepared_db,
    integration_valkey_settings,
) -> None:
    monkeypatch.setenv("SECURITY__MASTER_KEY_PATH", str(tmp_path / "master.key"))
    get_settings.cache_clear()
    ensure_master_key(get_settings().security.master_key_path)

    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        create_project_res = await client.post(
            "/api/v1/projects",
            json={
                "workspaceId": workspace_id,
                "name": "Second Project",
                "slug": f"second-project-{uuid4().hex[:8]}",
            },
        )
        assert create_project_res.status_code == 201, create_project_res.text
        second_project_id = create_project_res.json()["data"]["id"]

        second_create_res = await client.post(
            f"/api/v1/projects/{second_project_id}/api-keys",
            json=_project_api_key_payload(),
        )
        assert second_create_res.status_code == 200, second_create_res.text
        second_key_id = second_create_res.json()["data"]["key"]["id"]

        first_list_res = await client.get(f"/api/v1/projects/{project_id}/api-keys")
        assert first_list_res.status_code == 200, first_list_res.text
        assert first_list_res.json()["data"]["items"] == []

        first_detail_res = await client.get(f"/api/v1/projects/{project_id}/api-keys/{second_key_id}")
        assert first_detail_res.status_code == 404, first_detail_res.text
        assert first_detail_res.json()["error"] == "API_KEY_NOT_FOUND"

        first_revoke_res = await client.post(f"/api/v1/projects/{project_id}/api-keys/{second_key_id}/revoke")
        assert first_revoke_res.status_code == 404, first_revoke_res.text
        assert first_revoke_res.json()["error"] == "API_KEY_NOT_FOUND"

        first_rotate_res = await client.post(f"/api/v1/projects/{project_id}/api-keys/{second_key_id}/rotate")
        assert first_rotate_res.status_code == 404, first_rotate_res.text
        assert first_rotate_res.json()["error"] == "API_KEY_NOT_FOUND"

    get_settings.cache_clear()
