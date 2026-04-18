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
async def test_create_project_bootstraps_memberships_and_returns_member_count(monkeypatch) -> None:
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
        return None

    monkeypatch.setattr(service, "_require_workspace", fake_require_workspace)
    monkeypatch.setattr(service.repo, "create_project", fake_create_project)
    monkeypatch.setattr(service.repo, "bootstrap_project_memberships", fake_bootstrap_project_memberships)
    monkeypatch.setattr(service.repo, "list_project_memberships", fake_list_project_memberships)
    monkeypatch.setattr(service.repo, "get_primary_runtime", fake_get_primary_runtime)

    class _WorkspaceModel:
        @classmethod
        async def get(cls, **kwargs):
            assert kwargs == {"id": workspace_id}
            return workspace

    monkeypatch.setattr("src.modules.projects.service.Workspace", _WorkspaceModel)

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
    assert out.id == project.id
    assert out.member_count == 1
    assert len(out.members_preview) == 1
