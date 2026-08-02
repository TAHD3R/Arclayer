from __future__ import annotations

from typing import cast
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Forbidden
from src.models.system.rbac import PermissionScope, SystemRolePermission
from src.modules.commerce import authorization
from src.modules.commerce.authorization import (
    WORKSPACE_COMMERCE_MANAGE_REQUIRED,
    get_workspace_roles_manage_availability,
)
from src.modules.commerce.entitlement_schema import WORKSPACE_ROLES_MANAGE_ENTITLEMENT, EntitlementDecision
from src.modules.workspaces.http.schema import WorkspaceAccessType, WorkspaceContext


def _context(*, owner: bool = False) -> WorkspaceContext:
    return WorkspaceContext(
        workspace_id=uuid4(),
        organization_id=uuid4(),
        access_type=WorkspaceAccessType.MEMBER,
        org_membership_id=uuid4(),
        workspace_membership_id=uuid4(),
        is_workspace_owner=owner,
    )


class _Entitlements:
    def __init__(self, *, granted: bool) -> None:
        self.granted = granted
        self.calls: list[dict[str, object]] = []

    async def check(
        self,
        *,
        workspace_id: UUID,
        entitlement: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> EntitlementDecision:
        self.calls.append({
            "workspace_id": workspace_id,
            "entitlement": entitlement,
            "conn": conn,
        })
        return EntitlementDecision(
            workspace_id=workspace_id,
            entitlement=entitlement,
            granted=self.granted,
            reason="granted" if self.granted else "feature_excluded",
        )


@pytest.mark.asyncio
async def test_workspace_owner_can_manage_commerce_without_rbac_lookup(monkeypatch: pytest.MonkeyPatch) -> None:
    async def unexpected(**_kwargs: object) -> bool:
        raise AssertionError("owner should not need RBAC permission lookup")

    monkeypatch.setattr(authorization, "_has_exact_workspace_permission", unexpected)
    entitlements = _Entitlements(granted=False)
    ctx = _context(owner=True)

    result = await authorization._require_workspace_owner_or_permission(
        permission="workspace:commerce:manage",
        user_id=uuid4(),
        ctx=ctx,
        error_code=WORKSPACE_COMMERCE_MANAGE_REQUIRED,
        entitlements=entitlements,
    )

    assert result is ctx
    assert entitlements.calls == []


@pytest.mark.asyncio
async def test_non_owner_requires_exact_commerce_permission(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, str]] = []

    async def exact_permission(permission: str, **_kwargs: object) -> bool:
        calls.append((permission, WORKSPACE_COMMERCE_MANAGE_REQUIRED))
        return True

    monkeypatch.setattr(authorization, "_has_exact_workspace_permission", exact_permission)
    entitlements = _Entitlements(granted=True)

    await authorization._require_workspace_owner_or_permission(
        permission="workspace:commerce:manage",
        user_id=uuid4(),
        ctx=_context(),
        error_code=WORKSPACE_COMMERCE_MANAGE_REQUIRED,
        entitlements=entitlements,
    )

    assert calls == [("workspace:commerce:manage", WORKSPACE_COMMERCE_MANAGE_REQUIRED)]
    assert entitlements.calls[0]["entitlement"] == WORKSPACE_ROLES_MANAGE_ENTITLEMENT


@pytest.mark.asyncio
async def test_exact_workspace_permission_uses_active_membership_role_grant(monkeypatch: pytest.MonkeyPatch) -> None:
    ctx = _context()
    user_id = uuid4()
    captured: dict[str, object] = {}

    class _Query:
        async def values(self, *fields: str) -> list[dict[str, object]]:
            captured["fields"] = fields
            return [{"conditions": []}]

    def fake_filter(**kwargs: object) -> _Query:
        captured.update(kwargs)
        return _Query()

    monkeypatch.setattr(SystemRolePermission, "filter", fake_filter)

    assert await authorization._has_exact_workspace_permission(
        permission="workspace:commerce:manage",
        user_id=user_id,
        ctx=ctx,
    )
    assert captured == {
        "permission__code": "workspace:commerce:manage",
        "permission__scope": PermissionScope.WORKSPACE,
        "role__workspace_id": ctx.workspace_id,
        "role__workspace_membership_roles__membership_id": ctx.workspace_membership_id,
        "role__workspace_membership_roles__membership__user_id": user_id,
        "role__workspace_membership_roles__membership__status": "active",
        "role__workspace_membership_roles__ended_at__isnull": True,
        "fields": ("conditions",),
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "unrelated_permission", ["system:settings:manage", "team:members:manage", "platform:commerce:manage"]
)
async def test_non_owner_generic_or_platform_permissions_do_not_authorize_commerce(
    monkeypatch: pytest.MonkeyPatch,
    unrelated_permission: str,
) -> None:
    async def denied(permission: str, **_kwargs: object) -> bool:
        assert permission == "workspace:commerce:manage"
        return False

    monkeypatch.setattr(authorization, "_has_exact_workspace_permission", denied)
    entitlements = _Entitlements(granted=True)

    with pytest.raises(Forbidden) as exc_info:
        await authorization._require_workspace_owner_or_permission(
            permission="workspace:commerce:manage",
            user_id=uuid4(),
            ctx=_context(),
            error_code=WORKSPACE_COMMERCE_MANAGE_REQUIRED,
            entitlements=entitlements,
        )

    assert unrelated_permission != "workspace:commerce:manage"
    assert exc_info.value.error == WORKSPACE_COMMERCE_MANAGE_REQUIRED


@pytest.mark.asyncio
async def test_fixed_member_access_rejects_legacy_commerce_role_binding(monkeypatch: pytest.MonkeyPatch) -> None:
    async def unexpected_permission(**_kwargs: object) -> bool:
        raise AssertionError("Fixed Member Access must not evaluate legacy role bindings")

    monkeypatch.setattr(authorization, "_has_exact_workspace_permission", unexpected_permission)

    with pytest.raises(Forbidden) as exc_info:
        await authorization._require_workspace_owner_or_permission(
            permission="workspace:commerce:manage",
            user_id=uuid4(),
            ctx=_context(),
            error_code=WORKSPACE_COMMERCE_MANAGE_REQUIRED,
            entitlements=_Entitlements(granted=False),
        )

    assert exc_info.value.error == WORKSPACE_COMMERCE_MANAGE_REQUIRED


@pytest.mark.asyncio
async def test_roles_manage_availability_uses_registered_entitlement_and_connection() -> None:
    workspace_id = uuid4()
    conn = cast(BaseDBAsyncClient, object())
    decision = EntitlementDecision(
        workspace_id=workspace_id,
        entitlement=WORKSPACE_ROLES_MANAGE_ENTITLEMENT,
        granted=True,
        reason="granted",
    )

    class _Entitlements:
        calls: list[dict[str, object]] = []

        async def check(self, **kwargs: object) -> EntitlementDecision:
            self.calls.append(kwargs)
            return decision

    entitlements = _Entitlements()
    result = await get_workspace_roles_manage_availability(
        workspace_id=workspace_id,
        entitlements=entitlements,
        conn=conn,
    )

    assert result is decision
    assert entitlements.calls == [
        {
            "workspace_id": workspace_id,
            "entitlement": WORKSPACE_ROLES_MANAGE_ENTITLEMENT,
            "conn": conn,
        }
    ]
