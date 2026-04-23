from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi import APIRouter
from fastapi.routing import APIRoute

from src.models.workspaces.workspace import WorkspaceKind
from src.modules.projects.authz.schema import ProjectAuthzSnapshot
from src.modules.projects.governance.router import (
    get_project_authz_snapshot as get_project_authz_snapshot_route,
)
from src.modules.projects.governance.router import (
    get_project_core_settings,
    patch_project_core_settings,
)
from src.modules.projects.governance.router import router as project_governance_router
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.settings.schema import ProjectSettingsDetail, ProjectSettingsPatch
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


def _find_api_route(router: APIRouter, *, path: str, method: str) -> APIRoute:
    method_norm = method.upper()
    for route in router.routes:
        if isinstance(route, APIRoute) and route.path == path and method_norm in route.methods:
            return route
    raise AssertionError(f"Route not found: {method_norm} {path}")


def test_project_governance_authz_route_is_mounted() -> None:
    route = _find_api_route(
        project_governance_router,
        path="/projects/{project_id}/me/authz",
        method="GET",
    )

    assert route.summary == "Get project-scoped authz snapshot for current user"


@pytest.mark.asyncio
async def test_project_governance_authz_route_returns_project_snapshot(monkeypatch: pytest.MonkeyPatch) -> None:
    ctx = _project_context()
    user_id = uuid4()
    expected = ProjectAuthzSnapshot(
        project_id=ctx.project_id,
        user_id=user_id,
        role_codes=["owner"],
        permission_codes=["system:settings:manage"],
        is_superuser=False,
    )

    async def fake_build_project_authz_snapshot(*, ctx, user_id):
        assert ctx.project_id == expected.project_id
        assert user_id == expected.user_id
        return expected

    monkeypatch.setattr(
        "src.modules.projects.governance.router.build_project_authz_snapshot",
        fake_build_project_authz_snapshot,
    )

    response = await get_project_authz_snapshot_route(ctx=ctx, user_id=user_id)

    assert response.data == expected


@pytest.mark.asyncio
async def test_get_project_core_settings_uses_project_authz_helper(monkeypatch: pytest.MonkeyPatch) -> None:
    ctx = _project_context()
    user_id = uuid4()
    captured: dict[str, object] = {}

    async def fake_ensure_project_permission_granted(permission, *, user_id, ctx, error_code="PERMISSION_DENIED"):
        captured["permission"] = permission
        captured["user_id"] = user_id
        captured["project_id"] = ctx.project_id
        captured["error_code"] = error_code

    class FakeProjectSettingsService:
        async def get_core_detail(self, *, project_id):
            assert project_id == ctx.project_id
            return ProjectSettingsDetail(
                namespace="core",
                value={"name": "Project A"},
                secrets={},
                updated_at=datetime(2026, 1, 1, tzinfo=UTC),
            )

        async def patch_core(self, *, project_id, patch, updated_by):
            assert project_id == ctx.project_id
            return ProjectSettingsDetail(
                namespace="core",
                value=patch,
                secrets={},
                updated_at=datetime(2026, 1, 1, tzinfo=UTC),
            )

    monkeypatch.setattr(
        "src.modules.projects.governance.router.ensure_project_permission_granted",
        fake_ensure_project_permission_granted,
    )

    response = await get_project_core_settings(
        ctx=ctx,
        user_id=user_id,
        service=FakeProjectSettingsService(),
    )

    assert response.data is not None
    assert response.data.namespace == "core"
    assert captured == {
        "permission": "project:settings:read",
        "user_id": user_id,
        "project_id": ctx.project_id,
        "error_code": "PERMISSION_DENIED",
    }


@pytest.mark.asyncio
async def test_patch_project_core_settings_uses_project_authz_helper(monkeypatch: pytest.MonkeyPatch) -> None:
    ctx = _project_context()
    user_id = uuid4()
    captured: dict[str, object] = {}

    async def fake_ensure_project_permission_granted(permission, *, user_id, ctx, error_code="PERMISSION_DENIED"):
        captured["permission"] = permission
        captured["user_id"] = user_id
        captured["project_id"] = ctx.project_id
        captured["error_code"] = error_code

    class FakeProjectSettingsService:
        async def get_core_detail(self, *, project_id):
            assert project_id == ctx.project_id
            return ProjectSettingsDetail(
                namespace="core",
                value={"name": "Project A"},
                secrets={},
                updated_at=datetime(2026, 1, 1, tzinfo=UTC),
            )

        async def patch_core(self, *, project_id, patch, updated_by):
            assert project_id == ctx.project_id
            assert updated_by == user_id
            return ProjectSettingsDetail(
                namespace="core",
                value=patch,
                secrets={},
                updated_at=datetime(2026, 1, 1, tzinfo=UTC),
            )

    monkeypatch.setattr(
        "src.modules.projects.governance.router.ensure_project_permission_granted",
        fake_ensure_project_permission_granted,
    )

    response = await patch_project_core_settings(
        payload=ProjectSettingsPatch(patch={"name": "Project B"}),
        ctx=ctx,
        user_id=user_id,
        service=FakeProjectSettingsService(),
    )

    assert response.data is not None
    assert response.data.value == {"name": "Project B"}
    assert captured == {
        "permission": "project:settings:manage",
        "user_id": user_id,
        "project_id": ctx.project_id,
        "error_code": "PERMISSION_DENIED",
    }
