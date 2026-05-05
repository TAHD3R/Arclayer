from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import Unauthorized
from src.modules.auth.tokens.service import hash_password
from src.modules.auth.two_factor.service import AuthTwoFactorService


@dataclass(frozen=True)
class _FakeCredential:
    password_hash: str


@dataclass
class _FakeUser:
    id: UUID
    last_login_at: datetime | None
    credential: _FakeCredential | None


class _FakeUserRepo:
    def __init__(self, user: _FakeUser) -> None:
        self._user = user

    async def get_by_id_with_credential(self, user_id: UUID) -> _FakeUser | None:
        if user_id == self._user.id:
            return self._user
        return None


@dataclass
class _FakeTwoFactorRecord:
    user_id: UUID
    totp_secret_enc: str
    enabled_at: datetime | None


class _FakeTwoFactorRepo:
    def __init__(self) -> None:
        self._record: _FakeTwoFactorRecord | None = None
        self._deleted_backup_codes_for: list[UUID] = []

    async def get_record(self, user_id: UUID, *, conn=None) -> _FakeTwoFactorRecord | None:  # type: ignore[no-untyped-def]
        _ = conn
        return self._record if self._record is not None and self._record.user_id == user_id else None

    async def upsert_pending_secret(  # type: ignore[no-untyped-def]
        self, *, user_id: UUID, totp_secret_enc: str, conn=None
    ) -> _FakeTwoFactorRecord:
        _ = conn
        self._record = _FakeTwoFactorRecord(user_id=user_id, totp_secret_enc=totp_secret_enc, enabled_at=None)
        return self._record

    async def delete_backup_codes(self, *, user_id: UUID, conn=None) -> int:  # type: ignore[no-untyped-def]
        _ = conn
        self._deleted_backup_codes_for.append(user_id)
        return 0

    async def set_enabled_at(self, *, user_id: UUID, enabled_at: datetime, conn=None) -> None:  # type: ignore[no-untyped-def]
        _ = conn
        raise RuntimeError("not used")

    async def delete_record(self, *, user_id: UUID, conn=None) -> None:  # type: ignore[no-untyped-def]
        _ = conn
        raise RuntimeError("not used")

    async def create_backup_codes(  # type: ignore[no-untyped-def]
        self, *, user_id: UUID, items: list[dict[str, str]], conn=None
    ) -> None:
        _ = conn
        raise RuntimeError("not used")

    async def list_unused_backup_codes(self, *, user_id: UUID, conn=None):  # type: ignore[no-untyped-def]
        _ = conn
        raise RuntimeError("not used")

    async def mark_backup_code_used(self, *, code_id: UUID, used_at: datetime, conn=None) -> None:  # type: ignore[no-untyped-def]
        _ = conn
        raise RuntimeError("not used")

    async def count_unused_backup_codes(self, *, user_id: UUID) -> int:
        raise RuntimeError("not used")

    async def try_advance_totp_counter(  # type: ignore[no-untyped-def]
        self, *, user_id: UUID, counter: int, used_at: datetime, conn=None
    ) -> bool:
        _ = conn
        return True


def _build_service(monkeypatch, *, user: _FakeUser) -> AuthTwoFactorService:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()

    monkeypatch.setattr(
        "src.modules.auth.two_factor.service.ensure_master_key",
        lambda _path: (b"x" * 32, "fingerprint"),
    )
    monkeypatch.setattr("src.modules.auth.two_factor.service.master_key_exists", lambda _path: True)

    return AuthTwoFactorService(
        settings,
        repo=_FakeTwoFactorRepo(),
        user_repo=_FakeUserRepo(user),
    )


def _user_with_password(monkeypatch, *, password: str) -> _FakeUser:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()
    return _FakeUser(
        id=uuid4(),
        last_login_at=datetime.now(tz=UTC),
        credential=_FakeCredential(hash_password(password, settings.auth)),
    )


async def test_2fa_setup_requires_password_when_password_exists(monkeypatch) -> None:
    user = _user_with_password(monkeypatch, password="pw")
    service = _build_service(monkeypatch, user=user)

    with pytest.raises(Unauthorized) as exc:
        await service.begin_setup(user_id=user.id, issuer="demo", account_label="demo", password=None)

    assert exc.value.error == "REAUTH_REQUIRED"
    assert isinstance(exc.value.meta, dict)
    assert exc.value.meta.get("methods") == ["password"]


async def test_2fa_setup_rejects_wrong_password(monkeypatch) -> None:
    user = _user_with_password(monkeypatch, password="pw")
    service = _build_service(monkeypatch, user=user)

    with pytest.raises(Unauthorized) as exc:
        await service.begin_setup(user_id=user.id, issuer="demo", account_label="demo", password="nope")

    assert exc.value.error == "INVALID_CREDENTIALS"


async def test_2fa_setup_succeeds_with_correct_password(monkeypatch) -> None:
    user = _user_with_password(monkeypatch, password="pw")
    service = _build_service(monkeypatch, user=user)

    secret, uri = await service.begin_setup(user_id=user.id, issuer="Demo", account_label="demo", password="pw")
    assert secret
    assert uri.startswith("otpauth://totp/")


async def test_2fa_setup_succeeds_for_sso_only_with_recent_login(monkeypatch) -> None:
    user = _FakeUser(id=uuid4(), last_login_at=datetime.now(tz=UTC), credential=None)
    service = _build_service(monkeypatch, user=user)

    secret, uri = await service.begin_setup(user_id=user.id, issuer="Demo", account_label="demo", password=None)
    assert secret
    assert uri.startswith("otpauth://totp/")


async def test_2fa_setup_requires_relogin_for_sso_only_with_stale_login(monkeypatch) -> None:
    user = _FakeUser(id=uuid4(), last_login_at=datetime(2020, 1, 1, tzinfo=UTC), credential=None)
    service = _build_service(monkeypatch, user=user)

    with pytest.raises(Unauthorized) as exc:
        await service.begin_setup(user_id=user.id, issuer="Demo", account_label="demo", password=None)

    assert exc.value.error == "REAUTH_REQUIRED"
    assert isinstance(exc.value.meta, dict)
    assert exc.value.meta.get("methods") == ["relogin"]
