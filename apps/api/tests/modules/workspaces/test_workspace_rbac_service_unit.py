from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.common.constants.rbac import ROLE_ADMIN, ROLE_DESIGNER, ROLE_EDITOR, ROLE_VIEWER
from src.core.exceptions import BadRequest
from src.modules.workspaces.rbac.service import WorkspaceRBACService


@pytest.mark.asyncio
async def test_workspace_rbac_service_repairs_missing_system_roles(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id = uuid4()
    service = WorkspaceRBACService(
        settings=cast(Any, SimpleNamespace()),
        repo=cast(Any, SimpleNamespace(list_roles=AsyncMock(return_value=[]))),
        role_management_reader=cast(Any, SimpleNamespace()),
    )
    ensure_ready = AsyncMock()
    monkeypatch.setattr(service, "ensure_workspace_system_role_grants", ensure_ready)
    monkeypatch.setattr(
        service,
        "_build_desired_system_role_permission_map",
        lambda: {
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
    admin_role = SimpleNamespace(code=ROLE_ADMIN, is_system=True, is_superuser=False)
    editor_role = SimpleNamespace(code=ROLE_EDITOR, is_system=True, is_superuser=False)
    repo = SimpleNamespace(
        list_roles=AsyncMock(return_value=[admin_role, editor_role]),
        list_role_permission_edges_for_workspace=AsyncMock(
            return_value=[
                ("system:content:read", ROLE_ADMIN),
                ("system:content:read", ROLE_EDITOR),
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
    service = WorkspaceRBACService(
        settings=cast(Any, SimpleNamespace()),
        repo=cast(Any, repo),
        role_management_reader=cast(Any, SimpleNamespace()),
    )
    ensure_ready = AsyncMock()
    monkeypatch.setattr(service, "ensure_workspace_system_role_grants", ensure_ready)
    monkeypatch.setattr(
        service,
        "_build_desired_system_role_permission_map",
        lambda: {
            ROLE_ADMIN: {"system:content:read", "system:content:manage"},
            ROLE_EDITOR: {"system:content:read"},
        },
    )

    await service.ensure_workspace_rbac_ready(workspace_id=workspace_id)

    ensure_ready.assert_awaited_once_with(workspace_id=workspace_id)


@pytest.mark.asyncio
async def test_workspace_rbac_service_lists_roles_with_permission_codes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id = uuid4()
    admin_role = SimpleNamespace(id=uuid4(), code=ROLE_ADMIN, is_superuser=False)
    editor_role = SimpleNamespace(id=uuid4(), code=ROLE_EDITOR, is_superuser=False)
    repo = SimpleNamespace(
        list_roles=AsyncMock(return_value=[admin_role, editor_role]),
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
    service = WorkspaceRBACService(
        settings=cast(Any, SimpleNamespace()),
        repo=cast(Any, repo),
        role_management_reader=cast(Any, SimpleNamespace()),
    )
    ensure_ready = AsyncMock()
    monkeypatch.setattr(service, "ensure_workspace_rbac_ready", ensure_ready)

    roles_with_permissions = await service.list_roles_with_permission_codes(workspace_id=workspace_id)

    assert roles_with_permissions == [
        (admin_role, ["system:content:manage", "system:content:read"]),
        (editor_role, ["system:content:manage", "system:content:read"]),
    ]
    ensure_ready.assert_awaited_once_with(workspace_id=workspace_id)


@pytest.mark.asyncio
async def test_workspace_rbac_service_rejects_legacy_owner_role_code() -> None:
    repo = SimpleNamespace(get_role_by_code=AsyncMock())
    service = WorkspaceRBACService(
        settings=cast(Any, SimpleNamespace()),
        repo=cast(Any, repo),
        role_management_reader=cast(Any, SimpleNamespace()),
    )

    with pytest.raises(BadRequest) as exc:
        await service._assert_custom_role_code_available(workspace_id=uuid4(), role_code="owner")

    assert exc.value.error == "ROLE_CODE_RESERVED"
    repo.get_role_by_code.assert_not_awaited()
