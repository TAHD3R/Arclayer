from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.config import get_settings
from src.models.analytics.audit_event import AuditEvent
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.system.access_restriction import AccessRestrictionReasonCategory
from src.models.system.rbac import SystemRole
from src.models.system.setting import SettingRecord
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipRole
from src.modules.access_restrictions.schema import AccessRestrictionEnforceRequest
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password
from src.modules.organization.repository import OrganizationRepository
from src.modules.organization.workspaces import service as org_workspaces_service_module
from src.modules.organization.workspaces.schema import OrganizationWorkspaceCreateRequest
from src.modules.organization.workspaces.service import build_organization_workspace_service
from src.modules.system.rbac.constants.service import ROLE_EDITOR, ROLE_VIEWER
from src.modules.workspaces import service as workspace_service_module
from src.modules.workspaces.authz.role_management import WorkspaceRoleManagementAvailability
from src.modules.workspaces.schema import WorkspaceUpdateRequest
from src.modules.workspaces.service import WorkspaceService
from src.modules.workspaces.settings import service as workspace_settings_service_module
from src.modules.workspaces.settings.service import WorkspaceSettingsService

pytestmark = pytest.mark.integration


async def test_workspace_create_activity_readback_and_rollback(db_schema, monkeypatch) -> None:
    _ = db_schema
    settings = get_settings()
    service = build_organization_workspace_service(settings)
    org_repo = OrganizationRepository()
    user_repo = UserRepository()

    org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Workspace Create Org")
    owner = await user_repo.create_user(
        username=f"owner_{uuid4().hex[:8]}",
        email=f"owner_{uuid4().hex[:8]}@example.com",
        display_name="Owner",
        password_hash=hash_password("owner_pass_123", settings.auth),
    )
    await OrgMembership.create(
        organization_id=org.id,
        user_id=owner.id,
        role=OrgRole.OWNER,
        role_code=OrgRole.OWNER.value,
        status="active",
    )

    created = await service.create_workspace(
        organization_id=org.id,
        user_id=owner.id,
        payload=OrganizationWorkspaceCreateRequest(
            name="Created Workspace",
            description="Created description",
        ),
    )

    event = await AuditEvent.filter(
        event_name="workspace.created",
        organization_id=org.id,
        workspace_id=created.workspace_id,
        actor_user_id=owner.id,
        entity_type="workspace",
        entity_id=created.workspace_id,
    ).first()
    assert event is not None
    assert event.properties["created"] is True
    assert event.properties["initialized_settings"] == ["content_strategy"]
    assert "Created Workspace" not in str(event.properties)
    assert "Created description" not in str(event.properties)

    workspace = await Workspace.get(id=created.workspace_id)
    membership = await WorkspaceMembership.get(workspace_id=workspace.id, user_id=owner.id)
    assert workspace.owner_user_id == owner.id
    assert not await WorkspaceMembershipRole.filter(membership_id=membership.id).exists()
    assert not await SystemRole.filter(workspace_id=workspace.id, code="owner").exists()
    assert await SettingRecord.filter(scope_type="workspace", scope_id=workspace.id, namespace="core").exists()

    original_write_required_activity_event = org_workspaces_service_module.write_required_activity_event

    async def _failing_create_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
        if payload.event_name == "workspace.created":
            raise RuntimeError("forced activity write failure: workspace.created")
        return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

    monkeypatch.setattr(
        "src.modules.organization.workspaces.service.write_required_activity_event",
        _failing_create_activity_event,
    )
    event_count_before = await AuditEvent.filter(event_name="workspace.created").count()
    with pytest.raises(RuntimeError, match="forced activity write failure: workspace.created"):
        await service.create_workspace(
            organization_id=org.id,
            user_id=owner.id,
            payload=OrganizationWorkspaceCreateRequest(name="Rollback Create Workspace"),
        )

    assert await AuditEvent.filter(event_name="workspace.created").count() == event_count_before
    assert not await Workspace.filter(organization_id=org.id, name="Rollback Create Workspace").exists()


