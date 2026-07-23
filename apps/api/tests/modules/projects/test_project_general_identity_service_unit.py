from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, cast
from uuid import UUID, uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import Conflict
from src.models.projects.project import ProjectRecord
from src.modules.analytics.audit import ActivityAuditPayload
from src.modules.projects.settings.general_identity_repository import ProjectGeneralIdentityRepository
from src.modules.projects.settings.general_identity_service import (
    PROJECT_GENERAL_IDENTITY_ETAG_MISMATCH,
    PROJECT_GENERAL_IDENTITY_INVALID,
    PROJECT_GENERAL_IDENTITY_UPDATED_EVENT,
    ProjectGeneralIdentityService,
)


@dataclass
class _FakeProject:
    id: UUID
    workspace_id: UUID
    name: str = "Arclayer"
    description: str | None = None
    icon_mode: str = "initials"
    icon_color: str = "#337ea9"
    icon_glyph: str | None = None
    icon_emoji: str | None = None
    icon_url: str | None = None


class _FakeConn:
    pass


class _FakeRepository:
    def __init__(self, project: _FakeProject) -> None:
        self.project = project
        self.locked = False
        self.saved: list[dict[str, Any]] = []

    async def get_identity(self, *, project_id: UUID) -> ProjectRecord:
        assert project_id == self.project.id
        return cast(ProjectRecord, self.project)

    async def get_identity_for_update(self, *, project_id: UUID, conn) -> ProjectRecord:
        assert project_id == self.project.id
        assert isinstance(conn, _FakeConn)
        self.locked = True
        return cast(ProjectRecord, self.project)

    async def save_identity(
        self,
        *,
        project_id: UUID,
        values: dict[str, Any],
        conn,
    ) -> None:
        assert project_id == self.project.id
        assert isinstance(conn, _FakeConn)
        self.saved.append(values)
        for field, value in values.items():
            setattr(self.project, field, value)


def _build_service(
    monkeypatch: pytest.MonkeyPatch,
    repository: _FakeRepository,
) -> tuple[ProjectGeneralIdentityService, _FakeConn]:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    service = ProjectGeneralIdentityService(
        get_settings(),
        repository=cast(ProjectGeneralIdentityRepository, repository),
    )
    conn = _FakeConn()

    @asynccontextmanager
    async def fake_tx(*, conn=None):
        assert conn is None
        yield cast(Any, conn_value)

    conn_value = conn
    monkeypatch.setattr(service, "tx", fake_tx)
    return service, conn


def _capture_activity(monkeypatch: pytest.MonkeyPatch) -> list[tuple[ActivityAuditPayload, object]]:
    captured: list[tuple[ActivityAuditPayload, object]] = []

    async def fake_write_required_activity_event(*, settings, payload, conn=None):
        assert settings
        captured.append((payload, conn))
        return object()

    monkeypatch.setattr(
        "src.modules.projects.settings.general_identity_service.write_required_activity_event",
        fake_write_required_activity_event,
    )
    return captured


@pytest.mark.asyncio
async def test_replace_identity_writes_changed_fields_and_value_free_activity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project = _FakeProject(id=uuid4(), workspace_id=uuid4(), description="Old description")
    repository = _FakeRepository(project)
    service, conn = _build_service(monkeypatch, repository)
    captured = _capture_activity(monkeypatch)
    current = await service.get_identity(project_id=project.id)
    replacement = current.value.model_copy(update={"name": "Studio", "description": "New description"})

    result = await service.replace_identity(
        project_id=project.id,
        replacement=replacement,
        expected_etag=current.etag,
        actor_user_id=uuid4(),
        source="agent",
    )

    assert repository.locked is True
    assert repository.saved == [{"name": "Studio", "description": "New description"}]
    assert result.etag != current.etag
    payload, activity_conn = captured[0]
    assert activity_conn is conn
    assert payload.event_name == PROJECT_GENERAL_IDENTITY_UPDATED_EVENT
    assert payload.source == "agent"
    assert payload.properties["paths"] == ["project.name", "project.description"]
    assert payload.properties["previous_etag"] == current.etag
    assert payload.properties["etag"] == result.etag
    assert "name" not in payload.properties
    assert "description" not in payload.properties


@pytest.mark.asyncio
async def test_replace_identity_rejects_stale_etag_without_save_or_activity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project = _FakeProject(id=uuid4(), workspace_id=uuid4())
    repository = _FakeRepository(project)
    service, _conn = _build_service(monkeypatch, repository)
    captured = _capture_activity(monkeypatch)
    current = await service.get_identity(project_id=project.id)

    with pytest.raises(Conflict) as exc_info:
        await service.replace_identity(
            project_id=project.id,
            replacement=current.value.model_copy(update={"name": "Other"}),
            expected_etag='"stale"',
            actor_user_id=uuid4(),
        )

    assert exc_info.value.error == PROJECT_GENERAL_IDENTITY_ETAG_MISMATCH
    assert exc_info.value.meta == {"facade": "identity", "currentEtag": current.etag}
    assert repository.saved == []
    assert captured == []


@pytest.mark.asyncio
async def test_semantic_noop_does_not_save_or_emit_activity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project = _FakeProject(id=uuid4(), workspace_id=uuid4(), icon_glyph="stale-inactive-value")
    repository = _FakeRepository(project)
    service, _conn = _build_service(monkeypatch, repository)
    captured = _capture_activity(monkeypatch)
    current = await service.get_identity(project_id=project.id)

    result = await service.replace_identity(
        project_id=project.id,
        replacement=current.value,
        expected_etag=current.etag,
        actor_user_id=uuid4(),
    )

    assert current.value.icon_glyph is None
    assert result == current
    assert repository.saved == []
    assert captured == []


@pytest.mark.asyncio
async def test_invalid_persisted_active_icon_surfaces_stable_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project = _FakeProject(id=uuid4(), workspace_id=uuid4(), icon_mode="emoji", icon_emoji=None)
    service, _conn = _build_service(monkeypatch, _FakeRepository(project))

    with pytest.raises(Conflict) as exc_info:
        await service.get_identity(project_id=project.id)

    assert exc_info.value.error == PROJECT_GENERAL_IDENTITY_INVALID
