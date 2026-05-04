from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from src.config import get_settings
from src.modules.projects.schema import ProjectCreateRequest
from src.modules.projects.service import ProjectService


class _FakeProject:
    def __init__(self, *, workspace_id):
        self.id = uuid4()
        self.workspace_id = workspace_id
        self.created_at = datetime.now(UTC)
        self.updated_at = self.created_at
        self.slug = "project-alpha"
        self.name = "Project Alpha"
        self.description = None
        self.icon_mode = "initials"
        self.icon_color = "#337ea9"
        self.icon_glyph = None
        self.icon_emoji = None
        self.icon_url = None
        self.is_active = True


class _FakeWorkspace:
    def __init__(self, *, workspace_id):
        self.id = workspace_id
        self.organization_id = uuid4()


class _FakeProjectRepository:
    def __init__(
        self,
        *,
        project: _FakeProject,
        workspace: _FakeWorkspace,
    ) -> None:
        self.project = project
        self.workspace = workspace
        self.archived_project_id = None
        self.deleted_project_id = None

    async def get_project_by_id(self, *, project_id):
        assert project_id == self.project.id
        return self.project

    async def get_project_with_workspace(self, *, project_id):
        assert project_id == self.project.id
        return self.project, self.workspace

    async def set_project_active(self, *, project_id, is_active):
        assert project_id == self.project.id
        self.archived_project_id = project_id
        self.project.is_active = is_active
        return self.project

    async def delete_project(self, *, project_id):
        assert project_id == self.project.id
        self.deleted_project_id = project_id
        return True


class _FakeMembership:
    def __init__(self) -> None:
        self.project_id = uuid4()
        self.user = type(
            "UserRef",
            (),
            {
                "id": uuid4(),
                "username": "philip",
                "display_name": "Philip",
                "email": "philip@example.com",
                "avatar_url": None,
            },
        )()


@pytest.mark.asyncio
async def test_create_project_bootstraps_memberships_provisions_runtime_site_and_returns_member_count(
    monkeypatch,
) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()
    service = ProjectService(settings)

    workspace_id = uuid4()
    actor_user_id = uuid4()
    project = _FakeProject(workspace_id=workspace_id)
    workspace = _FakeWorkspace(workspace_id=workspace_id)
    membership = _FakeMembership()
    membership.project_id = project.id
    bootstrap_calls: list[tuple] = []
    provision_calls: list[dict[str, object]] = []
    runtime = type(
        "RuntimeRef",
        (),
        {
            "id": uuid4(),
            "project_id": project.id,
            "kind": "primary",
            "name": "Primary",
            "is_active": True,
        },
    )()

    async def fake_require_workspace(*, workspace_id):
        return None

    async def fake_create_project(**kwargs):
        return project

    async def fake_bootstrap_project_memberships(*, project_id, workspace_id, actor_user_id):
        bootstrap_calls.append((project_id, workspace_id, actor_user_id))

    async def fake_list_project_memberships(*, project_ids):
        assert project_ids == [project.id]
        return [membership]

    async def fake_get_primary_runtime(*, project_id):
        assert project_id == project.id
        return runtime

    async def fake_get_or_create_site_for_project_runtime(**kwargs):
        provision_calls.append(kwargs)
        return type("SiteRef", (), {"id": uuid4()})()

    async def fake_get_active_workspace_by_id(*, workspace_id):
        assert workspace_id == workspace.id
        return workspace

    monkeypatch.setattr(service, "_require_workspace", fake_require_workspace)
    monkeypatch.setattr(service.repo, "create_project", fake_create_project)
    monkeypatch.setattr(service.repo, "bootstrap_project_memberships", fake_bootstrap_project_memberships)
    monkeypatch.setattr(service.repo, "list_project_memberships", fake_list_project_memberships)
    monkeypatch.setattr(service.repo, "get_primary_runtime", fake_get_primary_runtime)
    monkeypatch.setattr(service.workspace_repo, "get_active_workspace_by_id", fake_get_active_workspace_by_id)
    monkeypatch.setattr(
        service.runtime_site_service,
        "get_or_create_site_for_project_runtime",
        fake_get_or_create_site_for_project_runtime,
    )

    out = await service.create_project(
        workspace_id=workspace_id,
        payload=ProjectCreateRequest.model_construct(
            workspace_id=workspace_id,
            name="Project Alpha",
            slug="project-alpha",
            description=None,
        ),
        actor_user_id=actor_user_id,
    )

    assert bootstrap_calls == [(project.id, workspace_id, actor_user_id)]
    assert provision_calls == [
        {
            "workspace_id": workspace_id,
            "project_id": project.id,
            "runtime_id": runtime.id,
            "project_slug": project.slug,
            "project_name": project.name,
            "actor_user_id": actor_user_id,
        }
    ]
    assert out.id == project.id
    assert out.member_count == 1
    assert len(out.members_preview) == 1


@pytest.mark.asyncio
async def test_project_danger_capabilities_allow_last_active_project(monkeypatch) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()
    service = ProjectService(settings)

    workspace_id = uuid4()
    project = _FakeProject(workspace_id=workspace_id)
    workspace = _FakeWorkspace(workspace_id=workspace_id)
    service.repo = _FakeProjectRepository(project=project, workspace=workspace)

    out = await service.get_danger_capabilities(
        project_id=project.id,
        can_manage_settings=True,
    )

    assert out.archive_action.enabled is True
    assert out.archive_action.blocked_reason is None
    assert out.delete_action.enabled is True
    assert out.delete_action.blocked_reason is None


@pytest.mark.asyncio
async def test_project_archive_and_delete_allow_last_active_project(monkeypatch) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()
    workspace_id = uuid4()
    workspace = _FakeWorkspace(workspace_id=workspace_id)

    archive_service = ProjectService(settings)
    archive_project = _FakeProject(workspace_id=workspace_id)
    archive_repo = _FakeProjectRepository(project=archive_project, workspace=workspace)
    archive_service.repo = archive_repo

    archive_out = await archive_service.archive_project(project_id=archive_project.id)

    assert archive_out.project_id == archive_project.id
    assert archive_out.is_active is False
    assert archive_repo.archived_project_id == archive_project.id

    delete_service = ProjectService(settings)
    delete_project = _FakeProject(workspace_id=workspace_id)
    delete_repo = _FakeProjectRepository(project=delete_project, workspace=workspace)
    delete_service.repo = delete_repo

    delete_out = await delete_service.delete_project(project_id=delete_project.id)

    assert delete_out.project_id == delete_project.id
    assert delete_out.deleted is True
    assert delete_repo.deleted_project_id == delete_project.id