async def test_workspace_update_activity_readback_and_rollback(db_schema, monkeypatch) -> None:
    _ = db_schema
    settings = get_settings()
    service = WorkspaceService(settings)
    org_repo = OrganizationRepository()
    user_repo = UserRepository()

    org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Workspace Org")
    owner = await user_repo.create_user(
        username=f"owner_{uuid4().hex[:8]}",
        email=f"owner_{uuid4().hex[:8]}@example.com",
        display_name="Owner",
        password_hash=hash_password("owner_pass_123", settings.auth),
    )
    await OrgMembership.create(
        organization_id=org.id,
        user_id=owner.id,
        role=OrgRole.OWNER,
        role_code=OrgRole.OWNER.value,
        status="active",
    )
    workspace = await Workspace.create(
        organization_id=org.id,
        name="Original Workspace",
        description="Original description",
        is_active=True,
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
    )

    await service.update_workspace(
        organization_id=org.id,
        workspace_id=workspace.id,
        actor_user_id=owner.id,
        payload=WorkspaceUpdateRequest(
            name="Updated Workspace",
            description="Updated description",
            icon_color="#123456",
        ),
    )

    event = await AuditEvent.filter(
        event_name="workspace.updated",
        organization_id=org.id,
        workspace_id=workspace.id,
        actor_user_id=owner.id,
        entity_type="workspace",
        entity_id=workspace.id,
    ).first()
    assert event is not None
    assert event.properties["updated_fields"] == ["description", "icon_color", "name"]
    assert "Updated Workspace" not in str(event.properties)
    assert "Updated description" not in str(event.properties)

    original_write_required_activity_event = workspace_service_module.write_required_activity_event

    async def _failing_write_required_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
        if payload.event_name == "workspace.updated":
            raise RuntimeError("forced activity write failure: workspace.updated")
        return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

    monkeypatch.setattr(
        "src.modules.workspaces.service.write_required_activity_event",
        _failing_write_required_activity_event,
    )

    event_count_before = await AuditEvent.filter(event_name="workspace.updated").count()
    with pytest.raises(RuntimeError, match="forced activity write failure: workspace.updated"):
        await service.update_workspace(
            organization_id=org.id,
            workspace_id=workspace.id,
            actor_user_id=owner.id,
            payload=WorkspaceUpdateRequest(name="Rolled Back Workspace"),
        )

    refetched_workspace = await Workspace.get(id=workspace.id)
    assert await AuditEvent.filter(event_name="workspace.updated").count() == event_count_before
    assert refetched_workspace.name == "Updated Workspace"
    assert refetched_workspace.description == "Updated description"


