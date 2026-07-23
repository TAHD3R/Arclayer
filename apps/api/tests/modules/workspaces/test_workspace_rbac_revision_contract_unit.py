from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from fastapi import Response, status

from src.core.exceptions import BadRequest, Conflict
from src.models.system.rbac import PermissionScope
from src.modules.workspaces.rbac import router as rbac_router_module
from src.modules.workspaces.rbac.catalog import (
    RolePermissionBatchUpdate,
    build_catalog_revision,
    role_revision,
)
from src.modules.workspaces.rbac.schema import WorkspacePermissionCatalogOut
from src.modules.workspaces.rbac.service import WorkspaceRBACService


def _permission(code: str, *, owner_key: str = "core") -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        code=code,
        scope=PermissionScope.WORKSPACE,
        name=code,
        description=f"{code} description",
        name_i18n=None,
        description_i18n=None,
        owner_key=owner_key,
    )


def _role(code: str) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        code=code,
        is_system=False,
        updated_at=datetime(2026, 7, 23, tzinfo=UTC),
    )


def _update(
    role: SimpleNamespace,
    *permission_codes: str,
    revision: str | None = None,
) -> RolePermissionBatchUpdate:
    return RolePermissionBatchUpdate(
        role_code=role.code,
        role_revision=revision or role_revision(cast(Any, role)),
        permission_grants=tuple((code, ()) for code in permission_codes),
    )


def _service(
    *,
    permissions: list[SimpleNamespace],
    roles: list[SimpleNamespace],
    current_codes_by_role: dict[UUID, list[str]] | None = None,
) -> tuple[WorkspaceRBACService, SimpleNamespace]:
    codes_by_role = current_codes_by_role or {}

    async def list_role_permissions(*, role_id: UUID, **_kwargs: object) -> list[SimpleNamespace]:
        permission_by_code = {permission.code: permission for permission in permissions}
        return [permission_by_code[code] for code in codes_by_role.get(role_id, [])]

    repo = SimpleNamespace(
        list_permissions=AsyncMock(return_value=permissions),
        list_roles=AsyncMock(return_value=roles),
        list_role_permissions=AsyncMock(side_effect=list_role_permissions),
        list_role_permission_condition_sets=AsyncMock(return_value={}),
        replace_role_permissions=AsyncMock(),
        update_role=AsyncMock(),
    )
    service = WorkspaceRBACService(
        settings=cast(Any, SimpleNamespace()),
        repo=cast(Any, repo),
    )

    @asynccontextmanager
    async def tx() -> AsyncIterator[object]:
        yield object()

    object.__setattr__(service, "tx", tx)
    object.__setattr__(service, "_write_rbac_activity_event", AsyncMock())
    return service, repo


async def _save(
    service: WorkspaceRBACService,
    *,
    catalog_revision: str,
    updates: tuple[RolePermissionBatchUpdate, ...],
) -> tuple[str, list[Any]]:
    return await service.set_custom_role_permissions_batch(
        organization_id=uuid4(),
        workspace_id=uuid4(),
        actor_user_id=uuid4(),
        catalog_revision=catalog_revision,
        idempotency_key="rbac-test-idempotency-key",
        updates=updates,
        actor_permission_codes=frozenset(),
        actor_is_superuser=True,
    )


