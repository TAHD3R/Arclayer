from __future__ import annotations

import re
from datetime import UTC, datetime
from uuid import UUID

from apps.api.common.email.service import EmailService
from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, Conflict, Forbidden, ServiceUnavailable, Unauthorized
from apps.api.core.i18n import t
from apps.api.infra.cache.valkey import ValkeyClient
from apps.api.routers.v1.auth.constants import PASSWORD_REGEX, REFRESH_STATUS_ACTIVE, RESET_TOKEN_REGEX
from apps.api.routers.v1.auth.repository import PasswordResetStore, RefreshTokenStore, UserRepository
from apps.api.routers.v1.auth.schema import TokenPair
from apps.api.routers.v1.auth.security import (
    TOKEN_TYPE_REFRESH,
    build_access_token,
    build_refresh_token,
    decode_token,
    hash_password,
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
        self.reset_store = PasswordResetStore(valkey, settings.auth) if valkey else None
        self.email_service = EmailService(settings)

    def _ta(self, key: str, default: str) -> str:
        return t("auth", key, default=default)

    def _require_refresh_store(self) -> RefreshTokenStore:
        if self.refresh_store is None:
            raise ServiceUnavailable(
                message=self._ta("REFRESH_STORE_UNAVAILABLE", "刷新令牌服务不可用"),
                error="REFRESH_STORE_UNAVAILABLE",
            )
        return self.refresh_store

    def _require_reset_store(self) -> PasswordResetStore:
        if self.reset_store is None:
            raise ServiceUnavailable(
                message=self._ta("RESET_STORE_UNAVAILABLE", "重置令牌服务不可用"),
                error="RESET_STORE_UNAVAILABLE",
            )
        return self.reset_store

    def _parse_user_id(self, raw: str | None) -> UUID:
        if not raw:
            raise Unauthorized(message=self._ta("TOKEN_INVALID", "Token 无效"), error="TOKEN_INVALID")
        try:
            return UUID(str(raw))
        except ValueError as exc:
            raise Unauthorized(message=self._ta("TOKEN_INVALID", "Token 无效"), error="TOKEN_INVALID") from exc

    def _ensure_password_strength(self, password: str) -> None:
        if not re.match(PASSWORD_REGEX, password):
            raise BadRequest(
                message=self._ta("PASSWORD_INVALID", "密码必须包含字母和数字，且长度为8-128"),
                error="PASSWORD_INVALID",
            )

    def _ensure_reset_token_format(self, reset_token: str) -> None:
        if not re.match(RESET_TOKEN_REGEX, reset_token):
            raise BadRequest(
                message=self._ta("RESET_TOKEN_FORMAT_INVALID", "重置令牌格式不正确"),
                error="RESET_TOKEN_INVALID",
            )

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
            raise Unauthorized(
                message=self._ta("INVALID_CREDENTIALS", "账号或密码错误"),
                error="INVALID_CREDENTIALS",
            )

        if not self.user_repo.is_active(user):
            raise Forbidden(message=self._ta("USER_DISABLED", "账号不可用"), error="USER_DISABLED")

        if not verify_password(password, user.credential.password_hash, self.settings.auth):
            raise Unauthorized(
                message=self._ta("INVALID_CREDENTIALS", "账号或密码错误"),
                error="INVALID_CREDENTIALS",
            )

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

    async def register(
        self,
        *,
        username: str,
        password: str,
        email: str | None = None,
        display_name: str | None = None,
    ):
        username = username.strip()
        email = email.strip() if email else None
        display_name = display_name.strip() if display_name else None

        if await self.user_repo.exists_username(username):
            raise Conflict(message=self._ta("USERNAME_EXISTS", "用户名已存在"), error="USERNAME_EXISTS")
        if email and await self.user_repo.exists_email(email):
            raise Conflict(message=self._ta("EMAIL_EXISTS", "邮箱已存在"), error="EMAIL_EXISTS")

        self._ensure_password_strength(password)
        password_hash = hash_password(password, self.settings.auth)
        return await self.user_repo.create_user(
            username=username,
            email=email,
            display_name=display_name,
            password_hash=password_hash,
        )

    async def refresh(self, *, refresh_token: str) -> TokenPair:
        store = self._require_refresh_store()
        payload = decode_token(refresh_token, self.settings.auth)
        if payload.get("typ") != TOKEN_TYPE_REFRESH:
            raise Unauthorized(
                message=self._ta("REFRESH_INVALID", "Refresh Token 无效"),
                error="REFRESH_INVALID",
            )

        user_id = self._parse_user_id(payload.get("sub"))
        token_version = payload.get("ver")
        jti = payload.get("jti")
        if not jti:
            raise Unauthorized(
                message=self._ta("REFRESH_INVALID", "Refresh Token 无效"),
                error="REFRESH_INVALID",
            )

        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise Unauthorized(message=self._ta("USER_NOT_FOUND", "用户不存在"), error="USER_NOT_FOUND")

        if not self.user_repo.is_active(user):
            raise Forbidden(message=self._ta("USER_DISABLED", "账号不可用"), error="USER_DISABLED")

        if user.token_version != token_version:
            raise Unauthorized(message=self._ta("TOKEN_STALE", "Token 已失效"), error="TOKEN_STALE")

        record = await store.get(jti)
        if not record:
            raise Unauthorized(
                message=self._ta("REFRESH_NOT_FOUND", "Refresh Token 已失效"),
                error="REFRESH_NOT_FOUND",
            )

        if record.get("status") != REFRESH_STATUS_ACTIVE:
            await self._handle_refresh_reuse(user_id)
            raise Unauthorized(
                message=self._ta("TOKEN_REUSED", "Refresh Token 已被使用"),
                error="TOKEN_REUSED",
            )

        if record.get("user_id") != str(user_id) or record.get("token_version") != token_version:
            await self._handle_refresh_reuse(user_id)
            raise Unauthorized(
                message=self._ta("TOKEN_REUSED", "Refresh Token 异常"),
                error="TOKEN_REUSED",
            )

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
        if user_id is None and refresh_token:
            payload = decode_token(refresh_token, self.settings.auth)
            if payload.get("typ") != TOKEN_TYPE_REFRESH:
                raise Unauthorized(
                    message=self._ta("REFRESH_INVALID", "Refresh Token 无效"),
                    error="REFRESH_INVALID",
                )
            user_id = self._parse_user_id(payload.get("sub"))

        if user_id is None:
            raise Unauthorized(message=self._ta("UNAUTHORIZED", "未授权"), error="UNAUTHORIZED")

        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise Unauthorized(message=self._ta("USER_NOT_FOUND", "用户不存在"), error="USER_NOT_FOUND")

        await self.user_repo.increment_token_version(user)
        await store.revoke_all(user.id)

    async def change_password(self, *, user_id: UUID, old_password: str, new_password: str) -> None:
        user = await self.user_repo.get_by_id_with_credential(user_id)
        if not user or not getattr(user, "credential", None):
            raise Unauthorized(message=self._ta("UNAUTHORIZED", "未授权"), error="UNAUTHORIZED")

        if not self.user_repo.is_active(user):
            raise Forbidden(message=self._ta("USER_DISABLED", "账号不可用"), error="USER_DISABLED")

        if not verify_password(old_password, user.credential.password_hash, self.settings.auth):
            raise Unauthorized(
                message=self._ta("INVALID_CREDENTIALS", "原密码错误"),
                error="INVALID_CREDENTIALS",
            )

        if old_password == new_password:
            raise Conflict(
                message=self._ta("PASSWORD_DUPLICATE", "新旧密码不能相同"),
                error="PASSWORD_DUPLICATE",
            )
        self._ensure_password_strength(new_password)

        await self.user_repo.set_password(user, hash_password(new_password, self.settings.auth))
        await self.user_repo.increment_token_version(user)
        if self.refresh_store is not None:
            await self.refresh_store.revoke_all(user.id)

    async def forgot_password(self, *, identifier: str) -> tuple[str, int, str, UUID] | None:
        store = self._require_reset_store()
        user = await self.user_repo.get_by_identifier(identifier)
        if not user or not self.user_repo.is_active(user):
            return None
        if not user.email:
            return None
        token, ttl = await store.issue(user.id)
        return token, ttl, user.email, user.id

    async def send_reset_email(
        self,
        *,
        recipient: str,
        reset_token: str,
        expires_in: int,
        user_id: UUID | None = None,
        locale: str | None = None,
    ) -> None:
        await self.email_service.send_reset_password(
            recipient=recipient,
            reset_token=reset_token,
            expires_in=expires_in,
            user_id=str(user_id) if user_id else None,
            locale=locale,
        )

    async def send_welcome_email(
        self,
        *,
        recipient: str,
        username: str,
        user_id: UUID | None = None,
        locale: str | None = None,
    ) -> None:
        await self.email_service.send_welcome(
            recipient=recipient,
            username=username,
            user_id=str(user_id) if user_id else None,
            locale=locale,
        )

    async def reset_password(self, *, reset_token: str, new_password: str) -> None:
        store = self._require_reset_store()
        self._ensure_reset_token_format(reset_token)
        record = await store.consume(reset_token)
        if not record:
            raise Unauthorized(
                message=self._ta("RESET_TOKEN_INVALID", "重置令牌无效"),
                error="RESET_TOKEN_INVALID",
            )

        user_id = self._parse_user_id(record.get("user_id"))
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise Unauthorized(message=self._ta("USER_NOT_FOUND", "用户不存在"), error="USER_NOT_FOUND")

        if not self.user_repo.is_active(user):
            raise Forbidden(message=self._ta("USER_DISABLED", "账号不可用"), error="USER_DISABLED")

        if getattr(user, "credential", None) and verify_password(
            new_password, user.credential.password_hash, self.settings.auth
        ):
            raise Conflict(
                message=self._ta("PASSWORD_DUPLICATE", "新密码不能与旧密码相同"),
                error="PASSWORD_DUPLICATE",
            )
        self._ensure_password_strength(new_password)

        await self.user_repo.set_password(user, hash_password(new_password, self.settings.auth))
        await self.user_repo.increment_token_version(user)
        if self.refresh_store is not None:
            await self.refresh_store.revoke_all(user.id)
