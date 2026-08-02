from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import Forbidden
from src.models.workspaces.workspace import Workspace
from src.modules.commerce.service import CommerceService
from src.modules.organization.workspaces.repository import OrganizationWorkspaceRepository
from src.modules.organization.workspaces.schema import (
    OrganizationWorkspaceCreateRequest,
    OrganizationWorkspaceTemplate,
)
from src.modules.organization.workspaces.service import OrganizationWorkspaceService
from src.modules.tenancy.guidance_provisioner import KnowledgeGuidanceLayerProvisioner
from src.modules.workspaces.settings.service import WorkspaceSettingsService
from src.modules.workspaces.skills.default_provisioner import WorkspaceOfficialSkillProvisioner


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
    service = OrganizationWorkspaceService(
        settings,
        guidance_layer_provisioner=cast(KnowledgeGuidanceLayerProvisioner, _GuidanceLayerProvisioner()),
    )

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


class _GuidanceLayerProvisioner:
    def __init__(self, lifecycle: list[str] | None = None) -> None:
        self.lifecycle = lifecycle
        self.workspace_calls: list[dict[str, object]] = []
        self.project_calls: list[dict[str, object]] = []

    async def provision_workspace_layer(self, **kwargs: object) -> None:
        if self.lifecycle is not None:
            self.lifecycle.append("guidance_layer_provisioned")
        self.workspace_calls.append(kwargs)

    async def provision_project_layer(self, **kwargs: object) -> None:
        self.project_calls.append(kwargs)


class _FailingWorkspaceGuidanceLayerProvisioner(_GuidanceLayerProvisioner):
    async def provision_workspace_layer(self, **kwargs: object) -> None:
        await super().provision_workspace_layer(**kwargs)
        raise RuntimeError("guidance layer provision failed")


class _CommerceService:
    def __init__(self, lifecycle: list[str]) -> None:
        self.lifecycle = lifecycle

    async def initialize_free_workspace_in_transaction(self, **_kwargs: object) -> None:
        self.lifecycle.append("commerce_initialized")


async def test_create_workspace_provisions_canonical_layer_in_transaction_before_public_followups(monkeypatch) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    workspace = _FakeWorkspace()
    repository = _CreateWorkspaceRepository(workspace)
    provisioner = _OfficialSkillProvisioner()
    lifecycle: list[str] = []
    guidance_layer_provisioner = _GuidanceLayerProvisioner(lifecycle)
    workspace_settings_service = _WorkspaceSettingsService(lifecycle)
    commerce_service = _CommerceService(lifecycle)
    service = OrganizationWorkspaceService(
        get_settings(),
        repo=cast(OrganizationWorkspaceRepository, repository),
        workspace_settings_service=cast(WorkspaceSettingsService, workspace_settings_service),
        official_skill_provisioner=cast(WorkspaceOfficialSkillProvisioner, provisioner),
        commerce_service=cast(CommerceService, commerce_service),
        guidance_layer_provisioner=cast(KnowledgeGuidanceLayerProvisioner, guidance_layer_provisioner),
    )

    tx_conn = object()

    @asynccontextmanager
    async def _tx():
        lifecycle.append("transaction_started")
        yield tx_conn
        lifecycle.append("transaction_committed")

    async def _noop(**_kwargs: object) -> None:
        return None

    monkeypatch.setattr(service, "tx", _tx)
    monkeypatch.setattr(service, "_write_workspace_activity_event", _noop)
    organization_id = uuid4()
    actor_user_id = uuid4()

    result = await service.create_workspace(
        organization_id=organization_id,
        user_id=actor_user_id,
        payload=OrganizationWorkspaceCreateRequest(
            name="Founder Team",
            template=OrganizationWorkspaceTemplate.BLANK,
        ),
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
        "guidance_layer_provisioned",
        "commerce_initialized",
        "settings_patched",
        "transaction_committed",
        "webhook_dispatched",
    ]
    assert guidance_layer_provisioner.workspace_calls == [
        {
            "organization_id": organization_id,
            "workspace_id": workspace.id,
            "actor_user_id": actor_user_id,
            "conn": tx_conn,
        }
    ]
    assert guidance_layer_provisioner.project_calls == []
    assert provisioner.calls == [
        {
            "organization_id": organization_id,
            "workspace_id": workspace.id,
            "actor_user_id": actor_user_id,
        }
    ]