@pytest.mark.asyncio
async def test_permission_catalog_returns_304_for_matching_etag(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = WorkspacePermissionCatalogOut(
        catalog_revision="catalog-revision",
        etag='"catalog-etag"',
    )
    monkeypatch.setattr(
        rbac_router_module,
        "_build_workspace_permission_catalog",
        AsyncMock(return_value=payload),
    )
    raw_response = Response()

    result = await rbac_router_module.get_permission_catalog(
        raw_response=raw_response,
        if_none_match='W/"other", "catalog-etag"',
        ctx=cast(Any, SimpleNamespace(workspace_id=uuid4())),
        service=cast(Any, SimpleNamespace()),
    )

    assert isinstance(result, Response)
    assert result.status_code == status.HTTP_304_NOT_MODIFIED
    assert result.headers["etag"] == '"catalog-etag"'
    assert result.headers["cache-control"] == "private, no-cache"


@pytest.mark.asyncio
async def test_batch_rejects_stale_catalog_revision_before_role_reads() -> None:
    permission = _permission("system:content:read")
    role = _role("custom_editor")
    service, repo = _service(permissions=[permission], roles=[role])

    with pytest.raises(Conflict) as exc_info:
        await _save(
            service,
            catalog_revision="stale-catalog-revision",
            updates=(_update(role, permission.code),),
        )

    assert exc_info.value.error == "PERMISSION_CATALOG_CONFLICT"
    assert exc_info.value.meta == {
        "expected_catalog_revision": "stale-catalog-revision",
        "actual_catalog_revision": build_catalog_revision([cast(Any, permission)]),
    }
    repo.list_roles.assert_not_awaited()
    repo.replace_role_permissions.assert_not_awaited()


@pytest.mark.asyncio
async def test_batch_rejects_stale_role_revision_with_current_grants_in_meta() -> None:
    read = _permission("system:content:read")
    manage = _permission("system:content:manage")
    role = _role("custom_editor")
    service, repo = _service(
        permissions=[read, manage],
        roles=[role],
        current_codes_by_role={role.id: [read.code]},
    )

    with pytest.raises(Conflict) as exc_info:
        await _save(
            service,
            catalog_revision=build_catalog_revision([cast(Any, read), cast(Any, manage)]),
            updates=(_update(role, manage.code, revision="stale-role-revision"),),
        )

    assert exc_info.value.error == "ROLE_REVISION_CONFLICT"
    assert exc_info.value.meta == {
        "catalog_revision": build_catalog_revision([cast(Any, read), cast(Any, manage)]),
        "role_diffs": [
            {
                "role_code": role.code,
                "expected_revision": "stale-role-revision",
                "actual_revision": role_revision(cast(Any, role)),
                "permission_codes": [read.code],
            }
        ],
    }
    repo.replace_role_permissions.assert_not_awaited()


@pytest.mark.asyncio
async def test_batch_validation_failure_performs_no_partial_writes() -> None:
    read = _permission("system:content:read")
    first_role = _role("custom_editor")
    second_role = _role("custom_reviewer")
    service, repo = _service(permissions=[read], roles=[first_role, second_role])

    with pytest.raises(BadRequest) as exc_info:
        await _save(
            service,
            catalog_revision=build_catalog_revision([cast(Any, read)]),
            updates=(
                _update(first_role, read.code),
                _update(second_role, "system:missing"),
            ),
        )

    assert exc_info.value.error == "PERMISSION_NOT_FOUND"
    assert exc_info.value.meta == {
        "role_code": second_role.code,
        "missing": ["system:missing"],
    }
    repo.replace_role_permissions.assert_not_awaited()
    repo.update_role.assert_not_awaited()


@pytest.mark.asyncio
async def test_batch_treats_stale_revision_with_matching_target_as_idempotent_replay() -> None:
    read = _permission("system:content:read")
    role = _role("custom_editor")
    service, repo = _service(
        permissions=[read],
        roles=[role],
        current_codes_by_role={role.id: [read.code]},
    )
    catalog_revision = build_catalog_revision([cast(Any, read)])

    revision, saved_roles = await _save(
        service,
        catalog_revision=catalog_revision,
        updates=(_update(role, read.code, revision="stale-role-revision"),),
    )

    assert revision == catalog_revision
    assert saved_roles == [role]
    repo.replace_role_permissions.assert_not_awaited()
    repo.update_role.assert_not_awaited()


@pytest.mark.asyncio
async def test_batch_rejects_retained_unavailable_permission() -> None:
    unavailable = _permission("plugin:content:legacy", owner_key="plugin.example")
    role = _role("custom_editor")
    service, repo = _service(permissions=[unavailable], roles=[role])

    with pytest.raises(BadRequest) as exc_info:
        await _save(
            service,
            catalog_revision=build_catalog_revision([cast(Any, unavailable)]),
            updates=(_update(role, unavailable.code),),
        )

    assert exc_info.value.error == "PERMISSION_UNAVAILABLE"
    assert exc_info.value.meta == {
        "role_code": role.code,
        "permission_codes": [unavailable.code],
    }
    repo.replace_role_permissions.assert_not_awaited()
