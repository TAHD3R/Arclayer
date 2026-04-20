from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

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
async def test_project_runtime_service_creates_runtime_scoped_site(monkeypatch) -> None:
    runtime_id = uuid4()
    project_id = uuid4()
    workspace_id = uuid4()
    site_id = uuid4()

    service = ProjectRuntimeService(settings=SimpleNamespace())
    runtime = _FakeRuntime(runtime_id=runtime_id, project_id=project_id)
    project = _FakeProject(project_id=project_id, workspace_id=workspace_id)
    created_calls: list[dict[str, object]] = []

    async def fake_get_runtime_site(*, runtime_id):
        assert runtime_id == runtime.id
        return None

    async def fake_get_project_by_id(*, project_id):
        assert project_id == project.id
        return project

    async def fake_create_site(**kwargs):
        created_calls.append(kwargs)
        return SimpleNamespace(
            id=site_id,
            slug=kwargs["slug"],
            name=kwargs["name"],
            default_locale=kwargs["default_locale"],
            fallback_locale=kwargs["fallback_locale"],
            is_active=True,
        )

    monkeypatch.setattr(service.project_repo, "get_runtime_site", fake_get_runtime_site)
    monkeypatch.setattr(service.project_repo, "get_project_by_id", fake_get_project_by_id)
    monkeypatch.setattr(service.runtime_site_service.repo, "create_site", fake_create_site)

    context = await service._build_context(runtime=runtime, workspace_id=workspace_id, actor_user_id=None)

    assert created_calls == [
        {
            "workspace_id": workspace_id,
            "project_id": project_id,
            "runtime_id": runtime_id,
            "slug": project.slug,
            "name": f"{project.name} Site",
            "default_locale": "zh-CN",
            "fallback_locale": "en-US",
            "created_by_user_id": None,
        }
    ]
    assert context.runtime_id == runtime_id
    assert context.project_id == project_id
    assert context.workspace_id == workspace_id
    assert context.site_id == site_id


@pytest.mark.asyncio
async def test_project_runtime_service_reuses_attached_runtime_site(monkeypatch) -> None:
    runtime_id = uuid4()
    project_id = uuid4()
    workspace_id = uuid4()
    site_id = uuid4()

    service = ProjectRuntimeService(settings=SimpleNamespace())
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

    monkeypatch.setattr(service.project_repo, "get_runtime_site", fake_get_runtime_site)

    context = await service._build_context(runtime=runtime, workspace_id=workspace_id, actor_user_id=None)

    assert context.site_id == site_id
    assert context.runtime_id == runtime_id


@pytest.mark.asyncio
async def test_project_runtime_service_does_not_adopt_workspace_level_site(monkeypatch) -> None:
    runtime_id = uuid4()
    project_id = uuid4()
    workspace_id = uuid4()
    site_id = uuid4()

    service = ProjectRuntimeService(settings=SimpleNamespace())
    runtime = _FakeRuntime(runtime_id=runtime_id, project_id=project_id)
    project = _FakeProject(project_id=project_id, workspace_id=workspace_id)
    created_calls: list[dict[str, object]] = []

    async def fake_get_runtime_site(*, runtime_id):
        assert runtime_id == runtime.id
        return None

    async def fake_get_project_by_id(*, project_id):
        assert project_id == project.id
        return project

    async def fake_create_site(**kwargs):
        created_calls.append(kwargs)
        return SimpleNamespace(
            id=site_id,
            slug=kwargs["slug"],
            name=kwargs["name"],
            default_locale=kwargs["default_locale"],
            fallback_locale=kwargs["fallback_locale"],
            is_active=True,
        )

    monkeypatch.setattr(service.project_repo, "get_runtime_site", fake_get_runtime_site)
    monkeypatch.setattr(service.project_repo, "get_project_by_id", fake_get_project_by_id)
    monkeypatch.setattr(service.runtime_site_service.repo, "create_site", fake_create_site)

    context = await service._build_context(runtime=runtime, workspace_id=workspace_id, actor_user_id=None)

    assert created_calls == [
        {
            "workspace_id": workspace_id,
            "project_id": project_id,
            "runtime_id": runtime_id,
            "slug": project.slug,
            "name": f"{project.name} Site",
            "default_locale": "zh-CN",
            "fallback_locale": "en-US",
            "created_by_user_id": None,
        }
    ]
    assert context.site_id == site_id
    assert context.runtime_id == runtime_id
    assert context.project_id == project_id
