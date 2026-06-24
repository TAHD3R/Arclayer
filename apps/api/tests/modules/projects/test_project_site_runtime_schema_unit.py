from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest

from src.config import Settings
from src.core.exceptions import NotFound
from src.models.projects.runtime import ProjectRuntimeRecord
from src.modules.projects.runtime import service as runtime_service
from src.modules.projects.runtime.service import ProjectRuntimeService


class _FakeRuntime:
    def __init__(self, *, runtime_id, project_id, kind: str = "primary", name: str = "Primary") -> None:
        self.id = runtime_id
        self.project_id = project_id
        self.kind = kind
        self.name = name
        self.is_active = True


class _FakeProject:
    def __init__(self, *, project_id, workspace_id, slug="project-alpha", name="Project Alpha") -> None:
        self.id = project_id
        self.workspace_id = workspace_id
        self.slug = slug
        self.name = name


@pytest.mark.asyncio
async def test_project_runtime_service_requires_existing_runtime_scoped_site(monkeypatch) -> None:
    runtime_id = uuid4()
    project_id = uuid4()
    workspace_id = uuid4()

    service = ProjectRuntimeService(settings=Settings())
    runtime = _FakeRuntime(runtime_id=runtime_id, project_id=project_id)

    async def fake_get_runtime_site(*, runtime_id):
        assert runtime_id == runtime.id
        return None

    monkeypatch.setattr(service.project_repo, "get_runtime_site", fake_get_runtime_site)

    with pytest.raises(NotFound) as exc_info:
        await service._build_context(
            runtime=cast(ProjectRuntimeRecord, runtime),
            workspace_id=workspace_id,
            actor_user_id=None,
        )

    assert exc_info.value.error == "PROJECT_RUNTIME_SITE_NOT_FOUND"


@pytest.mark.asyncio
async def test_project_runtime_service_reuses_attached_runtime_site(monkeypatch) -> None:
    runtime_id = uuid4()
    project_id = uuid4()
    workspace_id = uuid4()
    site_id = uuid4()

    service = ProjectRuntimeService(settings=Settings())
    runtime = _FakeRuntime(runtime_id=runtime_id, project_id=project_id)
    site = SimpleNamespace(
        id=site_id,
        slug="project-alpha",
        name="Project Alpha Site",
        default_locale="zh-CN",
        fallback_locale="en-US",
        is_active=True,
    )

    async def fake_get_runtime_site(*, runtime_id):
        assert runtime_id == runtime.id
        return site

    async def fake_workspace_get(*, id):
        assert id == workspace_id
        return SimpleNamespace(id=workspace_id, organization_id=uuid4())

    async def fake_bind_workspace_tenant_context(*, workspace_id, organization_id):
        return None

    def fake_bind_project_tenant_context(**kwargs):
        from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode

        return TenantContext(
            identity=TenantIdentity(
                organization_id=uuid4(),
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                site_id=site_id,
                schema_name="workspace_1234567890abcdefghij",
                isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
            )
        )

    monkeypatch.setattr(service.project_repo, "get_runtime_site", fake_get_runtime_site)
    monkeypatch.setattr(runtime_service.Workspace, "get", fake_workspace_get)
    monkeypatch.setattr(runtime_service, "bind_workspace_tenant_context", fake_bind_workspace_tenant_context)
    monkeypatch.setattr(runtime_service, "bind_project_tenant_context", fake_bind_project_tenant_context)

    context = await service._build_context(
        runtime=cast(ProjectRuntimeRecord, runtime),
        workspace_id=workspace_id,
        actor_user_id=None,
    )

    assert context.site_id == site_id
    assert context.runtime_id == runtime_id


@pytest.mark.asyncio
async def test_project_runtime_service_does_not_adopt_workspace_level_site(monkeypatch) -> None:
    runtime_id = uuid4()
    project_id = uuid4()
    workspace_id = uuid4()

    service = ProjectRuntimeService(settings=Settings())
    runtime = _FakeRuntime(runtime_id=runtime_id, project_id=project_id)

    async def fake_get_runtime_site(*, runtime_id):
        assert runtime_id == runtime.id
        return None

    monkeypatch.setattr(service.project_repo, "get_runtime_site", fake_get_runtime_site)

    with pytest.raises(NotFound) as exc_info:
        await service._build_context(
            runtime=cast(ProjectRuntimeRecord, runtime),
            workspace_id=workspace_id,
            actor_user_id=None,
        )

    assert exc_info.value.error == "PROJECT_RUNTIME_SITE_NOT_FOUND"
