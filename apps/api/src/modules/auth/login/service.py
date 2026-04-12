from __future__ import annotations

from typing import Protocol
from uuid import UUID

from src.common.services import BaseService
from src.config import Settings
from src.core.exceptions import BadRequest, Forbidden, ServiceUnavailable, Unauthorized
from src.core.i18n import t
from src.infra.cache.valkey import ValkeyClientLike
from src.modules.auth.schema import TokenPair
from src.modules.auth.service import AuthService
from src.modules.auth.sessions.request_context import AuthRequestContext
from src.modules.auth.tokens.service import verify_password
from src.modules.auth.two_factor.challenge_store import TwoFactorChallengeStore


class TwoFactorLoginLike(Protocol):
    async def is_enabled(self, *, user_id: UUID) -> bool: ...

    async def verify_for_login(self, *, user_id: UUID, code: str | None, backup_code: str | None) -> None: ...


class AuthLoginService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        valkey: ValkeyClientLike | None,
        auth_service: AuthService,
        two_factor: TwoFactorLoginLike,
    ) -> None:
        super().__init__(settings)
        self.auth_service = auth_service
        self.two_factor = two_factor
        self.challenge_store = TwoFactorChallengeStore(valkey) if valkey is not None else None

    def _ta(self, key: str, default: str) -> str:
        return t("auth", key, default=default)

    def _require_challenge_store(self) -> TwoFactorChallengeStore:
        if self.challenge_store is None:
            raise ServiceUnavailable(
                message=self._ta("TWO_FACTOR_STORE_UNAVAILABLE", "2FA 服务不可用"),
                error="TWO_FACTOR_STORE_UNAVAILABLE",
            )
        return self.challenge_store

    async def login(
        self,
        *,
        identifier: str,
        password: str,
        request_context: AuthRequestContext | None = None,
    ) -> TokenPair:
        user = await self.auth_service.user_repo.get_by_identifier(identifier)
        credential = None if user is None else getattr(user, "credential", None)
        if user is None or credential is None:
            raise Unauthorized(
                message=self._ta("INVALID_CREDENTIALS", "账号或密码错误"),
                error="INVALID_CREDENTIALS",
            )
        if not self.auth_service.user_repo.is_active(user):
            raise Forbidden(message=self._ta("USER_DISABLED", "账号不可用"), error="USER_DISABLED")

        password_hash = getattr(credential, "password_hash", "")
        if not isinstance(password_hash, str) or not password_hash:
            raise Unauthorized(
                message=self._ta("INVALID_CREDENTIALS", "账号或密码错误"),
                error="INVALID_CREDENTIALS",
            )

        if not verify_password(password, password_hash, self.settings.auth):
            raise Unauthorized(
                message=self._ta("INVALID_CREDENTIALS", "账号或密码错误"),
                error="INVALID_CREDENTIALS",
            )

        user_id = UUID(str(user.id))
        if await self.two_factor.is_enabled(user_id=user_id):
            token, ttl = await self._require_challenge_store().issue(
                user_id=user_id,
                request_context=request_context,
                auth_method="password",
            )
            raise Unauthorized(
                message=self._ta("TWO_FACTOR_REQUIRED", "需要进行 2FA 验证"),
                error="TWO_FACTOR_REQUIRED",
                meta={"two_factor_token": token, "expires_in": ttl},
            )

        return await self.auth_service.issue_token_pair_for_user(
            user_id,
            request_context=request_context,
            auth_method="password",
        )

    async def issue_after_upstream_auth(
        self,
        *,
        user_id: UUID,
        request_context: AuthRequestContext | None = None,
        auth_method: str = "sso",
    ) -> TokenPair:
        if await self.two_factor.is_enabled(user_id=user_id):
            token, ttl = await self._require_challenge_store().issue(
                user_id=user_id,
                request_context=request_context,
                auth_method="password",
            )
            raise Unauthorized(
                message=self._ta("TWO_FACTOR_REQUIRED", "需要进行 2FA 验证"),
                error="TWO_FACTOR_REQUIRED",
                meta={"two_factor_token": token, "expires_in": ttl},
            )
        return await self.auth_service.issue_token_pair_for_user(
            user_id,
            request_context=request_context,
            auth_method="password",
        )

    async def complete_two_factor_login(
        self,
        *,
        two_factor_token: str,
        code: str | None,
        backup_code: str | None,
        request_context: AuthRequestContext | None = None,
    ) -> TokenPair:
        store = self._require_challenge_store()
        token = (two_factor_token or "").strip()
        if not token:
            raise Unauthorized(
                message=self._ta("TWO_FACTOR_REQUIRED", "需要进行 2FA 验证"), error="TWO_FACTOR_REQUIRED"
            )

        record = await store.get(token=token)
        if record is None:
            raise Unauthorized(
                message=self._ta("TWO_FACTOR_CHALLENGE_INVALID", "2FA 令牌无效或已过期"),
                error="TWO_FACTOR_CHALLENGE_INVALID",
            )

        attempts = int(record.get("attempts") or 0)
        if attempts >= store.max_attempts:
            await store.delete(token=token)
            raise Unauthorized(
                message=self._ta("TWO_FACTOR_CHALLENGE_EXPIRED", "2FA 令牌无效或已过期"),
                error="TWO_FACTOR_CHALLENGE_EXPIRED",
            )

        raw_user_id = record.get("user_id")
        try:
            user_id = UUID(str(raw_user_id or "").strip())
        except ValueError as exc:
            await store.delete(token=token)
            raise Unauthorized(
                message=self._ta("TWO_FACTOR_CHALLENGE_INVALID", "2FA 令牌无效或已过期"),
                error="TWO_FACTOR_CHALLENGE_INVALID",
            ) from exc
        try:
            await self.two_factor.verify_for_login(user_id=user_id, code=code, backup_code=backup_code)
        except BadRequest as exc:
            tries = await store.bump_attempts(token=token)
            if tries >= store.max_attempts:
                await store.delete(token=token)
            raise Unauthorized(message=exc.message, error=exc.error) from exc

        consumed = await store.try_mark_consumed(token=token)
        if not consumed:
            raise Unauthorized(
                message=self._ta("TWO_FACTOR_CHALLENGE_INVALID", "2FA 令牌无效或已过期"),
                error="TWO_FACTOR_CHALLENGE_INVALID",
            )

        await store.delete(token=token)
        return await self.auth_service.issue_token_pair_for_user(
            user_id,
            request_context=request_context,
            auth_method="password",
        )
