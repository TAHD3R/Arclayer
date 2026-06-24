from __future__ import annotations

import pytest

from src.common.utils.public_ids import decode_public_id
from src.models.analytics.audit_event import AuditEvent
from src.models.system.rbac import SystemRole, SystemRolePermission
from src.modules.workspaces.rbac import service as workspace_rbac_service_module
from tests.modules.workspaces.content.test_content_items_integration import (
    _wait_latest_workspace_audit_event,
    _workspace_client,
)

pytestmark = pytest.mark.integration


async def test_workspace_rbac_configuration_activity_readback_and_rollback(
    prepared_db,
    integration_valkey_settings,
    monkeypatch,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, _project_id):
        workspace_uuid = decode_public_id(workspace_id)
        role_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/rbac/roles",
            json={
                "code": "ops_manager",
                "name": "Operations Manager",
                "description": "Sensitive role description",
                "templateRoleCode": "viewer",
            },
        )
        assert role_res.status_code == 200, role_res.text
        role_id = role_res.json()["data"]["id"]

        created_event = await _wait_latest_workspace_audit_event(
            event_name="system.settings.rbac.updated",
            workspace_id=workspace_uuid,
        )
        assert created_event.entity_type == "workspace_role"
        assert created_event.properties["change_kind"] == "role_created"
        assert created_event.properties["role_code"] == "ops_manager"
        assert created_event.properties["template_role_code"] == "viewer"
        assert "Operations Manager" not in str(created_event.properties)
        assert "Sensitive role description" not in str(created_event.properties)

        update_res = await client.patch(
            f"/api/v1/workspaces/{workspace_id}/rbac/roles/ops_manager",
            json={
                "name": "Operations Manager Updated",
                "description": "Updated sensitive role description",
            },
        )
        assert update_res.status_code == 200, update_res.text
        updated_event = await _wait_latest_workspace_audit_event(
            event_name="system.settings.rbac.updated",
            workspace_id=created_event.workspace_id,
            entity_id=created_event.entity_id,
        )
        assert updated_event.properties["change_kind"] == "role_updated"
        assert updated_event.properties["changed_fields"] == ["description", "name"]
        assert "Operations Manager Updated" not in str(updated_event.properties)
        assert "Updated sensitive role description" not in str(updated_event.properties)

        set_permission_roles_res = await client.put(
            f"/api/v1/workspaces/{workspace_id}/rbac/permissions/rbac:permissions:read/roles",
            json={"roleCodes": ["ops_manager"]},
        )
        assert set_permission_roles_res.status_code == 200, set_permission_roles_res.text
        permission_event = await _wait_latest_workspace_audit_event(
            event_name="system.settings.rbac.updated",
            workspace_id=created_event.workspace_id,
        )
        assert permission_event.entity_type == "workspace_permission"
        assert permission_event.properties["change_kind"] == "permission_roles_set"
        assert permission_event.properties["permission_code"] == "rbac:permissions:read"
        assert permission_event.properties["role_codes"] == ["ops_manager"]

        set_role_permissions_res = await client.put(
            f"/api/v1/workspaces/{workspace_id}/rbac/roles/ops_manager/permissions",
            json={"permissionCodes": ["rbac:roles:read", "rbac:permissions:read"]},
        )
        assert set_role_permissions_res.status_code == 200, set_role_permissions_res.text
        role_permissions_event = await _wait_latest_workspace_audit_event(
            event_name="system.settings.rbac.updated",
            workspace_id=created_event.workspace_id,
            entity_id=created_event.entity_id,
        )
        assert role_permissions_event.properties["change_kind"] == "role_permissions_set"
        assert role_permissions_event.properties["permission_codes"] == [
            "rbac:permissions:read",
            "rbac:roles:read",
        ]

        activity_res = await client.get(
            f"/api/v1/workspaces/{workspace_id}/activity?eventName=system.settings.rbac.updated&page=1&size=10"
        )
        assert activity_res.status_code == 200, activity_res.text
        event_names = [entry["eventName"] for entry in activity_res.json()["data"]["items"]]
        assert event_names[:4] == [
            "system.settings.rbac.updated",
            "system.settings.rbac.updated",
            "system.settings.rbac.updated",
            "system.settings.rbac.updated",
        ]

        original_write_required_activity_event = workspace_rbac_service_module.write_required_activity_event

        async def _failing_rbac_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
            if payload.event_name == "system.settings.rbac.updated":
                raise RuntimeError("forced activity write failure: system.settings.rbac.updated")
            return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

        monkeypatch.setattr(
            workspace_rbac_service_module,
            "write_required_activity_event",
            _failing_rbac_activity_event,
        )
        event_count_before = await AuditEvent.filter(event_name="system.settings.rbac.updated").count()
        rollback_create_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/rbac/roles",
            json={"code": "rollback_role", "name": "Rollback SystemRole"},
        )
        assert rollback_create_res.status_code == 500, rollback_create_res.text
        assert await AuditEvent.filter(event_name="system.settings.rbac.updated").count() == event_count_before
        assert not await SystemRole.filter(code="rollback_role").exists()

        rollback_permissions_res = await client.put(
            f"/api/v1/workspaces/{workspace_id}/rbac/roles/ops_manager/permissions",
            json={"permissionCodes": ["rbac:roles:read"]},
        )
        assert rollback_permissions_res.status_code == 500, rollback_permissions_res.text
        assert await AuditEvent.filter(event_name="system.settings.rbac.updated").count() == event_count_before
        persisted_role = await SystemRole.get(id=created_event.entity_id)
        persisted_permission_codes = sorted(
            await SystemRolePermission.filter(role_id=persisted_role.id).values_list("permission__code", flat=True)
        )
        assert persisted_permission_codes == ["rbac:permissions:read", "rbac:roles:read"]

        monkeypatch.setattr(
            workspace_rbac_service_module,
            "write_required_activity_event",
            original_write_required_activity_event,
        )

        delete_res = await client.delete(f"/api/v1/workspaces/{workspace_id}/rbac/roles/ops_manager")
        assert delete_res.status_code == 200, delete_res.text
        deleted_event = await _wait_latest_workspace_audit_event(
            event_name="system.settings.rbac.updated",
            workspace_id=created_event.workspace_id,
            entity_id=created_event.entity_id,
        )
        assert deleted_event.properties["change_kind"] == "role_deleted"
        assert deleted_event.properties["deleted"] is True
        assert not await SystemRole.filter(id=decode_public_id(role_id)).exists()
