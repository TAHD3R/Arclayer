from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from src.core.exceptions import Forbidden, NotFound
from src.models.organization.org_membership import OrgRole
from src.modules.workspaces import service as ws_service
from src.modules.workspaces.http import service as ws_http_service
from src.modules.workspaces.http.schema import WorkspaceAccessType


@pytest.mark.asyncio
async def test_get_workspace_context_returns_guest_context(monkeypatch: pytest.MonkeyPatch) -> None:
    user_uuid = uuid4()
    workspace_uuid = uuid4()
    organization_uuid = uuid4()
    membership_uuid = uuid4()

    workspace_obj = SimpleNamespace(id=workspace_uuid, created_by_user_id=uuid4())

    async def require_active_workspace(*, workspace_id: UUID):
        assert workspace_id == workspace_uuid
        return workspace_obj

    def resolve_workspace_org_id(*, workspace):
        assert workspace is workspace_obj
        return organization_uuid

    async def find_active_org_membership(*, organization_id: UUID, user_id: UUID):
        assert organization_id == organization_uuid
        assert user_id == user_uuid
        return None

    async def find_active_workspace_membership(*, workspace_id: UUID, user_id: UUID):
        assert workspace_id == workspace_uuid
        assert user_id == user_uuid
        return SimpleNamespace(id=membership_uuid)

    bind_calls: list[tuple[UUID, UUID, UUID | None]] = []

    def bind_workspace_request_context(
        *, workspace_id: UUID, organization_id: UUID, membership_id: UUID | None
    ) -> None:
        bind_calls.append((workspace_id, organization_id, membership_id))

    monkeypatch.setattr(ws_http_service, "_require_active_workspace", require_active_workspace)
    monkeypatch.setattr(ws_http_service, "_resolve_workspace_org_id", resolve_workspace_org_id)
    monkeypatch.setattr(ws_http_service, "_find_active_org_membership", find_active_org_membership)
    monkeypatch.setattr(ws_http_service, "_find_active_workspace_membership", find_active_workspace_membership)
    monkeypatch.setattr(ws_http_service, "_bind_workspace_request_context", bind_workspace_request_context)

    ctx = await ws_http_service.get_workspace_context(workspace_id=workspace_uuid, user_id=user_uuid)
    assert ctx.access_type == WorkspaceAccessType.GUEST
    assert ctx.organization_id == organization_uuid
    assert ctx.org_membership_id is None
    assert ctx.workspace_membership_id == membership_uuid
    assert ctx.is_org_owner is False
    assert ctx.visible_only is False

    assert bind_calls == [(workspace_uuid, organization_uuid, membership_uuid)]


@pytest.mark.asyncio
async def test_get_workspace_context_returns_member_context(monkeypatch: pytest.MonkeyPatch) -> None:
    user_uuid = uuid4()
    workspace_uuid = uuid4()
    organization_uuid = uuid4()
    membership_uuid = uuid4()
    org_membership_id = uuid4()

    workspace_obj = SimpleNamespace(id=workspace_uuid, created_by_user_id=uuid4())
    orgm = SimpleNamespace(id=org_membership_id, role=OrgRole.MEMBER)

    async def require_active_workspace(*, workspace_id: UUID):
        assert workspace_id == workspace_uuid
        return workspace_obj

    def resolve_workspace_org_id(*, workspace):
        assert workspace is workspace_obj
        return organization_uuid

    async def find_active_org_membership(*, organization_id: UUID, user_id: UUID):
        assert organization_id == organization_uuid
        assert user_id == user_uuid
        return orgm

    async def find_active_workspace_membership(*, workspace_id: UUID, user_id: UUID):
        assert workspace_id == workspace_uuid
        assert user_id == user_uuid
        return SimpleNamespace(id=membership_uuid)

    def bind_workspace_request_context(
        *, workspace_id: UUID, organization_id: UUID, membership_id: UUID | None
    ) -> None:
        assert workspace_id == workspace_uuid
        assert organization_id == organization_uuid
        assert membership_id == membership_uuid

    monkeypatch.setattr(ws_http_service, "_require_active_workspace", require_active_workspace)
    monkeypatch.setattr(ws_http_service, "_resolve_workspace_org_id", resolve_workspace_org_id)
    monkeypatch.setattr(ws_http_service, "_find_active_org_membership", find_active_org_membership)
    monkeypatch.setattr(ws_http_service, "_find_active_workspace_membership", find_active_workspace_membership)
    monkeypatch.setattr(ws_http_service, "_bind_workspace_request_context", bind_workspace_request_context)

    ctx = await ws_http_service.get_workspace_context(workspace_id=workspace_uuid, user_id=user_uuid)
    assert ctx.access_type == WorkspaceAccessType.MEMBER
    assert ctx.organization_id == organization_uuid
    assert ctx.org_membership_id == org_membership_id
    assert ctx.workspace_membership_id == membership_uuid
    assert ctx.is_org_owner is False


@pytest.mark.asyncio
async def test_get_workspace_context_denies_when_no_orgm_and_no_workspace_membership(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    workspace_id = uuid4()
    organization_id = uuid4()

    workspace = SimpleNamespace(id=workspace_id, created_by_user_id=uuid4())

    async def require_active_workspace(*, workspace_id: UUID):
        return workspace

    def resolve_workspace_org_id(*, workspace):
        return organization_id

    async def find_active_org_membership(*, organization_id: UUID, user_id: UUID):
        return None

    async def find_active_workspace_membership(*, workspace_id: UUID, user_id: UUID):
        return None

    def bind_workspace_request_context(
        *, workspace_id: UUID, organization_id: UUID, membership_id: UUID | None
    ) -> None:
        raise AssertionError("bind should not be called when access is denied")

    monkeypatch.setattr(ws_http_service, "_require_active_workspace", require_active_workspace)
    monkeypatch.setattr(ws_http_service, "_resolve_workspace_org_id", resolve_workspace_org_id)
    monkeypatch.setattr(ws_http_service, "_find_active_org_membership", find_active_org_membership)
    monkeypatch.setattr(ws_http_service, "_find_active_workspace_membership", find_active_workspace_membership)
    monkeypatch.setattr(ws_http_service, "_bind_workspace_request_context", bind_workspace_request_context)

    with pytest.raises(Forbidden) as ei:
        await ws_http_service.get_workspace_context(workspace_id=workspace_id, user_id=user_id)
    assert ei.value.error == "WORKSPACE_ACCESS_DENIED"


@pytest.mark.asyncio
async def test_get_workspace_context_raises_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    user_id = uuid4()
    workspace_id = uuid4()

    async def require_active_workspace(*, workspace_id: UUID):
        raise NotFound(message="missing", error="NOT_FOUND")

    monkeypatch.setattr(ws_http_service, "_require_active_workspace", require_active_workspace)

    with pytest.raises(NotFound) as ei:
        await ws_http_service.get_workspace_context(workspace_id=workspace_id, user_id=user_id)
    assert ei.value.error == "NOT_FOUND"


def test_build_guest_workspace_list_uses_workspace_org_id() -> None:
    workspace_id = uuid4()
    organization_id = uuid4()

    ws = SimpleNamespace(
        id=workspace_id,
        workspace_id=workspace_id,
        organization_id=organization_id,
        slug="ws",
        name="Workspace",
        icon_url=None,
        created_by_user_id=uuid4(),
    )

    out = ws_service._build_guest_workspace_list(workspaces=[ws])  # type: ignore[arg-type]
    assert len(out) == 1
    assert UUID(str(out[0].organization_id)) == organization_id
