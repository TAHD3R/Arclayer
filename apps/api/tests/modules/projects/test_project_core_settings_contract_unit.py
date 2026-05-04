from __future__ import annotations

from typing import cast
from uuid import uuid4

import pytest

from src.common.types.json_types import JsonObject
from src.models.workspaces.workspace import WorkspaceKind
from src.modules.projects.governance.router import (
    get_project_core_settings as get_project_core_settings_route,
)
from src.modules.projects.governance.router import (
    patch_project_core_settings as patch_project_core_settings_route,
)
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.settings.schema import ProjectSettingsDetail, ProjectSettingsPatch
from src.modules.projects.settings.service import ProjectSettingsService
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


class _FakeProjectSettingsService(ProjectSettingsService):
    def __init__(self) -> None:
        pass

    async def get_core_detail(self, *, project_id) -> ProjectSettingsDetail:
        assert project_id
        return ProjectSettingsDetail(namespace="core", value={"site": {"name": "Arclayer"}}, secrets={})

    async def patch_core(self, *, project_id, patch, updated_by) -> ProjectSettingsDetail:
        assert project_id
        assert updated_by
        return ProjectSettingsDetail(namespace="core", value=patch, secrets={})


@pytest.mark.asyncio
async def test_project_core_settings_route_returns_project_detail(monkeypatch: pytest.MonkeyPatch) -> None:
    ctx = _project_context()
    user_id = uuid4()

    async def fake_ensure(permission, *, user_id, ctx, error_code="PERMISSION_DENIED"):
        assert permission == "project:settings:read"
        assert user_id
        assert ctx.project_id
        assert error_code == "PERMISSION_DENIED"

    monkeypatch.setattr(
        "src.modules.projects.governance.router.ensure_project_permission_granted",
        fake_ensure,
    )

    response = await get_project_core_settings_route(
        ctx=ctx,
        user_id=user_id,
        service=_FakeProjectSettingsService(),
    )

    assert response.data is not None
    assert response.data.namespace == "core"
    site_settings = cast(JsonObject, response.data.value["site"])
    assert site_settings["name"] == "Arclayer"


@pytest.mark.asyncio
async def test_project_core_settings_patch_route_uses_project_service(monkeypatch: pytest.MonkeyPatch) -> None:
    ctx = _project_context()
    user_id = uuid4()

    async def fake_ensure(permission, *, user_id, ctx, error_code="PERMISSION_DENIED"):
        assert permission == "project:settings:manage"
        assert user_id
        assert ctx.project_id
        assert error_code == "PERMISSION_DENIED"

    monkeypatch.setattr(
        "src.modules.projects.governance.router.ensure_project_permission_granted",
        fake_ensure,
    )

    response = await patch_project_core_settings_route(
        payload=ProjectSettingsPatch(patch={"site": {"name": "Renamed"}}),
        ctx=ctx,
        user_id=user_id,
        service=_FakeProjectSettingsService(),
    )

    assert response.data is not None
    assert response.data.value == {"site": {"name": "Renamed"}}
