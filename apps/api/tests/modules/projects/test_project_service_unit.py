from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from src.config import get_settings
from src.models.projects._enums import ProjectAuthoringMode, ProjectAuthoringState
from src.modules.projects.repository import ProjectRepository
from src.modules.projects.schema import ProjectCreateRequest
from src.modules.projects.service import ProjectService


async def _async_value(value):
    return value


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
        self.authoring_mode = ProjectAuthoringMode.BUILDER_MANAGED
        self.authoring_state = ProjectAuthoringState.READY
        self.authoring_revision = 1
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

    async def set_project_active(self, *, project_id, is_active, conn=None):
        assert project_id == self.project.id
        self.archived_project_id = project_id
        self.project.is_active = is_active
        return self.project

    async def delete_project(self, *, project_id, conn=None):
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
    tx_conn = object()
    bootstrap_calls: list[tuple] = []
    provision_calls: list[dict[str, object]] = []
    activity_events: list[dict[str, object]] = []
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
        assert kwargs["conn"] is tx_conn
        assert kwargs["authoring_mode"] is ProjectAuthoringMode.BUILDER_MANAGED
        return project

    async def fake_bootstrap_project_memberships(*, project_id, workspace_id, actor_user_id, conn):
        assert conn is tx_conn
        bootstrap_calls.append((project_id, workspace_id, actor_user_id, conn))

    async def fake_list_project_memberships(*, project_ids):
        assert project_ids == [project.id]
        return [membership]

    async def fake_get_primary_runtime(*, project_id, conn=None):
        assert project_id == project.id
        if conn is not None:
            assert conn is tx_conn
        return runtime

    async def fake_get_or_create_site_for_project_runtime(**kwargs):
        assert kwargs["conn"] is tx_conn
        provision_calls.append(kwargs)
        return type("SiteRef", (), {"id": uuid4()})()

    async def fake_get_active_workspace_by_id(*, workspace_id):
        assert workspace_id == workspace.id
        return workspace

    @asynccontextmanager
    async def fake_tx(*, conn=None):
        assert conn is None
        yield tx_conn

    async def fake_write_project_activity_event(**kwargs):
        assert kwargs["conn"] is tx_conn
        activity_events.append(kwargs)

    monkeypatch.setattr(service, "tx", fake_tx)
    monkeypatch.setattr(service, "_require_workspace", fake_require_workspace)
    monkeypatch.setattr(service, "_reserved_project_slugs", lambda: _async_value(frozenset()))
    monkeypatch.setattr(service, "_write_project_activity_event", fake_write_project_activity_event)
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
            authoring_mode=ProjectAuthoringMode.BUILDER_MANAGED,
            name="Project Alpha",
            slug="project-alpha",
            description=None,
        ),
        actor_user_id=actor_user_id,
    )

    assert bootstrap_calls == [(project.id, workspace_id, actor_user_id, tx_conn)]
    assert provision_calls == [
        {
            "workspace_id": workspace_id,
            "project_id": project.id,
            "runtime_id": runtime.id,
            "project_slug": project.slug,
            "project_name": project.name,
            "actor_user_id": actor_user_id,
            "conn": tx_conn,
        }
    ]
    assert activity_events == [
        {
            "event_name": "project.created",
            "workspace_id": workspace_id,
            "project_id": project.id,
            "actor_user_id": actor_user_id,
            "properties": {
                "created": True,
                "slug": project.slug,
                "authoringMode": "builder_managed",
                "initialized": ["primary_runtime", "environments", "runtime_site", "platform_domain_binding"],
            },
            "conn": tx_conn,
        }
    ]
    assert out.id == project.id
    assert out.member_count == 1
    assert len(out.members_preview) == 1


@pytest.mark.asyncio
async def test_reserved_project_slugs_include_system_domain_labels(monkeypatch) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()
    service = ProjectService(settings)

    async def fake_core_settings(_settings):
        return {"domains": {"reserved_labels": ["app", "Launch"]}}

    monkeypatch.setattr(
        "src.modules.projects.service.get_core_settings_value_cached",
        fake_core_settings,
    )

    assert "api" in await service._reserved_project_slugs()
    assert "launch" in await service._reserved_project_slugs()


@pytest.mark.asyncio
async def test_project_slug_availability_uses_configured_reserved_labels() -> None:
    repo = ProjectRepository()

    normalized_slug, reason = await repo.check_slug_availability(
        workspace_id=uuid4(),
        slug="Launch",
        reserved_slugs=frozenset({"launch"}),
    )

    assert normalized_slug == "launch"
    assert reason == "reserved"


@pytest.mark.asyncio
async def test_next_available_project_slug_skips_reserved_labels(monkeypatch) -> None:
    repo = ProjectRepository()

    async def fake_slug_exists(**kwargs):
        return False

    monkeypatch.setattr(repo, "slug_exists", fake_slug_exists)

    slug = await repo._next_available_slug(
        workspace_id=uuid4(),
        name="api",
        reserved_slugs=frozenset({"api"}),
    )

    assert slug == "api-2"


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
    events: list[str] = []

    async def fake_write_project_activity_event(**kwargs):
        events.append(kwargs["event_name"])

    @asynccontextmanager
    async def fake_tx(*, conn=None):
        yield conn

    archive_service = ProjectService(settings)
    archive_project = _FakeProject(workspace_id=workspace_id)
    archive_repo = _FakeProjectRepository(project=archive_project, workspace=workspace)
    archive_service.repo = archive_repo
    monkeypatch.setattr(archive_service, "tx", fake_tx)
    monkeypatch.setattr(archive_service, "_write_project_activity_event", fake_write_project_activity_event)

    archive_out = await archive_service.archive_project(project_id=archive_project.id, actor_user_id=uuid4())

    assert archive_out.project_id == archive_project.id
    assert archive_out.is_active is False
    assert archive_repo.archived_project_id == archive_project.id
    assert events == ["project.archived"]

    delete_service = ProjectService(settings)
    delete_project = _FakeProject(workspace_id=workspace_id)
    delete_repo = _FakeProjectRepository(project=delete_project, workspace=workspace)
    delete_service.repo = delete_repo
    monkeypatch.setattr(delete_service, "tx", fake_tx)
    monkeypatch.setattr(delete_service, "_write_project_activity_event", fake_write_project_activity_event)

    delete_out = await delete_service.delete_project(project_id=delete_project.id, actor_user_id=uuid4())

    assert delete_out.project_id == delete_project.id
    assert delete_out.deleted is True
    assert delete_repo.deleted_project_id == delete_project.id
    assert events == ["project.archived", "project.deleted"]
