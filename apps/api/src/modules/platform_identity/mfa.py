from __future__ import annotations

import binascii
import hmac
import os
import re
from collections.abc import Sequence
from datetime import UTC, datetime
from hashlib import sha256
from typing import Final, Protocol, cast
from uuid import UUID

from cryptography.exceptions import InvalidTag
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q

from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound, ServiceUnavailable
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.core.services import BaseService
from src.models.platform_identity.identity import PlatformOperator, PlatformOperatorStatus
from src.models.platform_identity.mfa import (
    PlatformMfaMethod,
    PlatformMfaMethodKind,
    PlatformMfaMethodStatus,
    PlatformMfaRecoveryCode,
)
from src.models.platform_identity.operations import PlatformSession, PlatformStepUpProof, PlatformStepUpProofStatus
from src.modules.auth.two_factor.totp import generate_totp_secret, verify_totp_code
from src.modules.platform_identity.mfa_schema import (
    PlatformMfaAssurance,
    PlatformMfaRecoveryState,
    PlatformMfaSetupState,
    PlatformMfaVerification,
    PlatformRecoveryCodeSet,
    PlatformTotpSetup,
)
from src.settings.crypto import decrypt_secret, encrypt_secret, ensure_master_key, master_key_exists

_RECOVERY_CODE_COUNT: Final[int] = 10
_RECOVERY_CODE_BYTES: Final[int] = 10
_RECOVERY_CODE_ALPHABET: Final[str] = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_RECOVERY_CODE_NORMALIZE_RE: Final[re.Pattern[str]] = re.compile(r"[^A-Za-z0-9]+")


def _aad(user_id: UUID) -> str:
    return f"platform:mfa:totp:user:{user_id}"


def _normalize_recovery_code(code: str) -> str:
    return _RECOVERY_CODE_NORMALIZE_RE.sub("", (code or "").strip().upper())


def _build_recovery_code() -> str:
    raw = "".join(
        _RECOVERY_CODE_ALPHABET[value % len(_RECOVERY_CODE_ALPHABET)] for value in os.urandom(_RECOVERY_CODE_BYTES)
    )
    return f"{raw[:4]}-{raw[4:8]}-{raw[8:]}"


def _recovery_pepper(master_key: bytes) -> bytes:
    return hmac.new(master_key, b"platform:mfa:recovery-code:v1", sha256).digest()


def _hash_recovery_code(*, code: str, salt: str, pepper: bytes) -> str:
    normalized = _normalize_recovery_code(code)
    if not normalized:
        raise ValueError("recovery code empty")
    return hmac.new(pepper, f"{salt}:{normalized}".encode(), sha256).hexdigest()


class _MethodLike(Protocol):
    @property
    def id(self) -> object: ...

    @property
    def user_id(self) -> object: ...

    @property
    def totp_secret_enc(self) -> object: ...


class _OperatorLike(Protocol):
    @property
    def id(self) -> object: ...

    @property
    def user_id(self) -> object: ...

    @property
    def status(self) -> object: ...


class _RecoveryCodeLike(Protocol):
    @property
    def id(self) -> object: ...

    @property
    def salt(self) -> object: ...

    @property
    def code_hash(self) -> object: ...


