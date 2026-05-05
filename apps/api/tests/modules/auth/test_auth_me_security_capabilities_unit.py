from __future__ import annotations

from datetime import UTC, datetime
from typing import cast
from uuid import UUID, uuid4

import pytest
from pydantic import BaseModel, ConfigDict

from src.config import get_settings
from src.core.exceptions import Conflict, Unauthorized
from src.models.organization.user import UserStatus
from src.modules.auth import schema as auth_schema
from src.modules.auth.contracts.schema import UserRepositoryLike
from src.modules.auth.router import router
from src.modules.auth.service import AuthService
from src.modules.auth.tokens.service import hash_password, verify_password


class _FakeCredential(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password_hash: str


class _FakeUser(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    username: str
    email: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    status: UserStatus = UserStatus.ACTIVE
    token_version: int = 0
    credential: _FakeCredential | None = None
    last_login_at: datetime | None = None


class _FakeUserRepo:
    def __init__(self, user: _FakeUser) -> None:
        self._user = user

    async def get_by_identifier(self, identifier: str) -> _FakeUser | None:
        return self._user if self._user.username == identifier else None

    async def get_by_id(self, user_id: UUID) -> _FakeUser | None:
        return self._user if self._user.id == user_id else None

    async def get_by_id_with_credential(self, user_id: UUID) -> _FakeUser | None:
        return await self.get_by_id(user_id)

    async def update_last_login(self, user) -> None:
        _ = user

    async def increment_token_version(self, user) -> _FakeUser:
        row = cast(_FakeUser, user)
        row.token_version += 1
        return row

    def is_active(self, user) -> bool:
        row = cast(_FakeUser, user)
        return row.status == UserStatus.ACTIVE

    async def set_password(self, user, password_hash: str) -> None:
        row = cast(_FakeUser, user)
        if row.credential is None:
            row.credential = _FakeCredential(password_hash=password_hash)
            return
        row.credential.password_hash = password_hash

    async def remove_password(self, user) -> None:
        row = cast(_FakeUser, user)
        row.credential = None

    async def exists_username(self, username: str) -> bool:
        return username == self._user.username

    async def exists_email(self, email: str) -> bool:
        return bool(self._user.email and self._user.email.strip().lower() == email.strip().lower())

    async def set_email(self, user, email: str | None) -> _FakeUser:
        row = cast(_FakeUser, user)
        row.email = email
        return row

    async def patch_profile(self, user, *, display_name: str | None | object = ...) -> _FakeUser:
        row = cast(_FakeUser, user)
        if display_name is not ...:
            row.display_name = cast(str | None, display_name)
        return row

    async def create_user(
        self,
        *,
        username: str,
        email: str | None,
        display_name: str | None,
        password_hash: str,
        is_super_admin: bool = False,
    ) -> _FakeUser:
        _ = username, email, display_name, password_hash, is_super_admin
        raise RuntimeError("not used")


class _FakeTwoFactor:
    def __init__(self, *, enabled: bool) -> None:
        self.enabled = enabled
        self.verify_calls: list[tuple[UUID, str | None, str | None]] = []

    async def is_enabled(self, *, user_id: UUID) -> bool:
        _ = user_id
        return self.enabled

    async def verify_for_login(self, *, user_id: UUID, code: str | None, backup_code: str | None) -> None:
        self.verify_calls.append((user_id, code, backup_code))
        if code == "123456" or backup_code == "ABCD-EFGH-IJKL":
            return
        raise Unauthorized(message="invalid", error="TWO_FACTOR_CODE_INVALID")


def _build_service(monkeypatch, *, has_password: bool, two_factor_enabled: bool) -> tuple[AuthService, _FakeUser]:
    settings = get_settings()
    user = _FakeUser(
        id=uuid4(),
        username="oauth_only",
        email="oauth@example.com",
        credential=_FakeCredential(password_hash=hash_password("oldpass1", settings.auth)) if has_password else None,
        last_login_at=datetime.now(tz=UTC),
    )
    repo = _FakeUserRepo(user)
    service = AuthService(
        settings,
        valkey=None,
        user_repo=cast(UserRepositoryLike, repo),
        two_factor=_FakeTwoFactor(enabled=two_factor_enabled),
    )

    async def _fake_write_auth_activity_event(**kwargs: object) -> None:
        _ = kwargs

    monkeypatch.setattr(service, "_write_auth_activity_event", _fake_write_auth_activity_event)
    return service, user


def test_security_capabilities_route_is_registered() -> None:
    paths = {getattr(route, "path", None) for route in router.routes}
    assert "/me/security-capabilities" in paths
    assert "/me/set-password" in paths


def test_security_capabilities_schema_fields_are_frozen() -> None:
    schema_type = getattr(auth_schema, "MySecurityCapabilityOut", None)
    assert schema_type is not None
    assert set(schema_type.model_fields) >= {
        "has_password",
        "two_factor_enabled",
        "has_linked_oauth_identities",
        "set_password_required_reauth_methods",
        "email_change_required_reauth_methods",
    }


@pytest.mark.asyncio
async def test_set_password_for_oauth_only_user_with_recent_login_success(monkeypatch) -> None:
    service, user = _build_service(monkeypatch, has_password=False, two_factor_enabled=False)
    await service.set_password_for_current_user(user_id=user.id, new_password="newpass1", code=None, backup_code=None)
    assert user.credential is not None
    assert verify_password("newpass1", user.credential.password_hash, service.settings.auth) is True


@pytest.mark.asyncio
async def test_set_password_conflicts_when_password_already_exists(monkeypatch) -> None:
    service, user = _build_service(monkeypatch, has_password=True, two_factor_enabled=False)
    with pytest.raises(Conflict):
        await service.set_password_for_current_user(
            user_id=user.id,
            new_password="newpass1",
            code=None,
            backup_code=None,
        )
