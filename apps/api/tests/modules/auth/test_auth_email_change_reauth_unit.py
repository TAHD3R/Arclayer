from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from pydantic import BaseModel, ConfigDict

from src.config import get_settings
from src.core.exceptions import BadRequest
from src.models.organization.user import UserStatus
from src.modules.auth.service import AuthService
from src.modules.auth.tokens.service import hash_password


class _FakeCredential(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password_hash: str


class _FakeUser(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    username: str = "demo"
    email: str | None = "old@example.com"
    display_name: str | None = None
    avatar_url: str | None = None
    status: UserStatus = UserStatus.ACTIVE
    token_version: int = 0
    credential: _FakeCredential | None = None
    last_login_at: datetime | None = None


class _FakeEmailChangeStore:
    def __init__(self, *, new_email: str, verification_code: str) -> None:
        self.record: dict[str, Any] | None = {
            "new_email": new_email,
            "code": verification_code,
            "attempts": 0,
        }

    async def get(self, *, user_id: UUID) -> dict[str, Any] | None:
        _ = user_id
        return self.record

    async def bump_attempts(self, *, user_id: UUID) -> int:
        _ = user_id
        if self.record is None:
            return 0
        attempts = int(self.record.get("attempts") or 0) + 1
        self.record["attempts"] = attempts
        return attempts

    async def delete(self, *, user_id: UUID) -> None:
        _ = user_id
        self.record = None


class _FakeRefreshStore:
    def __init__(self) -> None:
        self.revoked_user_ids: list[UUID] = []

    async def revoke_all(self, user_id: UUID) -> None:
        self.revoked_user_ids.append(user_id)


class _FakeUserRepo:
    def __init__(self, user: _FakeUser) -> None:
        self._user = user

    async def get_by_identifier(self, identifier: str) -> _FakeUser | None:
        return self._user if identifier == self._user.username else None

    async def get_by_id(self, user_id: UUID) -> _FakeUser | None:
        return self._user if user_id == self._user.id else None

    async def get_by_id_with_credential(self, user_id: UUID) -> _FakeUser | None:
        return self._user if user_id == self._user.id else None

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
        _ = user, password_hash
        raise RuntimeError("not used")

    async def remove_password(self, user) -> None:
        _ = user
        raise RuntimeError("not used")

    async def exists_username(self, username: str) -> bool:
        return username == self._user.username

    async def exists_email(self, email: str) -> bool:
        normalized = email.strip().lower()
        return bool(self._user.email and self._user.email.strip().lower() == normalized)

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
    ) -> _FakeUser:
        _ = username, email, display_name, password_hash
        raise RuntimeError("not used")


class _FakeTwoFactor:
    def __init__(self, *, enabled: bool) -> None:
        self._enabled = enabled

    async def is_enabled(self, *, user_id: UUID) -> bool:
        _ = user_id
        return self._enabled

    async def verify_for_login(self, *, user_id: UUID, code: str | None, backup_code: str | None) -> None:
        _ = user_id
        if code == "123456" or backup_code == "ABCD-EFGH-IJKL":
            return
        raise BadRequest(message="invalid", error="TWO_FACTOR_CODE_INVALID")


def _build_service(*, user: _FakeUser, two_factor_enabled: bool) -> AuthService:
    settings = get_settings()
    refresh_store = _FakeRefreshStore()
    service = AuthService(
        settings,
        valkey=None,
        user_repo=_FakeUserRepo(user),
        two_factor=_FakeTwoFactor(enabled=two_factor_enabled),
    )
    service.email_change_store = cast(
        Any,
        _FakeEmailChangeStore(new_email="new@example.com", verification_code="654321"),
    )
    service.refresh_store = cast(Any, refresh_store)
    return service


def _get_fake_refresh_store(service: AuthService) -> _FakeRefreshStore:
    return cast(_FakeRefreshStore, service.refresh_store)


@pytest.mark.asyncio
async def test_confirm_email_change_password_account_uses_email_code_only() -> None:
    settings = get_settings()
    user = _FakeUser(
        id=uuid4(),
        credential=_FakeCredential(password_hash=hash_password("oldpass1", settings.auth)),
        last_login_at=datetime(2020, 1, 1, tzinfo=UTC),
    )
    service = _build_service(user=user, two_factor_enabled=True)

    profile = await service.confirm_email_change(
        user=cast(Any, user),
        new_email="new@example.com",
        code="654321",
    )

    assert profile.email == "new@example.com"
    assert user.token_version == 1
    assert _get_fake_refresh_store(service).revoked_user_ids == [user.id]


@pytest.mark.asyncio
async def test_confirm_email_change_sso_with_2fa_uses_email_code_only() -> None:
    user = _FakeUser(id=uuid4(), credential=None, last_login_at=datetime(2020, 1, 1, tzinfo=UTC))
    service = _build_service(user=user, two_factor_enabled=True)

    profile = await service.confirm_email_change(
        user=cast(Any, user),
        new_email="new@example.com",
        code="654321",
    )

    assert profile.email == "new@example.com"
    assert user.token_version == 1
    assert _get_fake_refresh_store(service).revoked_user_ids == [user.id]


@pytest.mark.asyncio
async def test_confirm_email_change_sso_without_2fa_accepts_recent_login() -> None:
    user = _FakeUser(id=uuid4(), credential=None, last_login_at=datetime.now(tz=UTC))
    service = _build_service(user=user, two_factor_enabled=False)

    profile = await service.confirm_email_change(
        user=cast(Any, user),
        new_email="new@example.com",
        code="654321",
    )

    assert profile.email == "new@example.com"
    assert user.token_version == 1
    assert _get_fake_refresh_store(service).revoked_user_ids == [user.id]
