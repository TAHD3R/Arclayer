from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.common.utils.public_ids import encode_uuid
from src.models.projects.membership import ProjectMemberRole
from src.modules.projects.authz.schema import ProjectAuthzSnapshot, ProjectPermissionActionOut
from src.modules.projects.authz.service import get_project_authz_snapshot
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.permissions.service import (
    get_project_action_codes_for_role,
    get_project_permission_codes_for_role,
)
from src.modules.workspaces.http.schema import WorkspaceAccessType


def _project_context() -> ProjectRequestContext:
    return ProjectRequestContext(
        project_id=uuid4(),
        workspace_id=uuid4(),
        organization_id=uuid4(),
        runtime_id=uuid4(),
        access_type=WorkspaceAccessType.MEMBER,
        org_membership_id=uuid4(),
        is_org_owner=True,
        workspace_membership_id=uuid4(),
    )


def test_project_authz_snapshot_uses_project_scope_and_camel_case_output() -> None:
    project_id = uuid4()
    user_id = uuid4()

    snapshot = ProjectAuthzSnapshot(
        project_id=project_id,
        user_id=user_id,
        role_codes=["owner"],
        permission_codes=["system:site:manage"],
        is_superuser=False,
    )

    payload = snapshot.model_dump(mode="json", by_alias=True)

    assert payload == {
        "projectId": encode_uuid(project_id),
        "userId": encode_uuid(user_id),
        "scope": "project",
        "roleCodes": ["owner"],
        "permissionCodes": ["system:site:manage"],
        "isSuperuser": False,
    }


def test_project_permission_action_out_uses_project_shape() -> None:
    item = ProjectPermissionActionOut(
        code="project:settings:manage",
        description="Manage project-level settings.",
        subject_kinds=["workspace_member", "personal_api_key"],
        permission_codes=["system:settings:manage"],
    )

    assert item.model_dump(mode="json", by_alias=True) == {
        "code": "project:settings:manage",
        "description": "Manage project-level settings.",
        "subjectKinds": ["workspace_member", "personal_api_key"],
        "permissionCodes": ["system:settings:manage"],
    }


def test_project_role_permission_mapping_uses_project_member_role() -> None:
    owner_actions = set(get_project_action_codes_for_role(ProjectMemberRole.OWNER))
    editor_actions = set(get_project_action_codes_for_role(ProjectMemberRole.EDITOR))
    viewer_actions = set(get_project_action_codes_for_role(ProjectMemberRole.VIEWER))
    owner_permissions = set(get_project_permission_codes_for_role(ProjectMemberRole.OWNER))
    editor_permissions = set(get_project_permission_codes_for_role(ProjectMemberRole.EDITOR))
    viewer_permissions = set(get_project_permission_codes_for_role(ProjectMemberRole.VIEWER))

    assert "project:settings:read" in owner_actions
    assert "project:settings:manage" in owner_actions
    assert "project:team:members:read" in owner_actions
    assert "project:team:roles:manage" in owner_actions
    assert "project:settings:manage" not in editor_actions
    assert "project:team:roles:manage" not in editor_actions
    assert "project:settings:read" in viewer_actions
    assert "project:team:members:read" in viewer_actions
    assert "project:api-keys:manage" in owner_actions
    assert "project:api-keys:manage" not in editor_actions
    assert "project:automation:manage" in owner_actions
    assert "project:automation:manage" not in editor_actions

    assert "system:settings:manage" in owner_permissions
    assert "team:members:roles:manage" in owner_permissions
    assert "system:keys:manage" in owner_permissions
    assert "admin:users:write" not in owner_permissions
    assert "system:settings:manage" not in editor_permissions
    assert "system:content:manage" in editor_permissions
    assert "team:members:roles:manage" not in editor_permissions
    assert "system:keys:manage" not in editor_permissions
    assert "system:content:manage" not in viewer_permissions
    assert "system:settings:read" in viewer_permissions
    assert "team:members:read" in viewer_permissions
    assert "team:members:roles:manage" not in viewer_permissions


@pytest.mark.asyncio
async def test_get_project_authz_snapshot_reads_project_membership(monkeypatch: pytest.MonkeyPatch) -> None:
    ctx = _project_context()
    user_id = uuid4()
    expected_user_id = user_id

    async def fake_get_membership(*, project_id, user_id):
        assert project_id == ctx.project_id
        assert user_id == expected_user_id
        return SimpleNamespace(role=ProjectMemberRole.EDITOR)

    monkeypatch.setattr(
        "src.modules.projects.authz.service.ProjectMembership.get_or_none",
        fake_get_membership,
    )

    snapshot = await get_project_authz_snapshot(ctx=ctx, user_id=user_id)

    assert snapshot.project_id == ctx.project_id
    assert snapshot.user_id == user_id
    assert snapshot.scope == "project"
    assert snapshot.role_codes == ["editor"]
    assert set(snapshot.permission_codes) == set(get_project_permission_codes_for_role(ProjectMemberRole.EDITOR))
    assert "team:members:roles:manage" not in snapshot.permission_codes
    assert "admin:users:write" not in snapshot.permission_codes
    assert snapshot.is_superuser is False


@pytest.mark.asyncio
async def test_get_project_authz_snapshot_owner_has_explicit_grants_without_superuser(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ctx = _project_context()
    user_id = uuid4()
    expected_user_id = user_id

    async def fake_get_membership(*, project_id, user_id):
        assert project_id == ctx.project_id
        assert user_id == expected_user_id
        return SimpleNamespace(role=ProjectMemberRole.OWNER)

    monkeypatch.setattr(
        "src.modules.projects.authz.service.ProjectMembership.get_or_none",
        fake_get_membership,
    )

    snapshot = await get_project_authz_snapshot(ctx=ctx, user_id=user_id)

    assert snapshot.role_codes == ["owner"]
    assert "system:settings:manage" in snapshot.permission_codes
    assert "system:keys:manage" in snapshot.permission_codes
    assert snapshot.is_superuser is False


@pytest.mark.asyncio
async def test_get_project_authz_snapshot_without_membership_returns_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    ctx = _project_context()
    user_id = uuid4()
    expected_user_id = user_id

    async def fake_get_membership(*, project_id, user_id):
        assert project_id == ctx.project_id
        assert user_id == expected_user_id
        return None

    monkeypatch.setattr(
        "src.modules.projects.authz.service.ProjectMembership.get_or_none",
        fake_get_membership,
    )

    snapshot = await get_project_authz_snapshot(ctx=ctx, user_id=user_id)

    assert snapshot.project_id == ctx.project_id
    assert snapshot.role_codes == []
    assert snapshot.permission_codes == []
    assert snapshot.is_superuser is False
