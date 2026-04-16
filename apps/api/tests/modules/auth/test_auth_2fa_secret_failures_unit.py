from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from cryptography.exceptions import InvalidTag

from src.config import get_settings
from src.core.exceptions import ServiceUnavailable
from src.modules.auth.two_factor.service import AuthTwoFactorService


@dataclass
class _FakeTwoFactorRecord:
    id: UUID
    user_id: UUID
    totp_secret_enc: str
    enabled_at: datetime | None


@dataclass
class _FakeBackupCode:
    id: UUID
    salt: str
    code_hash: str


class _FakeTwoFactorRepo:
    def __init__(self, *, record: _FakeTwoFactorRecord) -> None:
        self._record = record

    async def get_record(self, user_id: UUID) -> _FakeTwoFactorRecord | None:
        return self._record if user_id == self._record.user_id else None

    async def upsert_pending_secret(self, *, user_id: UUID, totp_secret_enc: str):
        raise RuntimeError("not used")

    async def set_enabled_at(self, *, user_id: UUID, enabled_at: datetime) -> None:
        raise RuntimeError("not used")

    async def delete_record(self, *, user_id: UUID) -> None:
        raise RuntimeError("not used")

    async def delete_backup_codes(self, *, user_id: UUID) -> int:
        raise RuntimeError("not used")

    async def create_backup_codes(self, *, user_id: UUID, items: list[dict[str, str]]) -> None:
        raise RuntimeError("not used")

    async def list_unused_backup_codes(self, *, user_id: UUID) -> list[_FakeBackupCode]:
        return [_FakeBackupCode(id=uuid4(), salt="salt", code_hash="hash")]

    async def mark_backup_code_used(self, *, code_id: UUID, used_at: datetime) -> None:
        raise RuntimeError("not used")

    async def count_unused_backup_codes(self, *, user_id: UUID) -> int:
        raise RuntimeError("not used")

    async def try_advance_totp_counter(self, *, user_id: UUID, counter: int, used_at: datetime) -> bool:
        return True


class _NoopUserRepo:
    async def get_by_id_with_credential(self, user_id: UUID):
        return None


def _build_service(monkeypatch, *, user_id: UUID) -> AuthTwoFactorService:
    monkeypatch.setenv("AUTH__JWT_SECRET", "0123456789abcdef0123456789abcdef")
    settings = get_settings()
    record = _FakeTwoFactorRecord(
        id=uuid4(),
        user_id=user_id,
        totp_secret_enc="enc:v1:test",
        enabled_at=datetime.now(tz=UTC),
    )
    return AuthTwoFactorService(settings, repo=_FakeTwoFactorRepo(record=record), user_repo=_NoopUserRepo())


async def test_verify_for_login_returns_master_key_missing_when_file_absent(monkeypatch) -> None:
    user_id = uuid4()
    service = _build_service(monkeypatch, user_id=user_id)

    monkeypatch.setattr("src.modules.auth.two_factor.service.master_key_exists", lambda _path: False)

    with pytest.raises(ServiceUnavailable) as exc:
        await service.verify_for_login(user_id=user_id, code="123456", backup_code=None)

    assert exc.value.error == "MASTER_KEY_MISSING"


async def test_verify_for_login_returns_master_key_invalid_when_totp_secret_cannot_be_decrypted(monkeypatch) -> None:
    user_id = uuid4()
    service = _build_service(monkeypatch, user_id=user_id)

    monkeypatch.setattr("src.modules.auth.two_factor.service.master_key_exists", lambda _path: True)
    monkeypatch.setattr(
        "src.modules.auth.two_factor.service.ensure_master_key",
        lambda _path: (b"x" * 32, "fingerprint"),
    )
    monkeypatch.setattr(
        "src.modules.auth.two_factor.service.decrypt_secret",
        lambda _value, *, key, aad: (_ for _ in ()).throw(InvalidTag()),
    )

    with pytest.raises(ServiceUnavailable) as exc:
        await service.verify_for_login(user_id=user_id, code="123456", backup_code=None)

    assert exc.value.error == "MASTER_KEY_INVALID"


async def test_verify_for_login_returns_master_key_invalid_for_backup_code_when_key_mismatches(monkeypatch) -> None:
    user_id = uuid4()
    service = _build_service(monkeypatch, user_id=user_id)

    monkeypatch.setattr("src.modules.auth.two_factor.service.master_key_exists", lambda _path: True)
    monkeypatch.setattr(
        "src.modules.auth.two_factor.service.ensure_master_key",
        lambda _path: (b"x" * 32, "fingerprint"),
    )
    monkeypatch.setattr(
        "src.modules.auth.two_factor.service.decrypt_secret",
        lambda _value, *, key, aad: (_ for _ in ()).throw(InvalidTag()),
    )

    with pytest.raises(ServiceUnavailable) as exc:
        await service.verify_for_login(user_id=user_id, code=None, backup_code="ABCD-EFGH-JK")

    assert exc.value.error == "MASTER_KEY_INVALID"
