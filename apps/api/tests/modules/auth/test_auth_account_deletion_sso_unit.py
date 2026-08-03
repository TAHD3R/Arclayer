from __future__ import annotations

from datetime import UTC, datetime
from typing import cast
from uuid import UUID, uuid4

import pytest
from pydantic import BaseModel, ConfigDict

from src.config import get_settings
from src.core.exceptions import BadRequest, Unauthorized
from src.models.organization.user import User, UserStatus
from src.modules.auth.account_deletion.capability_service import AccountDeletionCapabilityService
from src.modules.auth.contracts.schema import UserRepositoryLike
from src.modules.auth.repository import UserRepository
from src.modules.auth.service import AuthService


class _StopAfterReauth(RuntimeError):
    pass


class FakeUser(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    username: str = "demo"
    email: str | None
    email_verified_at: datetime | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    status: UserStatus = UserStatus.ACTIVE
    token_version: int = 0
    credential: object | None = None
    last_login_at: datetime | None = None


class FakeUserRepo:
    def __init__(self, user: FakeUser) -> None:
        self._user = user

    async def get_by_id_with_credential(self, user_id: UUID) -> FakeUser | None:
        return self._user if user_id == self._user.id else None

    async def get_by_identifier(self, identifier: str) -> FakeUser | None:
        return self._user if identifier == self._user.username else None

    async def get_by_id(self, user_id: UUID) -> FakeUser | None:
        return self._user if user_id == self._user.id else None

    async def update_last_login(self, user) -> None:
        user.last_login_at = datetime.now(tz=UTC)

    async def increment_token_version(self, user) -> FakeUser:
        user.token_version += 1
        return user

    def is_active(self, user) -> bool:
        return user.status == UserStatus.ACTIVE

    async def set_password(self, user, password_hash: str) -> None:
        raise RuntimeError("not used")

    async def remove_password(self, user) -> None:
        raise RuntimeError("not used")

    async def exists_username(self, username: str) -> bool:
        return username == self._user.username

    async def exists_email(self, email: str) -> bool:
        return bool(self._user.email and self._user.email.strip().lower() == email.strip().lower())

    async def set_email(self, user, email: str | None) -> FakeUser:
        user.email = email
        return user

    async def patch_profile(self, user, *, display_name: str | None | object = ...) -> FakeUser:
        if display_name is not ...:
            user.display_name = display_name  # type: ignore[assignment]
        return user

    async def create_user(
        self,
        *,
        username: str,
        email: str | None,
        display_name: str | None,
        password_hash: str,
    ) -> FakeUser:
        raise RuntimeError("not used")


class FakeTwoFactor:
    def __init__(self, *, enabled: bool) -> None:
        self._enabled = enabled

    async def is_enabled(self, *, user_id: UUID) -> bool:
        return self._enabled

    async def verify_for_login(self, *, user_id: UUID, code: str | None, backup_code: str | None) -> None:
        if code == "123456" or backup_code == "ABCD-EFGH-IJKL":
            return
        raise BadRequest(message="验证码错误", error="TWO_FACTOR_CODE_INVALID")


class FakeActionVerification:
    def __init__(self, *, enabled: bool) -> None:
        self.enabled = enabled

    async def enabled_methods(self, *, user_id: UUID) -> list[str]:
        _ = user_id
        return ["totp", "backup_code"] if self.enabled else []

    async def require(self, *, proof: str | None, **kwargs: object) -> None:
        _ = kwargs
        if self.enabled and proof != "valid-action-proof":
            raise Unauthorized(error="MFA_VERIFICATION_REQUIRED")


def _build_service(monkeypatch, *, user: FakeUser, two_factor_enabled: bool) -> AuthService:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()

    async def _stop(*_args, **_kwargs) -> None:
        raise _StopAfterReauth("stop after reauth")

    monkeypatch.setattr(
        "src.modules.auth.account_deletion.guard.AccountDeletionGuard.ensure_deletable",
        _stop,
    )

    return AuthService(
        settings,
        valkey=None,
        user_repo=cast(UserRepositoryLike, FakeUserRepo(user)),
        two_factor=FakeTwoFactor(enabled=two_factor_enabled),
        action_verification=FakeActionVerification(enabled=two_factor_enabled),
    )


async def test_sso_only_account_deletion_accepts_action_bound_mfa_proof(monkeypatch) -> None:
    user = FakeUser(id=uuid4(), email="demo@example.com", last_login_at=datetime(2020, 1, 1, tzinfo=UTC))
    service = _build_service(monkeypatch, user=user, two_factor_enabled=True)

    with pytest.raises(_StopAfterReauth):
        await service.delete_my_account(
            user=user,
            email="demo@example.com",
            password=None,
            mfa_proof="valid-action-proof",
            session_id="session-id",
            token_version=0,
        )


async def test_sso_only_account_deletion_requires_action_proof_when_mfa_enabled(monkeypatch) -> None:
    user = FakeUser(id=uuid4(), email="demo@example.com", last_login_at=datetime(2020, 1, 1, tzinfo=UTC))
    service = _build_service(monkeypatch, user=user, two_factor_enabled=True)

    with pytest.raises(Unauthorized) as exc:
        await service.delete_my_account(
            user=user,
            email="demo@example.com",
            password=None,
            session_id="session-id",
            token_version=0,
        )

    assert exc.value.error == "MFA_VERIFICATION_REQUIRED"


async def test_sso_only_account_deletion_accepts_recent_login_when_2fa_disabled(monkeypatch) -> None:
    user = FakeUser(id=uuid4(), email="demo@example.com", last_login_at=datetime.now(tz=UTC))
    service = _build_service(monkeypatch, user=user, two_factor_enabled=False)

    with pytest.raises(_StopAfterReauth):
        await service.delete_my_account(
            user=user,
            email="demo@example.com",
            password=None,
        )


async def test_sso_only_account_deletion_requires_relogin_when_2fa_disabled_and_stale(monkeypatch) -> None:
    user = FakeUser(id=uuid4(), email="demo@example.com", last_login_at=datetime(2020, 1, 1, tzinfo=UTC))
    service = _build_service(monkeypatch, user=user, two_factor_enabled=False)

    with pytest.raises(Unauthorized) as exc:
        await service.delete_my_account(
            user=user,
            email="demo@example.com",
            password=None,
        )

    assert exc.value.error == "REAUTH_REQUIRED"
    assert isinstance(exc.value.meta, dict)
    assert exc.value.meta.get("methods") == ["relogin"]


async def test_account_delete_capabilities_require_2fa_for_sso_only(monkeypatch) -> None:
    user = FakeUser(id=uuid4(), email="demo@example.com", last_login_at=datetime.now(tz=UTC))

    async def _allow_delete(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr(
        "src.modules.auth.account_deletion.guard.AccountDeletionGuard.ensure_deletable",
        _allow_delete,
    )
    service = AccountDeletionCapabilityService(get_settings())
    service.user_repo = cast(UserRepository, FakeUserRepo(user))
    monkeypatch.setattr(service, "_has_linked_oauth_identities", _true)

    out = await service.get_capabilities(user=cast(User, user), two_factor_enabled=True)

    assert out.can_delete is True
    assert out.required_reauth_methods == ["2fa"]
    assert out.has_password is False


async def test_account_delete_capabilities_report_last_owner_block(monkeypatch) -> None:
    user = FakeUser(id=uuid4(), email="demo@example.com", last_login_at=datetime.now(tz=UTC))

    async def _raise_block(*_args, **_kwargs) -> None:
        from src.core.exceptions import Forbidden

        raise Forbidden(message="权限不足", error="ACCOUNT_DELETE_LAST_ORG_OWNER")

    monkeypatch.setattr(
        "src.modules.auth.account_deletion.guard.AccountDeletionGuard.ensure_deletable",
        _raise_block,
    )
    service = AccountDeletionCapabilityService(get_settings())
    service.user_repo = cast(UserRepository, FakeUserRepo(user))

    async def _false(**_kwargs) -> bool:
        return False

    monkeypatch.setattr(service, "_has_linked_oauth_identities", _false)
    out = await service.get_capabilities(user=cast(User, user), two_factor_enabled=False)

    assert out.can_delete is False
    assert out.blocked_reason == "ACCOUNT_DELETE_LAST_ORG_OWNER"
    assert out.required_reauth_methods == ["relogin"]


async def _true(**_kwargs) -> bool:
    return True