async def test_workspace_archive_delete_activity_readback_and_rollback(db_schema, monkeypatch) -> None:
    _ = db_schema
    settings = get_settings()
    service = build_organization_workspace_service(settings)
    org_repo = OrganizationRepository()
    user_repo = UserRepository()

    org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Workspace Lifecycle Org")
    owner = await user_repo.create_user(
        username=f"owner_{uuid4().hex[:8]}",
        email=f"owner_{uuid4().hex[:8]}@example.com",
        display_name="Owner",
        password_hash=hash_password("owner_pass_123", settings.auth),
    )
    await OrgMembership.create(
        organization_id=org.id,
        user_id=owner.id,
        role=OrgRole.OWNER,
        role_code=OrgRole.OWNER.value,
        status="active",
    )
    archive_workspace = await Workspace.create(
        organization_id=org.id,
        name="Archive Workspace",
        is_active=True,
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
    )
    rollback_archive_workspace = await Workspace.create(
        organization_id=org.id,
        name="Rollback Archive Workspace",
        is_active=True,
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
    )

    archive_payload = AccessRestrictionEnforceRequest(
        expected_revision=0,
        reason_category=AccessRestrictionReasonCategory.OTHER,
        reason_code="owner_archive",
        operator_note="Owner requested archive",
    )

    await service.archive_workspace(
        organization_id=org.id,
        workspace_id=archive_workspace.id,
        user_id=owner.id,
        idempotency_key="archive-workspace",
        payload=archive_payload,
    )

    archived_event = await AuditEvent.filter(
        event_name="workspace.archived",
        organization_id=org.id,
        workspace_id=archive_workspace.id,
        actor_user_id=owner.id,
        entity_type="workspace",
        entity_id=archive_workspace.id,
    ).first()
    assert archived_event is not None
    assert archived_event.properties["archived"] is True

    original_write_required_activity_event = org_workspaces_service_module.write_required_activity_event

    async def _failing_archive_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
        if payload.event_name == "workspace.archived":
            raise RuntimeError("forced activity write failure: workspace.archived")
        return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

    monkeypatch.setattr(
        "src.modules.organization.workspaces.service.write_required_activity_event",
        _failing_archive_activity_event,
    )
    event_count_before = await AuditEvent.filter(event_name="workspace.archived").count()
    with pytest.raises(RuntimeError, match="forced activity write failure: workspace.archived"):
        await service.archive_workspace(
            organization_id=org.id,
            workspace_id=rollback_archive_workspace.id,
            user_id=owner.id,
            idempotency_key="rollback-archive-workspace",
            payload=archive_payload,
        )
    await rollback_archive_workspace.refresh_from_db()
    assert await AuditEvent.filter(event_name="workspace.archived").count() == event_count_before
    assert rollback_archive_workspace.archived_at is None
    assert rollback_archive_workspace.archived_by_user_id is None

    monkeypatch.setattr(
        "src.modules.organization.workspaces.service.write_required_activity_event",
        original_write_required_activity_event,
    )
    delete_workspace = await Workspace.create(
        organization_id=org.id,
        name="Delete Workspace",
        is_active=True,
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
    )
    delete_workspace.archived_at = archive_workspace.archived_at
    delete_workspace.archived_by_user_id = owner.id
    await delete_workspace.save(update_fields=["archived_at", "archived_by_user_id", "updated_at"])

    await service.delete_workspace(
        organization_id=org.id,
        workspace_id=delete_workspace.id,
        user_id=owner.id,
        confirm_name="Delete Workspace",
    )
    deleted_event = await AuditEvent.filter(
        event_name="workspace.deleted",
        organization_id=org.id,
        workspace_id=delete_workspace.id,
        actor_user_id=owner.id,
        entity_type="workspace",
        entity_id=delete_workspace.id,
    ).first()
    assert deleted_event is not None
    assert deleted_event.properties["deleted"] is True
    assert not await Workspace.filter(id=delete_workspace.id).exists()

    rollback_delete_workspace = await Workspace.create(
        organization_id=org.id,
        name="Rollback Delete Workspace",
        is_active=True,
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
    )
    rollback_delete_workspace.archived_at = archive_workspace.archived_at
    rollback_delete_workspace.archived_by_user_id = owner.id
    await rollback_delete_workspace.save(update_fields=["archived_at", "archived_by_user_id", "updated_at"])

    async def _failing_delete_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
        if payload.event_name == "workspace.deleted":
            raise RuntimeError("forced activity write failure: workspace.deleted")
        return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

    monkeypatch.setattr(
        "src.modules.organization.workspaces.service.write_required_activity_event",
        _failing_delete_activity_event,
    )
    event_count_before = await AuditEvent.filter(event_name="workspace.deleted").count()
    with pytest.raises(RuntimeError, match="forced activity write failure: workspace.deleted"):
        await service.delete_workspace(
            organization_id=org.id,
            workspace_id=rollback_delete_workspace.id,
            user_id=owner.id,
            confirm_name="Rollback Delete Workspace",
        )
    assert await AuditEvent.filter(event_name="workspace.deleted").count() == event_count_before
    assert await Workspace.filter(id=rollback_delete_workspace.id).exists()