class PlatformMfaRepositoryLike(Protocol):
    async def create_pending_totp_method(
        self, *, user_id: UUID, totp_secret_enc: str, conn: BaseDBAsyncClient | None = None
    ) -> _MethodLike: ...

    async def get_pending_totp_method(
        self, *, user_id: UUID, method_id: UUID, conn: BaseDBAsyncClient | None = None
    ) -> _MethodLike | None: ...

    async def get_verified_totp_method(
        self, *, user_id: UUID, method_id: UUID, conn: BaseDBAsyncClient | None = None
    ) -> _MethodLike | None: ...

    async def verify_pending_totp_method(
        self, *, method_id: UUID, counter: int, verified_at: datetime, conn: BaseDBAsyncClient
    ) -> bool: ...

    async def try_advance_totp_counter(
        self, *, method_id: UUID, counter: int, used_at: datetime, conn: BaseDBAsyncClient
    ) -> bool: ...

    async def get_operator(
        self, *, operator_id: UUID, conn: BaseDBAsyncClient | None = None
    ) -> _OperatorLike | None: ...

    async def is_instance_owner(self, *, user_id: UUID, conn: BaseDBAsyncClient | None = None) -> bool: ...

    async def create_recovery_codes(
        self, *, operator_id: UUID, items: list[dict[str, str]], conn: BaseDBAsyncClient
    ) -> None: ...

    async def invalidate_unused_recovery_codes(
        self, *, operator_id: UUID, invalidated_at: datetime, conn: BaseDBAsyncClient
    ) -> None: ...

    async def list_available_recovery_codes(
        self, *, operator_id: UUID, conn: BaseDBAsyncClient
    ) -> Sequence[_RecoveryCodeLike]: ...

    async def try_consume_recovery_code(self, *, code_id: UUID, used_at: datetime, conn: BaseDBAsyncClient) -> bool: ...

    async def set_operator_mfa_setup_required(
        self, *, operator_id: UUID, changed_at: datetime, conn: BaseDBAsyncClient
    ) -> None: ...

    async def set_operator_active(
        self, *, operator_id: UUID, changed_at: datetime, conn: BaseDBAsyncClient
    ) -> None: ...

    async def revoke_user_mfa_methods(
        self, *, user_id: UUID, revoked_at: datetime, conn: BaseDBAsyncClient
    ) -> None: ...

    async def revoke_user_sessions_and_proofs(
        self, *, user_id: UUID, revoked_at: datetime, conn: BaseDBAsyncClient
    ) -> None: ...


