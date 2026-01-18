from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.database.valkey import ValkeyClient
from apps.api.core.exceptions import Forbidden, ServiceUnavailable, Unauthorized
from apps.api.routers.v1.auth.constants import REFRESH_STATUS_ACTIVE
from apps.api.routers.v1.auth.repository import RefreshTokenStore, UserRepository
from apps.api.routers.v1.auth.schema import TokenPair
from apps.api.routers.v1.auth.security import (
    TOKEN_TYPE_REFRESH,
    build_access_token,
    build_refresh_token,
    decode_token,
    verify_password,
)


class AuthService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        valkey: ValkeyClient | None = None,
        user_repo: UserRepository | None = None,
    ) -> None:
        super().__init__(settings)
        self.user_repo = user_repo or UserRepository()
        self.valkey = valkey
        self.refresh_store = RefreshTokenStore(valkey, settings.auth) if valkey else None

    def _require_refresh_store(self) -> RefreshTokenStore:
        if self.refresh_store is None:
            raise ServiceUnavailable(message="刷新令牌服务不可用", error="REFRESH_STORE_UNAVAILABLE")
        return self.refresh_store

    def _parse_user_id(self, raw: str | None) -> UUID:
        if not raw:
            raise Unauthorized(message="Token 无效", error="TOKEN_INVALID")
        try:
            return UUID(str(raw))
        except ValueError as exc:
            raise Unauthorized(message="Token 无效", error="TOKEN_INVALID") from exc

    async def _handle_refresh_reuse(self, user_id: UUID) -> None:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            return
        await self.user_repo.increment_token_version(user)
        store = self._require_refresh_store()
        await store.revoke_all(user.id)
        self.logger.warning("检测到 Refresh Token 复用", user_id=str(user_id))

    async def login(self, *, identifier: str, password: str) -> TokenPair:
        store = self._require_refresh_store()
        user = await self.user_repo.get_by_identifier(identifier)
        if not user or not getattr(user, "credential", None):
            raise Unauthorized(message="账号或密码错误", error="INVALID_CREDENTIALS")

        if not self.user_repo.is_active(user):
            raise Forbidden(message="账号不可用", error="USER_DISABLED")

        if not verify_password(password, user.credential.password_hash, self.settings.auth):
            raise Unauthorized(message="账号或密码错误", error="INVALID_CREDENTIALS")

        access_token, access_ttl = build_access_token(
            user_id=user.id,
            token_version=user.token_version or 0,
            settings=self.settings.auth,
        )
        refresh_token, jti, refresh_ttl = build_refresh_token(
            user_id=user.id,
            token_version=user.token_version or 0,
            settings=self.settings.auth,
        )

        now_ts = int(datetime.now(UTC).timestamp())
        record = {
            "jti": jti,
            "user_id": str(user.id),
            "token_version": user.token_version or 0,
            "status": REFRESH_STATUS_ACTIVE,
            "issued_at": now_ts,
            "expires_at": now_ts + refresh_ttl,
        }
        await store.store(record, ttl=refresh_ttl)
        await self.user_repo.update_last_login(user)

        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=access_ttl,
            refresh_expires_in=refresh_ttl,
        )

    async def refresh(self, *, refresh_token: str) -> TokenPair:
        store = self._require_refresh_store()
        payload = decode_token(refresh_token, self.settings.auth)
        if payload.get("typ") != TOKEN_TYPE_REFRESH:
            raise Unauthorized(message="Refresh Token 无效", error="REFRESH_INVALID")

        user_id = self._parse_user_id(payload.get("sub"))
        token_version = payload.get("ver")
        jti = payload.get("jti")
        if not jti:
            raise Unauthorized(message="Refresh Token 无效", error="REFRESH_INVALID")

        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise Unauthorized(message="用户不存在", error="USER_NOT_FOUND")

        if not self.user_repo.is_active(user):
            raise Forbidden(message="账号不可用", error="USER_DISABLED")

        if user.token_version != token_version:
            raise Unauthorized(message="Token 已失效", error="TOKEN_STALE")

        record = await store.get(jti)
        if not record:
            raise Unauthorized(message="Refresh Token 已失效", error="REFRESH_NOT_FOUND")

        if record.get("status") != REFRESH_STATUS_ACTIVE:
            await self._handle_refresh_reuse(user_id)
            raise Unauthorized(message="Refresh Token 已被使用", error="TOKEN_REUSED")

        if record.get("user_id") != str(user_id) or record.get("token_version") != token_version:
            await self._handle_refresh_reuse(user_id)
            raise Unauthorized(message="Refresh Token 异常", error="TOKEN_REUSED")

        access_token, access_ttl = build_access_token(
            user_id=user.id,
            token_version=user.token_version or 0,
            settings=self.settings.auth,
        )
        new_refresh_token, new_jti, refresh_ttl = build_refresh_token(
            user_id=user.id,
            token_version=user.token_version or 0,
            settings=self.settings.auth,
        )

        await store.mark_rotated(jti, replaced_by=new_jti)
        now_ts = int(datetime.now(UTC).timestamp())
        new_record = {
            "jti": new_jti,
            "user_id": str(user.id),
            "token_version": user.token_version or 0,
            "status": REFRESH_STATUS_ACTIVE,
            "issued_at": now_ts,
            "expires_at": now_ts + refresh_ttl,
            "parent": jti,
        }
        await store.store(new_record, ttl=refresh_ttl)

        return TokenPair(
            access_token=access_token,
            refresh_token=new_refresh_token,
            expires_in=access_ttl,
            refresh_expires_in=refresh_ttl,
        )

    async def logout(self, *, user_id: UUID | None, refresh_token: str | None = None) -> None:
        store = self._require_refresh_store()
        if refresh_token:
            payload = decode_token(refresh_token, self.settings.auth)
            if payload.get("typ") != TOKEN_TYPE_REFRESH:
                raise Unauthorized(message="Refresh Token 无效", error="REFRESH_INVALID")
            jti = payload.get("jti")
            if jti:
                await store.revoke(jti)
            return

        if user_id is None:
            raise Unauthorized(message="未授权", error="UNAUTHORIZED")

        await store.revoke_all(user_id)
