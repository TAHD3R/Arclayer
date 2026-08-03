from __future__ import annotations

import secrets
from datetime import UTC, datetime
from hashlib import sha256
from typing import Any, Protocol, cast
from uuid import UUID

from src.config import Settings
from src.core.exceptions import ServiceUnavailable, Unauthorized
from src.core.services import BaseService
from src.modules.auth.repository import RefreshTokenStore
from src.modules.auth.security_verification.schema import SecurityAction
from src.modules.auth.webauthn.schema import (
    WebAuthnAuthenticationCredential,
    WebAuthnAuthenticationOptions,
)
from src.modules.auth.webauthn.service import AuthWebAuthnService
from src.platform.cache.valkey import ValkeyClientLike

_PROOF_TTL_SECONDS = 5 * 60


class TotpVerificationLike(Protocol):
    async def is_enabled(self, *, user_id: UUID) -> bool: ...

    async def verify_for_login(
        self,
        *,
        user_id: UUID,
        code: str | None,
        backup_code: str | None,
    ) -> None: ...


class AtomicProofStoreClient(Protocol):
    async def set_json(
        self,
        key: str,
        data: Any,
        *,
        ex: int | None = None,
        nx: bool | None = None,
        xx: bool | None = None,
    ) -> bool: ...

    async def getdel(self, key: str) -> str | None: ...


class SecurityVerificationProofStore:
    def __init__(self, client: AtomicProofStoreClient, *, ttl_seconds: int = _PROOF_TTL_SECONDS) -> None:
        self._client = client
        self.ttl_seconds = ttl_seconds

    @staticmethod
    def _key(token: str) -> str:
        return f"auth:mfa:proof:{sha256(token.encode()).hexdigest()}"

    async def issue(
        self,
        *,
        user_id: UUID,
        session_id: str,
        token_version: int,
        action: SecurityAction,
    ) -> tuple[str, int]:
        token = secrets.token_urlsafe(32)
        now = int(datetime.now(UTC).timestamp())
        await self._client.set_json(
            self._key(token),
            {
                "user_id": str(user_id),
                "session_id": session_id,
                "token_version": token_version,
                "action": action,
                "issued_at": now,
                "expires_at": now + self.ttl_seconds,
            },
            ex=self.ttl_seconds,
        )
        return token, self.ttl_seconds

    async def consume(self, *, token: str) -> dict[str, Any] | None:
        raw = await self._client.getdel(self._key(token))
        if raw is None:
            return None
        import json

        value = json.loads(raw)
        return value if isinstance(value, dict) else None


class AuthActionVerificationService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        valkey: ValkeyClientLike | None,
        two_factor: TotpVerificationLike,
        webauthn: AuthWebAuthnService | None = None,
    ) -> None:
        super().__init__(settings)
        self._two_factor = two_factor
        self._webauthn = webauthn or AuthWebAuthnService(settings)
        self._proof_store = (
            SecurityVerificationProofStore(cast(AtomicProofStoreClient, valkey)) if valkey is not None else None
        )
        self._refresh_store = RefreshTokenStore(valkey, settings.auth) if valkey is not None else None

    async def enabled_methods(self, *, user_id: UUID) -> list[str]:
        methods: list[str] = []
        if await self._two_factor.is_enabled(user_id=user_id):
            methods.extend(["totp", "backup_code"])
        if await self._webauthn.is_enabled(user_id=user_id):
            methods.append("webauthn")
        return methods

    async def verify_totp_and_issue(
        self,
        *,
        user_id: UUID,
        session_id: str,
        token_version: int,
        action: SecurityAction,
        code: str | None,
        backup_code: str | None,
    ) -> tuple[str, int]:
        await self._require_active_session(
            user_id=user_id,
            session_id=session_id,
            token_version=token_version,
        )
        await self._two_factor.verify_for_login(
            user_id=user_id,
            code=code,
            backup_code=backup_code,
        )
        return await self._require_proof_store().issue(
            user_id=user_id,
            session_id=session_id,
            token_version=token_version,
            action=action,
        )

    async def begin_webauthn(
        self,
        *,
        user_id: UUID,
        session_id: str,
        token_version: int,
        action: SecurityAction,
    ) -> WebAuthnAuthenticationOptions:
        await self._require_active_session(
            user_id=user_id,
            session_id=session_id,
            token_version=token_version,
        )
        return await self._webauthn.begin_authentication(
            user_id=user_id,
            binding=self._binding(session_id=session_id, action=action),
        )

    async def complete_webauthn_and_issue(
        self,
        *,
        user_id: UUID,
        session_id: str,
        token_version: int,
        action: SecurityAction,
        challenge_id: UUID,
        credential: WebAuthnAuthenticationCredential,
    ) -> tuple[str, int]:
        await self._require_active_session(
            user_id=user_id,
            session_id=session_id,
            token_version=token_version,
        )
        await self._webauthn.complete_authentication(
            user_id=user_id,
            challenge_id=challenge_id,
            binding=self._binding(session_id=session_id, action=action),
            credential=credential,
        )
        return await self._require_proof_store().issue(
            user_id=user_id,
            session_id=session_id,
            token_version=token_version,
            action=action,
        )

    async def require(
        self,
        *,
        user_id: UUID,
        session_id: str,
        token_version: int,
        action: SecurityAction,
        proof: str | None,
    ) -> None:
        if not await self.enabled_methods(user_id=user_id):
            return
        normalized = (proof or "").strip()
        if not normalized:
            raise Unauthorized(error="MFA_VERIFICATION_REQUIRED")
        await self._require_active_session(
            user_id=user_id,
            session_id=session_id,
            token_version=token_version,
        )
        record = await self._require_proof_store().consume(token=normalized)
        if record is None:
            raise Unauthorized(error="MFA_VERIFICATION_INVALID")
        expected = {
            "user_id": str(user_id),
            "session_id": session_id,
            "token_version": token_version,
            "action": action,
        }
        if any(record.get(key) != value for key, value in expected.items()):
            raise Unauthorized(error="MFA_VERIFICATION_BINDING_MISMATCH")

    async def _require_active_session(
        self,
        *,
        user_id: UUID,
        session_id: str,
        token_version: int,
    ) -> None:
        store = self._refresh_store
        if store is None:
            raise ServiceUnavailable(error="MFA_VERIFICATION_STORE_UNAVAILABLE")
        if not await store.has_active_session(
            user_id=user_id,
            session_id=session_id,
            token_version=token_version,
        ):
            raise Unauthorized(error="CURRENT_SESSION_INACTIVE")

    def _require_proof_store(self) -> SecurityVerificationProofStore:
        if self._proof_store is None:
            raise ServiceUnavailable(error="MFA_VERIFICATION_STORE_UNAVAILABLE")
        return self._proof_store

    @staticmethod
    def _binding(*, session_id: str, action: SecurityAction) -> str:
        return f"action-verification:{session_id}:{action}"
