from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from uuid import uuid4

from src.config import get_settings
from src.models.organization.org_membership import OrgRole
from src.models.workspaces.workspace import Workspace
from src.modules.organization.workspaces.schema import OrganizationWorkspaceCreateRequest
from src.modules.organization.workspaces.service import OrganizationWorkspaceService


class _FakeWorkspace:
    def __init__(self) -> None:
        self.id = uuid4()
        self.slug = "founder-team"
        self.name = "Founder Team"
        self.description = None
        self.icon_mode = "initials"
        self.icon_color = "#337ea9"
        self.icon_glyph = None
        self.icon_emoji = None
        self.icon_url = None
        self.archived_at = None
        self.archived_by_user_id = None
        self.created_at = datetime.now(UTC)


def test_build_workspace_out_allows_missing_project(monkeypatch) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()
    service = OrganizationWorkspaceService(settings)

    workspace = _FakeWorkspace()
    organization_id = uuid4()

    out = service._build_workspace_out(
        organization_id=organization_id,
        workspace=cast(Workspace, workspace),
        member_count=1,
        members_preview=[],
        enterable=True,
        project_id=None,
    )

    assert out.workspace_id == workspace.id
    assert out.organization_id == organization_id
    assert out.project_id is None
    assert out.project is None


class _CreateWorkspaceRepository:
    def __init__(self, workspace: _FakeWorkspace) -> None:
        self.workspace = workspace

    async def create_workspace(self, **_kwargs: object) -> _FakeWorkspace:
        return self.workspace

    async def ensure_active_membership(self, **_kwargs: object) -> SimpleNamespace:
        return SimpleNamespace(id=uuid4())

    async def list_users(self, **_kwargs: object) -> list[object]:
        return []


class _WorkspaceSettingsService:
    def __init__(self, lifecycle: list[str]) -> None:
        self.lifecycle = lifecycle
        self.patch_calls: list[dict[str, object]] = []
        self.emit_calls: list[dict[str, object]] = []

    async def patch_core(self, **_kwargs: object) -> None:
        self.lifecycle.append("settings_patched")
        self.patch_calls.append(_kwargs)

    def emit_core_updated_event(self, **kwargs: object) -> None:
        self.lifecycle.append("webhook_dispatched")
        self.emit_calls.append(kwargs)


class _OfficialSkillProvisioner:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def provision(self, **kwargs: object) -> None:
        self.calls.append(kwargs)


async def test_create_workspace_provisions_official_skills_after_public_creation(monkeypatch) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    workspace = _FakeWorkspace()
    repository = _CreateWorkspaceRepository(workspace)
    provisioner = _OfficialSkillProvisioner()
    lifecycle: list[str] = []
    workspace_settings_service = _WorkspaceSettingsService(lifecycle)
    service = OrganizationWorkspaceService(
        get_settings(),
        repo=cast(object, repository),
        workspace_settings_service=cast(object, workspace_settings_service),
        official_skill_provisioner=cast(object, provisioner),
    )

    @asynccontextmanager
    async def _tx():
        lifecycle.append("transaction_started")
        yield object()
        lifecycle.append("transaction_committed")

    async def _noop(**_kwargs: object) -> None:
        return None

    monkeypatch.setattr(service, "tx", _tx)
    monkeypatch.setattr(service, "_ensure_operator_role_binding", _noop)
    monkeypatch.setattr(service, "_write_workspace_activity_event", _noop)
    organization_id = uuid4()
    actor_user_id = uuid4()

    result = await service.create_workspace(
        organization_id=organization_id,
        user_id=actor_user_id,
        org_role=OrgRole.OWNER,
        payload=OrganizationWorkspaceCreateRequest(name="Founder Team", template="blank"),
    )

    assert result.workspace_id == workspace.id
    assert workspace_settings_service.patch_calls[0]["emit_webhook"] is False
    assert workspace_settings_service.emit_calls == [
        {
            "workspace_id": workspace.id,
            "patch": {
                "content_strategy": {
                    "autosave": {"enabled": True, "interval_sec": 30, "save_on_blur": True},
                    "retention": {"draft_max_revisions": 100},
                }
            },
        }
    ]
    assert lifecycle == [
        "transaction_started",
        "settings_patched",
        "transaction_committed",
        "webhook_dispatched",
    ]
    assert provisioner.calls == [
        {
            "organization_id": organization_id,
            "workspace_id": workspace.id,
            "actor_user_id": actor_user_id,
        }
    ]
