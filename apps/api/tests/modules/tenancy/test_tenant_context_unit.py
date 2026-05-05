from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest

from src.config import Settings
from src.models.projects.runtime import ProjectRuntimeRecord
from src.models.workspaces.workspace import Workspace, WorkspaceKind
from src.modules.projects.http.service import get_project_context
from src.modules.projects.runtime.service import ProjectRuntimeService
from src.modules.tenancy.context import (
    get_current_tenant_context,
    require_current_tenant_context,
    reset_current_tenant_context,
    set_current_tenant_context,
)
from src.modules.tenancy.router_helpers import bind_project_tenant_context, bind_workspace_tenant_context
from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode, TenantScope
from src.modules.workspaces.http.schema import WorkspaceAccessType
from src.modules.workspaces.http.service import _resolve_guest_workspace_context


def _tenant_context() -> TenantContext:
    return TenantContext(
        identity=TenantIdentity(
            organization_id=uuid4(),
            workspace_id=uuid4(),
            project_id=None,
            runtime_id=None,
            site_id=None,
            schema_name="cms_ws_1234567890abcdefghij",
            isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
        ),
        scope=TenantScope.WORKSPACE,
    )


def test_tenant_context_set_and_require() -> None:
    context = _tenant_context()
    token = set_current_tenant_context(context)
    try:
        assert get_current_tenant_context() == context
        assert require_current_tenant_context() == context
    finally:
        reset_current_tenant_context(token)


def test_tenant_context_reset_restores_previous_state() -> None:
    original = _tenant_context()
    replacement = original.with_project(project_id=uuid4(), site_id=uuid4(), runtime_id=uuid4())
    original_token = set_current_tenant_context(original)
    replacement_token = set_current_tenant_context(replacement)
    try:
        assert require_current_tenant_context() == replacement
    finally:
        reset_current_tenant_context(replacement_token)
        assert require_current_tenant_context() == original
        reset_current_tenant_context(original_token)
    assert get_current_tenant_context() is None


def test_require_tenant_context_raises_when_missing() -> None:
    with pytest.raises(RuntimeError, match="TenantContext is required"):
        require_current_tenant_context()


@pytest.mark.asyncio
async def test_bind_workspace_tenant_context_builds_and_binds(monkeypatch: pytest.MonkeyPatch) -> None:
    organization_id = uuid4()
    workspace_id = uuid4()

    async def _fake_ensure(self, workspace_id, organization_id):  # type: ignore[no-untyped-def]
        class _Record:
            schema_name = "cms_ws_1234567890abcdefghij"
            isolation_mode = "workspace_schema"

        return _Record()

    monkeypatch.setattr(
        "src.modules.tenancy.registry.WorkspaceTenantRegistryService.ensure_ready_for_workspace",
        _fake_ensure,
    )

    context = await bind_workspace_tenant_context(workspace_id=workspace_id, organization_id=organization_id)
    assert context.workspace_id == workspace_id
    assert context.organization_id == organization_id
    assert require_current_tenant_context() == context


def test_bind_project_tenant_context_enriches_bound_workspace_context() -> None:
    workspace_context = _tenant_context()
    token = set_current_tenant_context(workspace_context)
    try:
        project_id = uuid4()
        runtime_id = uuid4()
        site_id = uuid4()
        project_context = bind_project_tenant_context(
            project_id=project_id,
            runtime_id=runtime_id,
            site_id=site_id,
            scope=TenantScope.RUNTIME,
        )
        assert project_context.project_id == project_id
        assert project_context.runtime_id == runtime_id
        assert project_context.site_id == site_id
        assert project_context.scope == TenantScope.RUNTIME
        assert require_current_tenant_context() == project_context
    finally:
        reset_current_tenant_context(token)


@pytest.mark.asyncio
async def test_workspace_request_entrypoint_binds_tenant_context(monkeypatch: pytest.MonkeyPatch) -> None:
    organization_id = uuid4()
    user_id = uuid4()
    workspace = SimpleNamespace(id=uuid4(), kind=WorkspaceKind.TEAM)
    membership = SimpleNamespace(id=uuid4())
    calls: dict[str, object] = {}

    async def _fake_find_active_workspace_membership(*, workspace_id, user_id):  # type: ignore[no-untyped-def]
        calls["membership_lookup"] = (workspace_id, user_id)
        return membership

    def _fake_bind_workspace_request_context(*, workspace_id, organization_id, membership_id):  # type: ignore[no-untyped-def]
        calls["workspace_request_context"] = (workspace_id, organization_id, membership_id)

    async def _fake_bind_workspace_tenant_context(*, workspace_id, organization_id):  # type: ignore[no-untyped-def]
        calls["tenant_context"] = (workspace_id, organization_id)
        return _tenant_context()

    monkeypatch.setattr(
        "src.modules.workspaces.http.service._find_active_workspace_membership",
        _fake_find_active_workspace_membership,
    )
    monkeypatch.setattr(
        "src.modules.workspaces.http.service._bind_workspace_request_context",
        _fake_bind_workspace_request_context,
    )
    monkeypatch.setattr(
        "src.modules.workspaces.http.service.bind_workspace_tenant_context",
        _fake_bind_workspace_tenant_context,
    )

    context = await _resolve_guest_workspace_context(
        workspace=cast(Workspace, workspace),
        organization_id=organization_id,
        user_id=user_id,
    )

    assert calls["membership_lookup"] == (workspace.id, user_id)
    assert calls["workspace_request_context"] == (workspace.id, organization_id, membership.id)
    assert calls["tenant_context"] == (workspace.id, organization_id)
    assert context.workspace_id == workspace.id
    assert context.organization_id == organization_id


