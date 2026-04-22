from __future__ import annotations

from uuid import uuid4

import pytest

from src.common.utils.public_ids import encode_uuid
from src.models.workspaces.workspace import WorkspaceKind
from src.modules.projects.authz.schema import ProjectAuthzSnapshot, ProjectPermissionActionOut
from src.modules.projects.authz.service import get_project_authz_snapshot, project_context_to_workspace_context
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.workspaces.authz.schema import AuthzSnapshot
from src.modules.workspaces.http.schema import WorkspaceAccessType


def _project_context() -> ProjectRequestContext:
    return ProjectRequestContext(
        project_id=uuid4(),
        workspace_id=uuid4(),
        organization_id=uuid4(),
        runtime_id=uuid4(),
        workspace_kind=WorkspaceKind.TEAM,
        access_type=WorkspaceAccessType.MEMBER,
        org_membership_id=uuid4(),
        is_org_owner=True,
        workspace_membership_id=uuid4(),
        visible_only=False,
        is_creator_admin=True,
    )


def test_project_authz_snapshot_uses_project_scope_and_camel_case_output() -> None:
    project_id = uuid4()
    workspace_id = uuid4()
    user_id = uuid4()

    snapshot = ProjectAuthzSnapshot(
        project_id=project_id,
        workspace_id=workspace_id,
        user_id=user_id,
        role_codes=["owner"],
        permission_codes=["system:site:manage"],
        is_superuser=False,
    )

    payload = snapshot.model_dump(mode="json", by_alias=True)

    assert payload == {
        "projectId": encode_uuid(project_id),
        "workspaceId": encode_uuid(workspace_id),
        "userId": encode_uuid(user_id),
        "scope": "project",
        "roleCodes": ["owner"],
        "permissionCodes": ["system:site:manage"],
        "isSuperuser": False,
    }


def test_project_permission_action_out_uses_project_shape() -> None:
    item = ProjectPermissionActionOut(
        code="site:manage",
        description="Manage project site runtime settings.",
        subject_kinds=["workspace_member", "personal_api_key"],
        permission_codes=["system:site:manage"],
    )

    assert item.model_dump(mode="json", by_alias=True) == {
        "code": "site:manage",
        "description": "Manage project site runtime settings.",
        "subjectKinds": ["workspace_member", "personal_api_key"],
        "permissionCodes": ["system:site:manage"],
    }


def test_project_context_to_workspace_context_preserves_workspace_access_fields() -> None:
    ctx = _project_context()

    workspace_ctx = project_context_to_workspace_context(ctx)

    assert workspace_ctx.workspace_id == ctx.workspace_id
    assert workspace_ctx.organization_id == ctx.organization_id
    assert workspace_ctx.workspace_kind == ctx.workspace_kind
    assert workspace_ctx.access_type == ctx.access_type
    assert workspace_ctx.org_membership_id == ctx.org_membership_id
    assert workspace_ctx.is_org_owner is True
    assert workspace_ctx.workspace_membership_id == ctx.workspace_membership_id
    assert workspace_ctx.visible_only is False
    assert workspace_ctx.is_creator_admin is True


@pytest.mark.asyncio
async def test_get_project_authz_snapshot_wraps_workspace_snapshot(monkeypatch: pytest.MonkeyPatch) -> None:
    ctx = _project_context()
    user_id = uuid4()
    expected_user_id = user_id

    async def fake_build_workspace_authz_snapshot(*, user_id, workspace_id):
        assert user_id == expected_user_id
        assert workspace_id == ctx.workspace_id
        return AuthzSnapshot(
            user_id=user_id,
            role_codes=["owner"],
            permission_codes=["system:site:manage"],
            is_superuser=True,
        )

    monkeypatch.setattr(
        "src.modules.projects.authz.service._build_workspace_authz_snapshot",
        fake_build_workspace_authz_snapshot,
    )

    snapshot = await get_project_authz_snapshot(ctx=ctx, user_id=user_id)

    assert snapshot.project_id == ctx.project_id
    assert snapshot.workspace_id == ctx.workspace_id
    assert snapshot.user_id == user_id
    assert snapshot.scope == "project"
    assert snapshot.role_codes == ["owner"]
    assert snapshot.permission_codes == ["system:site:manage"]
    assert snapshot.is_superuser is True
