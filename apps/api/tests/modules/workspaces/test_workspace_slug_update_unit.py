from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from apps.api.src.config import get_settings
from apps.api.src.core.exceptions import BadRequest, Conflict
from apps.api.src.modules.workspaces.schema import WorkspaceUpdateRequest
from apps.api.src.modules.workspaces.service import WorkspaceService
from apps.api.src.modules.workspaces.slug.service import parse_explicit_workspace_slug


class _FakeWorkspace:
    def __init__(self, *, organization_id: UUID, slug: str) -> None:
        self.id = uuid4()
        self.organization_id = organization_id
        self.slug = slug
        self.name = "demo"
        self.icon_url = None
        self.is_active = True
        self.saved_update_fields: list[str] | None = None

    async def save(self, *, update_fields: list[str]) -> None:
        self.saved_update_fields = list(update_fields)


def _install_workspace_fakes(monkeypatch, *, ws: _FakeWorkspace, duplicate_slug_exists: bool) -> None:
    class _Query:
        def __init__(self, *, exists: bool) -> None:
            self._exists = exists

        def exclude(self, **_kwargs):
            return self

        async def exists(self) -> bool:
            return self._exists

    class _WorkspaceModel:
        @classmethod
        async def get_or_none(cls, **kwargs):
            if (
                kwargs.get("id") == ws.id
                and kwargs.get("organization_id") == ws.organization_id
                and kwargs.get("is_active")
            ):
                return ws
            return None

        @classmethod
        def filter(cls, **_kwargs):
            return _Query(exists=duplicate_slug_exists)

    monkeypatch.setattr("apps.api.src.modules.workspaces.service.Workspace", _WorkspaceModel)


def test_parse_explicit_workspace_slug_rejects_reserved() -> None:
    normalized, err = parse_explicit_workspace_slug("api")
    assert normalized == "api"
    assert err == "reserved"


async def test_update_workspace_rejects_reserved_slug(monkeypatch) -> None:
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    settings = get_settings()
    service = WorkspaceService(settings)

    org_id = uuid4()
    ws = _FakeWorkspace(organization_id=org_id, slug="demo")
    _install_workspace_fakes(monkeypatch, ws=ws, duplicate_slug_exists=False)

    payload = WorkspaceUpdateRequest(slug="api")
    with pytest.raises(BadRequest) as exc:
        await service.update_workspace(
            organization_id=org_id,
            workspace_id=ws.id,
            payload=payload,
            actor_user_id=uuid4(),
        )
    assert exc.value.error == "WORKSPACE_SLUG_RESERVED"


async def test_update_workspace_rejects_duplicate_slug(monkeypatch) -> None:
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    settings = get_settings()
    service = WorkspaceService(settings)

    org_id = uuid4()
    ws = _FakeWorkspace(organization_id=org_id, slug="demo")
    _install_workspace_fakes(monkeypatch, ws=ws, duplicate_slug_exists=True)

    payload = WorkspaceUpdateRequest(slug="new-slug")
    with pytest.raises(Conflict) as exc:
        await service.update_workspace(
            organization_id=org_id,
            workspace_id=ws.id,
            payload=payload,
            actor_user_id=uuid4(),
        )
    assert exc.value.error == "WORKSPACE_SLUG_EXISTS"


async def test_update_workspace_updates_slug_when_unique(monkeypatch) -> None:
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    settings = get_settings()
    service = WorkspaceService(settings)

    org_id = uuid4()
    ws = _FakeWorkspace(organization_id=org_id, slug="demo")
    _install_workspace_fakes(monkeypatch, ws=ws, duplicate_slug_exists=False)

    payload = WorkspaceUpdateRequest(slug="new-slug")
    out = await service.update_workspace(
        organization_id=org_id,
        workspace_id=ws.id,
        payload=payload,
        actor_user_id=uuid4(),
    )
    assert out.slug == "new-slug"
    assert ws.slug == "new-slug"
    assert ws.saved_update_fields is not None
    assert "slug" in ws.saved_update_fields


async def test_update_workspace_rejects_icon_url_too_long(monkeypatch) -> None:
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    settings = get_settings()
    service = WorkspaceService(settings)

    org_id = uuid4()
    ws = _FakeWorkspace(organization_id=org_id, slug="demo")
    _install_workspace_fakes(monkeypatch, ws=ws, duplicate_slug_exists=False)

    payload = WorkspaceUpdateRequest.model_construct(icon_url="x" * 1025)
    with pytest.raises(BadRequest) as exc:
        await service.update_workspace(
            organization_id=org_id,
            workspace_id=ws.id,
            payload=payload,
            actor_user_id=uuid4(),
        )
    assert exc.value.error == "WORKSPACE_ICON_URL_TOO_LONG"
