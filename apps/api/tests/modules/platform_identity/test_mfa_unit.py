from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest


@pytest.mark.asyncio
async def test_begin_totp_setup_creates_an_encrypted_pending_platform_method(monkeypatch: pytest.MonkeyPatch) -> None:
    from src.modules.platform_identity.mfa import PlatformMfaService
    from src.modules.platform_identity.mfa_schema import PlatformMfaSetupState

    repo = _FakePlatformMfaRepository()
    service = PlatformMfaService(repo=repo)
    _patch_transaction(monkeypatch, service)
    monkeypatch.setattr(service, "_ensure_master_key", lambda: b"0123456789abcdef0123456789abcdef")
    monkeypatch.setattr("src.modules.platform_identity.mfa.generate_totp_secret", lambda: "PLATFORMTOTPSECRET")

    result = await service.begin_totp_setup(
        user_id=uuid4(),
        issuer="Arclayer Platform",
        account_label="operator@example.com",
    )

    assert result.state == PlatformMfaSetupState.PENDING_VERIFICATION
    assert result.secret == "PLATFORMTOTPSECRET"
    assert result.issuer == "Arclayer Platform"
    assert result.account_label == "operator@example.com"
    assert "otpauth" not in result.model_dump_json()
    assert repo.pending[0].totp_secret_enc != result.secret


@pytest.mark.asyncio
async def test_totp_verification_is_baseline_only_and_rejects_counter_replay(monkeypatch: pytest.MonkeyPatch) -> None:
    from src.core.exceptions import Conflict
    from src.modules.auth.two_factor.totp import TotpVerifyResult
    from src.modules.platform_identity.mfa import PlatformMfaService
    from src.modules.platform_identity.mfa_schema import PlatformMfaAssurance

    repo = _FakePlatformMfaRepository()
    user_id = uuid4()
    method = _PendingMethod(id=uuid4(), user_id=user_id, totp_secret_enc="encrypted")
    repo.verified[method.id] = method
    service = PlatformMfaService(repo=repo)
    _patch_transaction(monkeypatch, service)
    monkeypatch.setattr(service, "_ensure_master_key", lambda: b"0123456789abcdef0123456789abcdef")
    monkeypatch.setattr(service, "_decrypt_totp_secret", lambda **_kwargs: "SECRET")
    monkeypatch.setattr(
        "src.modules.platform_identity.mfa.verify_totp_code",
        lambda *_args, **_kwargs: TotpVerifyResult(ok=True, used_counter=42),
    )

    verified = await service.verify_totp_for_baseline(user_id=user_id, method_id=method.id, code="123456")

    assert verified.assurance == PlatformMfaAssurance.BASELINE
    with pytest.raises(Conflict) as exc:
        await service.verify_totp_for_baseline(user_id=user_id, method_id=method.id, code="123456")
    assert exc.value.error == "PLATFORM_TOTP_CODE_REPLAY"


@pytest.mark.asyncio
async def test_regenerating_recovery_codes_invalidates_the_previous_set(monkeypatch: pytest.MonkeyPatch) -> None:
    from src.modules.auth.two_factor.totp import TotpVerifyResult

    repo, service, user_id, operator_id, method_id = _verified_operator_service(monkeypatch)
    old_code = _RecoveryCode(id=uuid4(), salt="old", code_hash="old")
    repo.recovery_codes[operator_id] = [old_code]
    monkeypatch.setattr(
        "src.modules.platform_identity.mfa.verify_totp_code",
        lambda *_args, **_kwargs: TotpVerifyResult(ok=True, used_counter=7),
    )

    regenerated = await service.regenerate_recovery_codes(
        user_id=user_id,
        operator_id=operator_id,
        method_id=method_id,
        code="123456",
    )

    assert old_code.invalidated_at is not None
    assert len(regenerated.codes) == 10
    assert all(code not in {item.code_hash for item in repo.recovery_codes[operator_id]} for code in regenerated.codes)


@pytest.mark.asyncio
async def test_recovery_code_consumption_blocks_platform_access_until_new_enrollment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.modules.platform_identity.mfa_schema import PlatformMfaSetupState

    repo, service, user_id, operator_id, _method_id = _verified_operator_service(monkeypatch)
    codes = ["ABCD-EFGH-JK"]
    items = service._hash_recovery_codes(codes=codes, master_key=service._ensure_master_key())
    repo.recovery_codes[operator_id] = [_RecoveryCode(id=uuid4(), **item) for item in items]

    result = await service.begin_recovery(user_id=user_id, operator_id=operator_id, recovery_code=codes[0])

    assert result.state == PlatformMfaSetupState.RECOVERY_ENROLLMENT_REQUIRED
    assert repo.recovery_codes[operator_id][0].used_at is not None
    assert repo.mfa_methods_revoked_for == [user_id]
    assert repo.sessions_and_proofs_revoked_for == [user_id]
    assert repo.operator_mfa_setup_required_for == [operator_id]