class PlatformMfaRepository(TortoiseORMRepository, PlatformMfaRepositoryLike):
    """Tortoise persistence scoped exclusively to Platform MFA models."""

    async def create_pending_totp_method(self, *, user_id: UUID, totp_secret_enc: str, conn=None) -> PlatformMfaMethod:
        return await PlatformMfaMethod.create(
            user_id=user_id,
            kind=PlatformMfaMethodKind.TOTP,
            status=PlatformMfaMethodStatus.PENDING,
            totp_secret_enc=totp_secret_enc,
            using_db=conn,
        )

    async def get_pending_totp_method(self, *, user_id: UUID, method_id: UUID, conn=None) -> PlatformMfaMethod | None:
        query = PlatformMfaMethod.filter(
            id=method_id,
            user_id=user_id,
            kind=PlatformMfaMethodKind.TOTP,
            status=PlatformMfaMethodStatus.PENDING,
            revoked_at=None,
        )
        return await (query.using_db(conn) if conn is not None else query).first()

    async def get_verified_totp_method(self, *, user_id: UUID, method_id: UUID, conn=None) -> PlatformMfaMethod | None:
        query = PlatformMfaMethod.filter(
            id=method_id,
            user_id=user_id,
            kind=PlatformMfaMethodKind.TOTP,
            status=PlatformMfaMethodStatus.VERIFIED,
            revoked_at=None,
        )
        return await (query.using_db(conn) if conn is not None else query).first()

    async def verify_pending_totp_method(
        self, *, method_id: UUID, counter: int, verified_at: datetime, conn: BaseDBAsyncClient
    ) -> bool:
        return bool(
            await PlatformMfaMethod
            .filter(
                id=method_id, kind=PlatformMfaMethodKind.TOTP, status=PlatformMfaMethodStatus.PENDING, revoked_at=None
            )
            .using_db(conn)
            .update(
                status=PlatformMfaMethodStatus.VERIFIED,
                verified_at=verified_at,
                last_totp_counter=counter,
                last_used_at=verified_at,
            )
        )

    async def try_advance_totp_counter(
        self, *, method_id: UUID, counter: int, used_at: datetime, conn: BaseDBAsyncClient
    ) -> bool:
        return bool(
            await PlatformMfaMethod
            .filter(
                id=method_id, kind=PlatformMfaMethodKind.TOTP, status=PlatformMfaMethodStatus.VERIFIED, revoked_at=None
            )
            .filter(Q(last_totp_counter__isnull=True) | Q(last_totp_counter__lt=counter))
            .using_db(conn)
            .update(last_totp_counter=counter, last_used_at=used_at)
        )

    async def get_operator(self, *, operator_id: UUID, conn=None) -> PlatformOperator | None:
        query = PlatformOperator.filter(id=operator_id)
        return await (query.using_db(conn) if conn is not None else query).first()

    async def is_instance_owner(self, *, user_id: UUID, conn=None) -> bool:
        from src.models.platform_identity.identity import PlatformInstanceOwnership

        query = PlatformInstanceOwnership.filter(owner_user_id=user_id)
        return await (query.using_db(conn) if conn is not None else query).exists()

    async def create_recovery_codes(
        self, *, operator_id: UUID, items: list[dict[str, str]], conn: BaseDBAsyncClient
    ) -> None:
        await PlatformMfaRecoveryCode.bulk_create(
            [
                PlatformMfaRecoveryCode(operator_id=operator_id, salt=item["salt"], code_hash=item["code_hash"])
                for item in items
            ],
            using_db=conn,
        )

    async def invalidate_unused_recovery_codes(
        self, *, operator_id: UUID, invalidated_at: datetime, conn: BaseDBAsyncClient
    ) -> None:
        await (
            PlatformMfaRecoveryCode
            .filter(operator_id=operator_id, used_at=None, invalidated_at=None)
            .using_db(conn)
            .update(invalidated_at=invalidated_at)
        )

    async def list_available_recovery_codes(
        self, *, operator_id: UUID, conn: BaseDBAsyncClient
    ) -> list[PlatformMfaRecoveryCode]:
        return (
            await PlatformMfaRecoveryCode
            .filter(operator_id=operator_id, used_at=None, invalidated_at=None)
            .using_db(conn)
            .all()
        )

    async def try_consume_recovery_code(self, *, code_id: UUID, used_at: datetime, conn: BaseDBAsyncClient) -> bool:
        return bool(
            await PlatformMfaRecoveryCode
            .filter(id=code_id, used_at=None, invalidated_at=None)
            .using_db(conn)
            .update(used_at=used_at)
        )

    async def set_operator_mfa_setup_required(
        self, *, operator_id: UUID, changed_at: datetime, conn: BaseDBAsyncClient
    ) -> None:
        await (
            PlatformOperator
            .filter(id=operator_id)
            .using_db(conn)
            .update(status=PlatformOperatorStatus.MFA_SETUP_REQUIRED)
        )

    async def set_operator_active(self, *, operator_id: UUID, changed_at: datetime, conn: BaseDBAsyncClient) -> None:
        await (
            PlatformOperator
            .filter(id=operator_id, status=PlatformOperatorStatus.MFA_SETUP_REQUIRED)
            .using_db(conn)
            .update(status=PlatformOperatorStatus.ACTIVE)
        )

    async def revoke_user_mfa_methods(self, *, user_id: UUID, revoked_at: datetime, conn: BaseDBAsyncClient) -> None:
        await (
            PlatformMfaMethod
            .filter(user_id=user_id, revoked_at=None)
            .using_db(conn)
            .update(status=PlatformMfaMethodStatus.REVOKED, revoked_at=revoked_at)
        )

    async def revoke_user_sessions_and_proofs(
        self, *, user_id: UUID, revoked_at: datetime, conn: BaseDBAsyncClient
    ) -> None:
        await (
            PlatformSession.filter(actor_user_id=user_id, revoked_at=None).using_db(conn).update(revoked_at=revoked_at)
        )
        await (
            PlatformStepUpProof
            .filter(actor_user_id=user_id, status=PlatformStepUpProofStatus.ACTIVE)
            .using_db(conn)
            .update(status=PlatformStepUpProofStatus.INVALIDATED)
        )