async def test_workspace_role_policy_activity_readback_and_rollback(db_schema, monkeypatch) -> None:
    _ = db_schema
    settings = get_settings()
    workspace_lifecycle_service = build_organization_workspace_service(settings)
    settings_service = WorkspaceSettingsService(
        settings,
        role_management_reader=cast(
            Any,
            SimpleNamespace(
                get_availability=AsyncMock(
                    return_value=WorkspaceRoleManagementAvailability(
                        workspace_id=uuid4(),
                        plan_revision_id=uuid4(),
                        commercial_access_state="normal",
                        included=True,
                    )
                )
            ),
        ),
    )
    org_repo = OrganizationRepository()
    user_repo = UserRepository()

    org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Workspace SystemRole Policy Org")
    owner = await user_repo.create_user(
        username=f"owner_{uuid4().hex[:8]}",
        email=f"owner_{uuid4().hex[:8]}@example.com",
        display_name="Owner",
        password_hash=hash_password("owner_pass_123", settings.auth),
    )
    member = await user_repo.create_user(
        username=f"member_{uuid4().hex[:8]}",
        email=f"member_{uuid4().hex[:8]}@example.com",
        display_name="Member",
        password_hash=hash_password("member_pass_123", settings.auth),
    )
    await OrgMembership.create(
        organization_id=org.id,
        user_id=owner.id,
        role=OrgRole.OWNER,
        role_code=OrgRole.OWNER.value,
        status="active",
    )
    created = await workspace_lifecycle_service.create_workspace(
        organization_id=org.id,
        user_id=owner.id,
        payload=OrganizationWorkspaceCreateRequest(name="Role Policy Workspace"),
    )
    workspace_id = created.workspace_id
    member_membership = await WorkspaceMembership.create(workspace_id=workspace_id, user_id=member.id)

    await settings_service.patch_role_policy(
        workspace_id=workspace_id,
        default_role_code=ROLE_EDITOR,
        actor_user_id=owner.id,
    )

    default_event = (
        await AuditEvent
        .filter(
            event_name="permission.assignment.changed",
            workspace_id=workspace_id,
            actor_user_id=owner.id,
            entity_type="workspace_role_policy",
            entity_id=workspace_id,
        )
        .order_by("-created_at")
        .first()
    )
    assert default_event is not None
    assert default_event.properties["change"] == "default_role"
    assert default_event.properties["previous_default_role_code"] == ROLE_VIEWER
    assert default_event.properties["default_role_code"] == ROLE_EDITOR

    await settings_service.assign_role_to_regular_members(
        workspace_id=workspace_id,
        role_code=ROLE_EDITOR,
        confirm_name="Role Policy Workspace",
        actor_user_id=owner.id,
    )

    assign_event = (
        await AuditEvent
        .filter(
            event_name="permission.assignment.changed",
            workspace_id=workspace_id,
            actor_user_id=owner.id,
            entity_type="workspace_role_policy",
            entity_id=workspace_id,
        )
        .order_by("-created_at")
        .first()
    )
    assert assign_event is not None
    assert assign_event.properties["change"] == "regular_member_role_assignment"
    assert assign_event.properties["role_code"] == ROLE_EDITOR
    assert assign_event.properties["updated_count"] == 1
    editor_role = await SystemRole.get(workspace_id=workspace_id, code=ROLE_EDITOR)
    assert await WorkspaceMembershipRole.filter(membership_id=member_membership.id, role_id=editor_role.id).exists()

    original_write_required_activity_event = workspace_settings_service_module.write_required_activity_event

    async def _failing_role_policy_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
        if payload.event_name == "permission.assignment.changed":
            raise RuntimeError("forced activity write failure: permission.assignment.changed")
        return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

    monkeypatch.setattr(
        "src.modules.workspaces.settings.service.write_required_activity_event",
        _failing_role_policy_activity_event,
    )
    event_count_before = await AuditEvent.filter(event_name="permission.assignment.changed").count()
    with pytest.raises(RuntimeError, match="forced activity write failure: permission.assignment.changed"):
        await settings_service.patch_role_policy(
            workspace_id=workspace_id,
            default_role_code=ROLE_VIEWER,
            actor_user_id=owner.id,
        )

    assert await AuditEvent.filter(event_name="permission.assignment.changed").count() == event_count_before
    assert (await SystemRole.get(workspace_id=workspace_id, code=ROLE_EDITOR)).is_default is True
    assert (await SystemRole.get(workspace_id=workspace_id, code=ROLE_VIEWER)).is_default is False

    viewer_role = await SystemRole.get(workspace_id=workspace_id, code=ROLE_VIEWER)
    with pytest.raises(RuntimeError, match="forced activity write failure: permission.assignment.changed"):
        await settings_service.assign_role_to_regular_members(
            workspace_id=workspace_id,
            role_code=ROLE_VIEWER,
            confirm_name="Role Policy Workspace",
            actor_user_id=owner.id,
        )

    assert await AuditEvent.filter(event_name="permission.assignment.changed").count() == event_count_before
    assert await WorkspaceMembershipRole.filter(membership_id=member_membership.id, role_id=editor_role.id).exists()
    assert not await WorkspaceMembershipRole.filter(membership_id=member_membership.id, role_id=viewer_role.id).exists()
