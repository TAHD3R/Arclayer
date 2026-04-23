from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import APIRouter
from fastapi.routing import APIRoute

from src.modules.organization.authz.router import (
    get_my_organization_authz,
    list_my_organization_actions,
)
from src.modules.organization.authz.router import (
    router as organization_authz_router,
)
from src.modules.organization.authz.schema import OrganizationAuthzSnapshot, OrganizationPermissionActionOut
from src.modules.organization.rbac.router import router as organization_rbac_router


def _find_api_route(router: APIRouter, *, path: str, method: str) -> APIRoute:
    method_norm = method.upper()
    for route in router.routes:
        if isinstance(route, APIRoute) and route.path == path and method_norm in route.methods:
            return route
    raise AssertionError(f"Route not found: {method_norm} {path}")


def test_organization_authz_routes_are_mounted() -> None:
    authz_route = _find_api_route(
        organization_authz_router,
        path="/organizations/me/authz",
        method="GET",
    )
    actions_route = _find_api_route(
        organization_authz_router,
        path="/organizations/me/actions",
        method="GET",
    )

    assert authz_route.summary == "Get organization-scoped authz snapshot for current user"
    assert actions_route.summary == "List canonical permission actions for current organization context"


def test_organization_rbac_router_hard_cuts_matrix_route() -> None:
    paths = {route.path for route in organization_rbac_router.routes if isinstance(route, APIRoute)}

    assert "/organizations/me/rbac/matrix" not in paths


@pytest.mark.asyncio
async def test_organization_authz_route_returns_org_snapshot(monkeypatch: pytest.MonkeyPatch) -> None:
    expected = OrganizationAuthzSnapshot(
        organization_id=uuid4(),
        user_id=uuid4(),
        role_codes=["owner"],
        permission_codes=["org.settings.delete"],
        is_superuser=False,
    )

    async def fake_build_organization_authz_snapshot(*, membership, service):
        assert membership is not None
        assert service is not None
        return expected

    monkeypatch.setattr(
        "src.modules.organization.authz.router.build_organization_authz_snapshot",
        fake_build_organization_authz_snapshot,
    )

    response = await get_my_organization_authz(
        orgm=SimpleNamespace(),
        service=SimpleNamespace(),
    )

    assert response.data == expected


@pytest.mark.asyncio
async def test_organization_actions_route_returns_org_action_catalog(monkeypatch: pytest.MonkeyPatch) -> None:
    expected = [
        OrganizationPermissionActionOut(
            code="org.settings.delete",
            description="Delete organization and all scoped settings.",
            subject_kinds=["organization_member"],
            permission_codes=["org.settings.delete"],
        )
    ]

    monkeypatch.setattr(
        "src.modules.organization.authz.router.list_organization_permission_actions",
        lambda: expected,
    )

    response = await list_my_organization_actions(_orgm=SimpleNamespace())

    assert response.data == expected
