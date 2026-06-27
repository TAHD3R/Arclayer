from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest

from src.core.exceptions import Forbidden
from src.models.organization.user import User
from src.models.workspaces.workspace import WorkspaceKind
from src.modules.ai import usage_router
from src.modules.workspaces.http.schema import WorkspaceAccessType, WorkspaceContext


async def test_usage_read_access_allows_super_admin_without_workspace_membership(monkeypatch) -> None:
    workspace_id = uuid4()
    user = cast(User, SimpleNamespace(id=uuid4(), is_super_admin=True))

    async def _active_workspace(*, workspace_id):
        return SimpleNamespace(id=workspace_id)

    async def _resolve_workspace_context_by_id(**_kwargs):
        raise AssertionError("super admin usage reads should not require workspace membership")

    monkeypatch.setattr(usage_router, "require_active_workspace", _active_workspace)
    monkeypatch.setattr(usage_router, "resolve_workspace_context_by_id", _resolve_workspace_context_by_id)

    resolved = await usage_router.require_workspace_usage_read_access(workspace_id=workspace_id, user=user)

    assert resolved == workspace_id


async def test_usage_read_access_rejects_visible_only_workspace_context(monkeypatch) -> None:
    workspace_id = uuid4()
    user = cast(User, SimpleNamespace(id=uuid4(), is_super_admin=False))

    async def _resolve_workspace_context_by_id(**_kwargs):
        return WorkspaceContext(
            workspace_id=workspace_id,
            organization_id=uuid4(),
            workspace_kind=WorkspaceKind.TEAM,
            access_type=WorkspaceAccessType.MEMBER,
            org_membership_id=uuid4(),
            is_org_owner=True,
            workspace_membership_id=None,
            visible_only=True,
            is_creator_admin=False,
        )

    monkeypatch.setattr(usage_router, "resolve_workspace_context_by_id", _resolve_workspace_context_by_id)

    with pytest.raises(Forbidden):
        await usage_router.require_workspace_usage_read_access(workspace_id=workspace_id, user=user)
