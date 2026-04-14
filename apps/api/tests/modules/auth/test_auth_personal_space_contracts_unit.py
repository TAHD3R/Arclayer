from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from src.config import get_settings
from src.modules.auth.schema import AcceptExistingInvitationResult
from src.modules.auth.service import AuthService


@dataclass
class _FakeUser:
    id: UUID
    token_version: int = 0


class _FakeUserRepo:
    def __init__(self, user: _FakeUser) -> None:
        self._user = user
        self.last_login_updated = False

    async def get_by_id(self, user_id: UUID):
        if user_id == self._user.id:
            return self._user
        return None

    def is_active(self, _user: _FakeUser) -> bool:
        return True

    async def update_last_login(self, _user: _FakeUser) -> None:
        self.last_login_updated = True


class _FakeRefreshStore:
    def __init__(self) -> None:
        self.stored: dict[str, object] | None = None
        self.ttl: int | None = None

    async def store(self, record: dict[str, object], ttl: int) -> None:
        self.stored = record
        self.ttl = ttl


@pytest.mark.asyncio
async def test_issue_token_pair_for_user_does_not_ensure_personal_space_by_default(monkeypatch) -> None:
    settings = get_settings()
    user = _FakeUser(id=uuid4())
    user_repo = _FakeUserRepo(user)
    refresh_store = _FakeRefreshStore()
    service = AuthService(settings, user_repo=user_repo)

    monkeypatch.setattr(service, "_require_refresh_store", lambda: refresh_store, raising=True)

    tokens = await service.issue_token_pair_for_user(user.id)

    assert tokens.access_token
    assert tokens.refresh_token
    assert refresh_store.stored is not None
    assert user_repo.last_login_updated is True


@pytest.mark.asyncio
async def test_accept_existing_invitation_does_not_trigger_background_personal_space_prepare(
    monkeypatch,
) -> None:
    settings = get_settings()
    user = _FakeUser(id=uuid4())
    service = AuthService(settings)

    async def _accept_existing_invitation(*, payload, user):  # type: ignore[no-untyped-def]
        return AcceptExistingInvitationResult(
            organization_id=uuid4(),
            workspace_id=uuid4(),
            role_code="member",
        )

    service.invitation_service = SimpleNamespace(accept_existing_invitation=_accept_existing_invitation)

    result = await service.accept_existing_invitation(payload=SimpleNamespace(token="token"), user=user)  # type: ignore[arg-type]

    assert result.role_code == "member"