async def test_create_workspace_rolls_back_when_canonical_layer_provisioning_fails(monkeypatch) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    workspace = _FakeWorkspace()
    repository = _CreateWorkspaceRepository(workspace)
    lifecycle: list[str] = []
    guidance_layer_provisioner = _FailingWorkspaceGuidanceLayerProvisioner(lifecycle)
    official_skill_provisioner = _OfficialSkillProvisioner()
    commerce_service = _CommerceService(lifecycle)
    workspace_settings_service = _WorkspaceSettingsService(lifecycle)
    service = OrganizationWorkspaceService(
        get_settings(),
        repo=cast(OrganizationWorkspaceRepository, repository),
        workspace_settings_service=cast(WorkspaceSettingsService, workspace_settings_service),
        official_skill_provisioner=cast(WorkspaceOfficialSkillProvisioner, official_skill_provisioner),
        commerce_service=cast(CommerceService, commerce_service),
        guidance_layer_provisioner=cast(KnowledgeGuidanceLayerProvisioner, guidance_layer_provisioner),
    )
    tx_conn = object()

    @asynccontextmanager
    async def _tx():
        lifecycle.append("transaction_started")
        try:
            yield tx_conn
        except BaseException:
            lifecycle.append("transaction_rolled_back")
            raise
        else:
            lifecycle.append("transaction_committed")

    monkeypatch.setattr(service, "tx", _tx)
    monkeypatch.setattr(service, "_write_workspace_activity_event", AsyncMock())
    organization_id = uuid4()
    actor_user_id = uuid4()

    with pytest.raises(RuntimeError, match="guidance layer provision failed"):
        await service.create_workspace(
            organization_id=organization_id,
            user_id=actor_user_id,
            payload=OrganizationWorkspaceCreateRequest(
                name="Rollback Workspace",
                template=OrganizationWorkspaceTemplate.BLANK,
            ),
        )

    assert lifecycle == [
        "transaction_started",
        "guidance_layer_provisioned",
        "transaction_rolled_back",
    ]
    assert guidance_layer_provisioner.workspace_calls == [
        {
            "organization_id": organization_id,
            "workspace_id": workspace.id,
            "actor_user_id": actor_user_id,
            "conn": tx_conn,
        }
    ]
    assert workspace_settings_service.patch_calls == []
    assert workspace_settings_service.emit_calls == []
    assert official_skill_provisioner.calls == []


async def test_delete_rejects_non_owner_with_explicit_forbidden(monkeypatch) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    organization_id = uuid4()
    workspace_id = uuid4()
    actor_user_id = uuid4()
    stale_workspace = SimpleNamespace(
        id=workspace_id,
        organization_id=organization_id,
        owner_user_id=actor_user_id,
        name="Workspace",
        is_active=True,
        deleted_at=None,
        delete=AsyncMock(),
    )
    locked_workspace = SimpleNamespace(
        id=workspace_id,
        organization_id=organization_id,
        owner_user_id=uuid4(),
        name="Workspace",
        is_active=True,
        deleted_at=None,
        delete=AsyncMock(),
    )
    repository = SimpleNamespace(
        get_active_workspace=AsyncMock(return_value=stale_workspace),
        get_by_id_for_update=AsyncMock(return_value=locked_workspace),
    )
    service = OrganizationWorkspaceService(
        get_settings(),
        repo=cast(OrganizationWorkspaceRepository, repository),
        guidance_layer_provisioner=cast(KnowledgeGuidanceLayerProvisioner, _GuidanceLayerProvisioner()),
    )

    @asynccontextmanager
    async def _tx():
        yield object()

    monkeypatch.setattr(service, "tx", _tx)
    monkeypatch.setattr(service, "_write_workspace_activity_event", AsyncMock())

    with pytest.raises(Forbidden) as exc:
        await service.delete_workspace(
            organization_id=organization_id,
            workspace_id=workspace_id,
            user_id=actor_user_id,
            confirm_name="Workspace",
        )

    assert exc.value.error == "WORKSPACE_OWNER_REQUIRED"
    locked_workspace.delete.assert_not_awaited()
    stale_workspace.delete.assert_not_awaited()