class PlatformMfaService(BaseService):
    def __init__(self, settings: Settings | None = None, *, repo: PlatformMfaRepositoryLike | None = None) -> None:
        super().__init__(settings)
        self.repo = repo or PlatformMfaRepository()

    def _ensure_master_key(self) -> bytes:
        path = self.settings.security.master_key_path
        if not master_key_exists(path):
            raise ServiceUnavailable(error="PLATFORM_MFA_MASTER_KEY_MISSING")
        try:
            key, _fingerprint = ensure_master_key(path)
            return key
        except (OSError, ValueError) as exc:
            raise ServiceUnavailable(error="PLATFORM_MFA_MASTER_KEY_INVALID") from exc

    def _decrypt_totp_secret(self, *, user_id: UUID, ciphertext: str, master_key: bytes) -> str:
        try:
            return decrypt_secret(ciphertext, key=master_key, aad=_aad(user_id))
        except (InvalidTag, ValueError, UnicodeDecodeError, binascii.Error) as exc:
            raise ServiceUnavailable(error="PLATFORM_MFA_MASTER_KEY_INVALID") from exc

    async def begin_totp_setup(self, *, user_id: UUID, issuer: str, account_label: str) -> PlatformTotpSetup:
        normalized_issuer = issuer.strip()
        normalized_label = account_label.strip()
        if not normalized_issuer or not normalized_label:
            raise BadRequest(error="PLATFORM_TOTP_SETUP_INVALID")
        master_key = self._ensure_master_key()
        secret = generate_totp_secret()
        async with self.tx() as conn:
            method = await self.repo.create_pending_totp_method(
                user_id=user_id,
                totp_secret_enc=encrypt_secret(secret, key=master_key, aad=_aad(user_id)),
                conn=conn,
            )
        return PlatformTotpSetup(
            method_id=UUID(str(method.id)),
            state=PlatformMfaSetupState.PENDING_VERIFICATION,
            secret=secret,
            issuer=normalized_issuer,
            account_label=normalized_label,
        )

    async def confirm_totp_setup(
        self, *, user_id: UUID, method_id: UUID, code: str, operator_id: UUID | None = None
    ) -> PlatformRecoveryCodeSet | None:
        now = datetime.now(UTC)
        master_key = self._ensure_master_key()
        async with self.tx() as conn:
            method = await self.repo.get_pending_totp_method(user_id=user_id, method_id=method_id, conn=conn)
            if method is None:
                raise NotFound(error="PLATFORM_TOTP_SETUP_NOT_FOUND")
            result = self._verify_totp_code_or_raise(
                user_id=user_id, ciphertext=cast(str, method.totp_secret_enc), code=code, master_key=master_key, now=now
            )
            if result.used_counter is None or not await self.repo.verify_pending_totp_method(
                method_id=method_id, counter=result.used_counter, verified_at=now, conn=conn
            ):
                raise Conflict(error="PLATFORM_TOTP_CODE_REPLAY")
            if operator_id is None:
                return None
            await self._require_non_owner_operator(user_id=user_id, operator_id=operator_id, conn=conn)
            codes = self._new_recovery_codes()
            await self.repo.invalidate_unused_recovery_codes(operator_id=operator_id, invalidated_at=now, conn=conn)
            await self.repo.create_recovery_codes(
                operator_id=operator_id, items=self._hash_recovery_codes(codes=codes, master_key=master_key), conn=conn
            )
            await self.repo.set_operator_active(operator_id=operator_id, changed_at=now, conn=conn)
            return PlatformRecoveryCodeSet(state=PlatformMfaSetupState.VERIFIED, codes=tuple(codes))

    async def verify_totp_for_baseline(self, *, user_id: UUID, method_id: UUID, code: str) -> PlatformMfaVerification:
        now = datetime.now(UTC)
        master_key = self._ensure_master_key()
        async with self.tx() as conn:
            method = await self.repo.get_verified_totp_method(user_id=user_id, method_id=method_id, conn=conn)
            if method is None:
                raise NotFound(error="PLATFORM_TOTP_METHOD_NOT_FOUND")
            result = self._verify_totp_code_or_raise(
                user_id=user_id, ciphertext=cast(str, method.totp_secret_enc), code=code, master_key=master_key, now=now
            )
            if result.used_counter is None or not await self.repo.try_advance_totp_counter(
                method_id=method_id, counter=result.used_counter, used_at=now, conn=conn
            ):
                raise Conflict(error="PLATFORM_TOTP_CODE_REPLAY")
        return PlatformMfaVerification(method_id=method_id, assurance=PlatformMfaAssurance.BASELINE)

    async def regenerate_recovery_codes(
        self, *, user_id: UUID, operator_id: UUID, method_id: UUID, code: str
    ) -> PlatformRecoveryCodeSet:
        await self.verify_totp_for_baseline(user_id=user_id, method_id=method_id, code=code)
        now = datetime.now(UTC)
        master_key = self._ensure_master_key()
        async with self.tx() as conn:
            await self._require_non_owner_operator(user_id=user_id, operator_id=operator_id, conn=conn)
            codes = self._new_recovery_codes()
            await self.repo.invalidate_unused_recovery_codes(operator_id=operator_id, invalidated_at=now, conn=conn)
            await self.repo.create_recovery_codes(
                operator_id=operator_id, items=self._hash_recovery_codes(codes=codes, master_key=master_key), conn=conn
            )
        return PlatformRecoveryCodeSet(state=PlatformMfaSetupState.VERIFIED, codes=tuple(codes))

    async def begin_recovery(self, *, user_id: UUID, operator_id: UUID, recovery_code: str) -> PlatformMfaRecoveryState:
        now = datetime.now(UTC)
        master_key = self._ensure_master_key()
        async with self.tx() as conn:
            await self._require_non_owner_operator(user_id=user_id, operator_id=operator_id, conn=conn)
            if not await self._consume_recovery_code(
                operator_id=operator_id, code=recovery_code, master_key=master_key, now=now, conn=conn
            ):
                raise BadRequest(error="PLATFORM_RECOVERY_CODE_INVALID")
            await self.repo.invalidate_unused_recovery_codes(operator_id=operator_id, invalidated_at=now, conn=conn)
            await self.repo.revoke_user_mfa_methods(user_id=user_id, revoked_at=now, conn=conn)
            await self.repo.revoke_user_sessions_and_proofs(user_id=user_id, revoked_at=now, conn=conn)
            await self.repo.set_operator_mfa_setup_required(operator_id=operator_id, changed_at=now, conn=conn)
        return PlatformMfaRecoveryState(state=PlatformMfaSetupState.RECOVERY_ENROLLMENT_REQUIRED)

    async def _require_non_owner_operator(self, *, user_id: UUID, operator_id: UUID, conn: BaseDBAsyncClient) -> None:
        if await self.repo.is_instance_owner(user_id=user_id, conn=conn):
            raise BadRequest(error="PLATFORM_OWNER_MFA_RECOVERY_FORBIDDEN")
        operator = await self.repo.get_operator(operator_id=operator_id, conn=conn)
        if operator is None or UUID(str(operator.user_id)) != user_id:
            raise NotFound(error="PLATFORM_OPERATOR_NOT_FOUND")
        if str(operator.status) == PlatformOperatorStatus.DEACTIVATED.value:
            raise Conflict(error="PLATFORM_OPERATOR_NOT_ACTIVE")

    def _verify_totp_code_or_raise(
        self, *, user_id: UUID, ciphertext: str, code: str, master_key: bytes, now: datetime
    ):
        result = verify_totp_code(
            self._decrypt_totp_secret(user_id=user_id, ciphertext=ciphertext, master_key=master_key), code=code, now=now
        )
        if not result.ok or result.used_counter is None:
            raise BadRequest(error="PLATFORM_TOTP_CODE_INVALID")
        return result

    def _new_recovery_codes(self) -> list[str]:
        return [_build_recovery_code() for _ in range(_RECOVERY_CODE_COUNT)]

    def _hash_recovery_codes(self, *, codes: list[str], master_key: bytes) -> list[dict[str, str]]:
        pepper = _recovery_pepper(master_key)
        return [
            {"salt": salt, "code_hash": _hash_recovery_code(code=code, salt=salt, pepper=pepper)}
            for code in codes
            for salt in [os.urandom(16).hex()]
        ]

    async def _consume_recovery_code(
        self, *, operator_id: UUID, code: str, master_key: bytes, now: datetime, conn: BaseDBAsyncClient
    ) -> bool:
        normalized = _normalize_recovery_code(code)
        if not normalized:
            return False
        pepper = _recovery_pepper(master_key)
        for item in await self.repo.list_available_recovery_codes(operator_id=operator_id, conn=conn):
            expected = _hash_recovery_code(code=normalized, salt=cast(str, item.salt), pepper=pepper)
            if hmac.compare_digest(expected, cast(str, item.code_hash)):
                return await self.repo.try_consume_recovery_code(code_id=UUID(str(item.id)), used_at=now, conn=conn)
        return False