@pytest.mark.asyncio
async def test_project_request_entrypoint_binds_project_tenant_context(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid4()
    workspace_id = uuid4()
    organization_id = uuid4()
    runtime_id = uuid4()
    user_id = uuid4()
    tenant_calls: dict[str, object] = {}

    class _FakeRepo:
        async def get_project_by_id(self, *, project_id):  # type: ignore[no-untyped-def]
            return SimpleNamespace(id=project_id, workspace_id=workspace_id)

        async def get_primary_runtime(self, *, project_id):  # type: ignore[no-untyped-def]
            return SimpleNamespace(id=runtime_id)

    async def _fake_require_active_workspace(*, workspace_id):  # type: ignore[no-untyped-def]
        return SimpleNamespace(id=workspace_id, organization_id=organization_id, kind=WorkspaceKind.TEAM)

    async def _fake_find_active_org_membership(*, organization_id, user_id):  # type: ignore[no-untyped-def]
        return SimpleNamespace(id=uuid4(), role="owner")

    async def _fake_resolve_member_workspace_context(**_kwargs):  # type: ignore[no-untyped-def]
        return SimpleNamespace(
            workspace_kind=WorkspaceKind.TEAM,
            access_type=WorkspaceAccessType.MEMBER,
            org_membership_id=uuid4(),
            is_org_owner=True,
            workspace_membership_id=uuid4(),
            visible_only=False,
            is_creator_admin=False,
        )

    def _fake_bind_project_tenant_context(*, project_id, runtime_id=None, scope=TenantScope.PROJECT, **_kwargs):  # type: ignore[no-untyped-def]
        tenant_calls["project"] = project_id
        tenant_calls["runtime"] = runtime_id
        tenant_calls["scope"] = scope
        return _tenant_context().with_project(project_id=project_id, runtime_id=runtime_id, scope=scope)

    monkeypatch.setattr("src.modules.projects.http.service.ProjectRepository", _FakeRepo)
    monkeypatch.setattr("src.modules.projects.http.service.require_active_workspace", _fake_require_active_workspace)
    monkeypatch.setattr(
        "src.modules.projects.http.service.find_active_org_membership", _fake_find_active_org_membership
    )
    monkeypatch.setattr(
        "src.modules.projects.http.service.resolve_member_workspace_context",
        _fake_resolve_member_workspace_context,
    )
    monkeypatch.setattr(
        "src.modules.projects.http.service.bind_project_tenant_context", _fake_bind_project_tenant_context
    )

    context = await get_project_context(project_id=project_id, user_id=user_id)

    assert tenant_calls == {
        "project": project_id,
        "runtime": runtime_id,
        "scope": TenantScope.PROJECT,
    }
    assert context.project_id == project_id
    assert context.workspace_id == workspace_id
    assert context.organization_id == organization_id
    assert context.runtime_id == runtime_id


@pytest.mark.asyncio
async def test_project_runtime_context_enriches_runtime_tenant_identity(monkeypatch: pytest.MonkeyPatch) -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    runtime_id = uuid4()
    site_id = uuid4()
    actor_user_id = uuid4()
    captured: dict[str, object] = {}

    service = ProjectRuntimeService(Settings())

    async def _fake_get_runtime_site(*, runtime_id):  # type: ignore[no-untyped-def]
        return SimpleNamespace(id=site_id, slug="site", default_locale="en-US", fallback_locale="en-US", is_active=True)

    async def _fake_workspace_get(*, id):  # type: ignore[no-untyped-def]
        return SimpleNamespace(id=id, organization_id=uuid4())

    async def _fake_bind_workspace_tenant_context(*, workspace_id, organization_id):  # type: ignore[no-untyped-def]
        captured["workspace"] = (workspace_id, organization_id)
        return _tenant_context()

    def _fake_bind_project_tenant_context(
        *, project_id, runtime_id=None, site_id=None, scope=TenantScope.PROJECT, **_kwargs
    ):  # type: ignore[no-untyped-def]
        captured["project"] = (project_id, runtime_id, site_id, scope)
        return _tenant_context().with_project(
            project_id=project_id, runtime_id=runtime_id, site_id=site_id, scope=scope
        )

    monkeypatch.setattr(service.project_repo, "get_runtime_site", _fake_get_runtime_site)
    monkeypatch.setattr("src.modules.projects.runtime.service.Workspace.get", _fake_workspace_get)
    monkeypatch.setattr(
        "src.modules.projects.runtime.service.bind_workspace_tenant_context",
        _fake_bind_workspace_tenant_context,
    )
    monkeypatch.setattr(
        "src.modules.projects.runtime.service.bind_project_tenant_context",
        _fake_bind_project_tenant_context,
    )

    runtime = SimpleNamespace(id=runtime_id, project_id=project_id, kind="preview", name="Preview", is_active=True)
    context = await service._build_context(
        runtime=cast(ProjectRuntimeRecord, runtime),
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
    )

    assert captured["project"] == (project_id, runtime_id, site_id, TenantScope.RUNTIME)
    assert context.project_id == project_id
    assert context.runtime_id == runtime_id
    assert context.site_id == site_id
    assert context.tenant_context.project_id == project_id
    assert context.tenant_context.runtime_id == runtime_id
    assert context.tenant_context.site_id == site_id
