from __future__ import annotations

from uuid import uuid4

import pytest

from src.models.system.rbac import PermissionScope
from src.models.workspaces.workspace import WorkspaceKind
from src.modules.projects.governance.router import list_project_actions
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.permissions.service import get_project_action_catalog
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


def test_project_action_catalog_exposes_project_surface_actions() -> None:
    registry = get_project_action_catalog()

    assert "project:settings:read" in registry
    assert registry["project:settings:read"].permission_codes == ("system:settings:read",)
    assert registry["project:settings:read"].scope == PermissionScope.PROJECT.value
    assert "project:settings:manage" in registry
    assert registry["project:settings:manage"].permission_codes == ("system:settings:manage",)
    assert "project_member" in registry["project:settings:manage"].subject_kinds
    assert "project:team:members:read" in registry
    assert registry["project:team:members:read"].permission_codes == ("team:members:read",)
    assert "project:team:roles:manage" in registry
    assert registry["project:team:roles:manage"].permission_codes == ("team:members:roles:manage",)
    assert "project:site:manage" in registry
    assert registry["project:site:manage"].permission_codes == ("system:site:manage",)
    assert registry["project:site:manage"].scope == PermissionScope.PROJECT.value
    assert "project:content:routing:write" in registry
    assert registry["project:content:routing:write"].permission_codes == ("system:content:manage",)
    assert "project:automation:manage" in registry
    assert registry["project:automation:manage"].permission_codes == ("system:automation:manage",)
    assert "project:api-keys:manage" in registry
    assert registry["project:api-keys:manage"].permission_codes == ("system:keys:manage",)
    assert "project:delivery:graphql:read" in registry
    assert registry["project:delivery:graphql:read"].subject_kinds == ("delivery_api_key",)


@pytest.mark.asyncio
async def test_project_actions_route_uses_project_action_catalog(monkeypatch: pytest.MonkeyPatch) -> None:
    ctx = _project_context()

    monkeypatch.setattr(
        "src.modules.projects.governance.router.get_project_action_catalog",
        lambda: {
            "project:settings:manage": get_project_action_catalog()["project:settings:manage"],
        },
    )

    response = await list_project_actions(_ctx=ctx, user_id=uuid4())

    assert response.data is not None
    assert len(response.data) == 1
    assert response.data[0].code == "project:settings:manage"
    assert response.data[0].permission_codes == ["system:settings:manage"]