@dataclass
class _PendingMethod:
    id: UUID
    user_id: UUID
    totp_secret_enc: str


@dataclass
class _RecoveryCode:
    id: UUID
    salt: str
    code_hash: str
    used_at: object | None = None
    invalidated_at: object | None = None


class _FakePlatformMfaRepository:
    def __init__(self) -> None:
        self.pending: list[_PendingMethod] = []
        self.verified: dict[UUID, _PendingMethod] = {}
        self.used_counters: set[tuple[UUID, int]] = set()
        self.operators: dict[UUID, SimpleNamespace] = {}
        self.recovery_codes: dict[UUID, list[_RecoveryCode]] = {}
        self.mfa_methods_revoked_for: list[UUID] = []
        self.sessions_and_proofs_revoked_for: list[UUID] = []
        self.operator_mfa_setup_required_for: list[UUID] = []

    async def create_pending_totp_method(
        self, *, user_id: UUID, totp_secret_enc: str, conn: object | None = None
    ) -> _PendingMethod:
        method = _PendingMethod(id=uuid4(), user_id=user_id, totp_secret_enc=totp_secret_enc)
        self.pending.append(method)
        return method

    async def get_verified_totp_method(self, *, user_id: UUID, method_id: UUID, conn: object | None = None):
        method = self.verified.get(method_id)
        return method if method and method.user_id == user_id else None

    async def try_advance_totp_counter(self, *, method_id: UUID, counter: int, used_at, conn: object) -> bool:
        key = (method_id, counter)
        if key in self.used_counters:
            return False
        self.used_counters.add(key)
        return True

    async def get_operator(self, *, operator_id: UUID, conn: object | None = None):
        return self.operators.get(operator_id)

    async def is_instance_owner(self, *, user_id: UUID, conn: object | None = None) -> bool:
        return False

    async def invalidate_unused_recovery_codes(self, *, operator_id: UUID, invalidated_at, conn: object) -> None:
        for item in self.recovery_codes.get(operator_id, []):
            if item.used_at is None and item.invalidated_at is None:
                item.invalidated_at = invalidated_at

    async def create_recovery_codes(self, *, operator_id: UUID, items: list[dict[str, str]], conn: object) -> None:
        self.recovery_codes.setdefault(operator_id, []).extend(_RecoveryCode(id=uuid4(), **item) for item in items)

    async def list_available_recovery_codes(self, *, operator_id: UUID, conn: object):
        return [
            item
            for item in self.recovery_codes.get(operator_id, [])
            if item.used_at is None and item.invalidated_at is None
        ]

    async def try_consume_recovery_code(self, *, code_id: UUID, used_at, conn: object) -> bool:
        for items in self.recovery_codes.values():
            for item in items:
                if item.id == code_id and item.used_at is None and item.invalidated_at is None:
                    item.used_at = used_at
                    return True
        return False

    async def set_operator_mfa_setup_required(self, *, operator_id: UUID, changed_at, conn: object) -> None:
        self.operator_mfa_setup_required_for.append(operator_id)

    async def set_operator_active(self, *, operator_id: UUID, changed_at, conn: object) -> None:
        return None

    async def revoke_user_mfa_methods(self, *, user_id: UUID, revoked_at, conn: object) -> None:
        self.mfa_methods_revoked_for.append(user_id)

    async def revoke_user_sessions_and_proofs(self, *, user_id: UUID, revoked_at, conn: object) -> None:
        self.sessions_and_proofs_revoked_for.append(user_id)


def _patch_transaction(monkeypatch: pytest.MonkeyPatch, service: object) -> None:
    @asynccontextmanager
    async def _transaction():
        yield object()

    monkeypatch.setattr(service, "tx", _transaction)


def _verified_operator_service(monkeypatch: pytest.MonkeyPatch):
    from src.modules.platform_identity.mfa import PlatformMfaService

    repo = _FakePlatformMfaRepository()
    user_id = uuid4()
    operator_id = uuid4()
    method_id = uuid4()
    repo.verified[method_id] = _PendingMethod(id=method_id, user_id=user_id, totp_secret_enc="encrypted")
    repo.operators[operator_id] = SimpleNamespace(id=operator_id, user_id=user_id, status="active")
    service = PlatformMfaService(repo=repo)
    _patch_transaction(monkeypatch, service)
    monkeypatch.setattr(service, "_ensure_master_key", lambda: b"0123456789abcdef0123456789abcdef")
    monkeypatch.setattr(service, "_decrypt_totp_secret", lambda **_kwargs: "SECRET")
    return repo, service, user_id, operator_id, method_id
