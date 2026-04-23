from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.common.constants.rbac import ROLE_ADMIN, ROLE_DESIGNER, ROLE_EDITOR, ROLE_OWNER, ROLE_VIEWER
from src.modules.workspaces.rbac.service import WorkspaceRBACService


@pytest.mark.asyncio
async def test_workspace_rbac_service_repairs_missing_system_roles(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id = uuid4()
    service = WorkspaceRBACService(
        settings=cast(Any, SimpleNamespace()),
        repo=cast(Any, SimpleNamespace(list_roles=AsyncMock(return_value=[]))),
    )
    ensure_ready = AsyncMock()
    monkeypatch.setattr(service, "ensure_workspace_system_role_grants", ensure_ready)
    monkeypatch.setattr(
        service,
        "_build_desired_system_role_permission_map",
        lambda: {
            ROLE_OWNER: {"system:settings:manage"},
            ROLE_ADMIN: {"system:settings:manage"},
            ROLE_EDITOR: {"system:content:manage"},
            ROLE_DESIGNER: {"system:site:manage"},
            ROLE_VIEWER: {"system:content:read"},
        },
    )

    await service.ensure_workspace_rbac_ready(workspace_id=workspace_id)

    ensure_ready.assert_awaited_once_with(workspace_id=workspace_id)


@pytest.mark.asyncio
async def test_workspace_rbac_service_repairs_partial_system_role_drift(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id = uuid4()
    owner_role = SimpleNamespace(code=ROLE_OWNER, is_system=True, is_superuser=True)
    admin_role = SimpleNamespace(code=ROLE_ADMIN, is_system=True, is_superuser=False)
    repo = SimpleNamespace(
        list_roles=AsyncMock(return_value=[owner_role, admin_role]),
        list_role_permission_edges_for_workspace=AsyncMock(
            return_value=[
                ("system:content:read", ROLE_OWNER),
                ("system:content:manage", ROLE_OWNER),
                ("system:content:read", ROLE_ADMIN),
            ]
        ),
        list_permissions=AsyncMock(
            return_value=[
                SimpleNamespace(code="system:content:read"),
                SimpleNamespace(code="system:content:manage"),
                SimpleNamespace(code="system:site:read"),
            ]
        ),
    )
    service = WorkspaceRBACService(settings=cast(Any, SimpleNamespace()), repo=cast(Any, repo))
    ensure_ready = AsyncMock()
    monkeypatch.setattr(service, "ensure_workspace_system_role_grants", ensure_ready)
    monkeypatch.setattr(
        service,
        "_build_desired_system_role_permission_map",
        lambda: {
            ROLE_OWNER: {"system:content:read", "system:content:manage", "system:site:read"},
            ROLE_ADMIN: {"system:content:read", "system:content:manage"},
        },
    )

    await service.ensure_workspace_rbac_ready(workspace_id=workspace_id)

    ensure_ready.assert_awaited_once_with(workspace_id=workspace_id)


@pytest.mark.asyncio
async def test_workspace_rbac_service_lists_roles_with_permission_codes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id = uuid4()
    owner_role = SimpleNamespace(id=uuid4(), code=ROLE_OWNER, is_superuser=True)
    editor_role = SimpleNamespace(id=uuid4(), code=ROLE_EDITOR, is_superuser=False)
    repo = SimpleNamespace(
        list_roles=AsyncMock(return_value=[owner_role, editor_role]),
        list_permissions=AsyncMock(
            return_value=[
                SimpleNamespace(code="system:content:read"),
                SimpleNamespace(code="system:content:manage"),
                SimpleNamespace(code="system:site:read"),
            ]
        ),
        list_role_permissions=AsyncMock(
            return_value=[
                SimpleNamespace(code="system:content:read"),
                SimpleNamespace(code="system:content:manage"),
            ]
        ),
    )
    service = WorkspaceRBACService(settings=cast(Any, SimpleNamespace()), repo=cast(Any, repo))
    ensure_ready = AsyncMock()
    monkeypatch.setattr(service, "ensure_workspace_rbac_ready", ensure_ready)

    roles_with_permissions = await service.list_roles_with_permission_codes(workspace_id=workspace_id)

    assert roles_with_permissions == [
        (owner_role, ["system:content:manage", "system:content:read", "system:site:read"]),
        (editor_role, ["system:content:manage", "system:content:read"]),
    ]
    ensure_ready.assert_awaited_once_with(workspace_id=workspace_id)
