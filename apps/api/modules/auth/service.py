from __future__ import annotations

import asyncio
import re
from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from asgi_correlation_id import correlation_id

from apps.api.common.email.service import EmailService
from apps.api.common.protocols.tortoise import HasOrganizationId
from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, Conflict, Forbidden, NotFound, ServiceUnavailable, Unauthorized
from apps.api.core.http.pagination import PageData, PageParams
from apps.api.core.i18n import t
from apps.api.infra.cache.valkey import ValkeyClientLike
from apps.api.modules.auth.constants import PASSWORD_REGEX, REFRESH_STATUS_ACTIVE, RESET_TOKEN_REGEX
from apps.api.modules.auth.contracts import CredentialLike, UserLike, UserRepositoryLike
from apps.api.modules.auth.invitation_service import AuthInvitationService
from apps.api.modules.auth.repository import EmailChangeStore, PasswordResetStore, RefreshTokenStore, UserRepository
from apps.api.modules.auth.schema import (
    AcceptExistingInvitationRequest,
    AcceptExistingInvitationResult,
    AcceptInvitationRequest,
    InvitationPreviewResult,
    MyInvitationListQuery,
    MyInvitationOut,
    ResetTokenPayload,
    TokenPair,
    UpdateMyProfileRequest,
    UserProfile,
)
from apps.api.modules.auth.security import (
    TOKEN_TYPE_REFRESH,
    build_access_token,
    build_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from apps.api.modules.organization.models.org_membership import OrgMembership
from apps.api.modules.organization.models.user import User

_FATAL_AUTH_EVENT_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_AUTH_EVENT_ERRORS):
        raise exc


class AuthService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        valkey: ValkeyClientLike | None = None,
        user_repo: UserRepositoryLike | None = None,
    ) -> None:
        super().__init__(settings)
        self.user_repo: UserRepositoryLike = user_repo or UserRepository()
        self.valkey = valkey
        self.refresh_store = RefreshTokenStore(valkey, settings.auth) if valkey else None
        self.reset_store = PasswordResetStore(valkey, settings.auth) if valkey else None
        self.email_change_store = EmailChangeStore(valkey) if valkey else None
        self.email_service = EmailService(settings)
        self.invitation_service = AuthInvitationService(settings)

    def _ta(self, key: str, default: str) -> str:
        return t("auth", key, default=default)

    def _require_refresh_store(self) -> RefreshTokenStore:
        if self.refresh_store is None:
            raise ServiceUnavailable(
                message=self._ta("REFRESH_STORE_UNAVAILABLE", "刷新令牌服务不可用"),
                error="REFRESH_STORE_UNAVAILABLE",
            )
        return self.refresh_store

    def _require_email_change_store(self) -> EmailChangeStore:
        if self.email_change_store is None:
            raise ServiceUnavailable(
                message=self._ta("EMAIL_CHANGE_STORE_UNAVAILABLE", "邮箱验证服务不可用"),
                error="EMAIL_CHANGE_STORE_UNAVAILABLE",
            )
        return self.email_change_store

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

    def _coerce_user_id(self, user: UserLike) -> UUID:
        return UUID(str(user.id))

    def _coerce_token_version(self, user: UserLike) -> int:
        raw = getattr(user, "token_version", 0)
        try:
            return int(raw or 0)
        except (TypeError, ValueError) as exc:
            self.logger.warning(
                "Invalid token_version value on user",
                user_id=str(getattr(user, "id", "")),
                action="coerce_token_version",
                token_version_raw=str(raw),
                error=str(exc),
            )
            return 0

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

    async def request_email_change(self, *, user: User, new_email: str) -> tuple[str, int, str]:
        """
        Issue a verification code to the new email address.
        """

        if not await self.email_service.is_enabled():
            raise BadRequest(
                message=self._ta("MAIL_DISABLED", "系统未开启邮件服务，请联系管理员"),
                error="MAIL_DISABLED",
            )

        new_email = new_email.strip().lower()
        if user.email and new_email == user.email.strip().lower():
            raise BadRequest(message=self._ta("EMAIL_SAME", "新邮箱不能与当前邮箱相同"), error="EMAIL_SAME")

        if await self.user_repo.exists_email(new_email):
            raise Conflict(message=self._ta("EMAIL_EXISTS", "邮箱已被占用"), error="EMAIL_EXISTS")

        store = self._require_email_change_store()
        code, ttl = await store.issue(user_id=cast(UUID, user.id), new_email=new_email)
        return code, ttl, new_email

    async def send_email_change_code(
        self,
        *,
        recipient: str,
        code: str,
        expires_in: int,
        user_id: UUID | None = None,
        locale: str | None = None,
    ) -> None:
        await self.email_service.send_email_change_code(
            recipient=recipient,
            code=code,
            expires_in=expires_in,
            user_id=str(user_id) if user_id else None,
            locale=locale,
        )

    async def confirm_email_change(
        self,
        *,
        user: User,
        new_email: str,
        code: str,
        password: str,
    ) -> UserProfile:
        new_email = new_email.strip().lower()
        code = code.strip()

        # Ensure credential is loaded for password verification.
        # `get_current_user` does not prefetch relations to keep it lightweight.
        user_with_cred = await UserRepository().get_by_id_with_credential(cast(UUID, user.id))
        if user_with_cred is None:
            raise Unauthorized(message=self._ta("USER_NOT_FOUND", "用户不存在"), error="USER_NOT_FOUND")

        credential = cast(CredentialLike | None, getattr(user_with_cred, "credential", None))
        if credential is None or not verify_password(password, credential.password_hash, self.settings.auth):
            raise Unauthorized(
                message=self._ta("INVALID_CREDENTIALS", "账号或密码错误"),
                error="INVALID_CREDENTIALS",
            )

        store = self._require_email_change_store()
        record = await store.get(user_id=cast(UUID, user.id))
        if not record:
            raise Unauthorized(message=self._ta("EMAIL_CODE_INVALID", "验证码无效或已过期"), error="EMAIL_CODE_INVALID")

        issued_email = str(record.get("new_email") or "").strip().lower()
        issued_code = str(record.get("code") or "").strip()

        if issued_email != new_email:
            raise BadRequest(message=self._ta("EMAIL_MISMATCH", "邮箱与验证码不匹配"), error="EMAIL_MISMATCH")
        if issued_code != code:
            tries = await store.bump_attempts(user_id=cast(UUID, user.id))
            if tries >= 5:
                await store.delete(user_id=cast(UUID, user.id))
            raise Unauthorized(message=self._ta("EMAIL_CODE_INVALID", "验证码无效或已过期"), error="EMAIL_CODE_INVALID")

        if user_with_cred.email and new_email == user_with_cred.email.strip().lower():
            await store.delete(user_id=cast(UUID, user.id))
            raise BadRequest(message=self._ta("EMAIL_SAME", "新邮箱不能与当前邮箱相同"), error="EMAIL_SAME")

        if await self.user_repo.exists_email(new_email):
            await store.delete(user_id=cast(UUID, user.id))
            raise Conflict(message=self._ta("EMAIL_EXISTS", "邮箱已被占用"), error="EMAIL_EXISTS")

        await self.user_repo.set_email(user_with_cred, new_email)
        await store.delete(user_id=cast(UUID, user.id))
        return self.build_user_profile(user_with_cred)

    async def delete_my_account(self, *, user: User, email: str, password: str) -> None:
        """
        Delete/anonymize the current account.

        For safety, we anonymize instead of hard-deleting to avoid breaking foreign-key-less references
        (many tables store `*_user_id` as raw UUID fields).
        """

        user_with_cred = await UserRepository().get_by_id_with_credential(cast(UUID, user.id))
        if user_with_cred is None:
            raise Unauthorized(message=self._ta("USER_NOT_FOUND", "用户不存在"), error="USER_NOT_FOUND")

        if not user_with_cred.email:
            raise BadRequest(message=self._ta("EMAIL_REQUIRED", "当前账号未绑定邮箱"), error="EMAIL_REQUIRED")

        normalized_email = email.strip().lower()
        if normalized_email != user_with_cred.email.strip().lower():
            raise BadRequest(message=self._ta("EMAIL_MISMATCH", "邮箱与当前账号不匹配"), error="EMAIL_MISMATCH")

        credential = cast(CredentialLike | None, getattr(user_with_cred, "credential", None))
        if credential is None or not verify_password(password, credential.password_hash, self.settings.auth):
            raise Unauthorized(
                message=self._ta("INVALID_CREDENTIALS", "账号或密码错误"),
                error="INVALID_CREDENTIALS",
            )

        user_id = cast(UUID, user.id)

        # Revoke refresh tokens + invalidate existing access tokens.
        await self.user_repo.increment_token_version(user)
        if self.refresh_store is not None:
            await self.refresh_store.revoke_all(user_id)

        # Best-effort: remove OAuth identity mappings to prevent SSO sign-in after deletion.
        try:
            from apps.api.modules.auth.oauth_social.models import OAuthIdentity

            await OAuthIdentity.filter(user_id=user_id).delete()
        except BaseException as exc:
            _raise_if_fatal(exc)
            self.logger.warning("OAuth identities cleanup failed", user_id=str(user_id), error=str(exc))

        # Remove password credential and scrub PII.
        try:
            from apps.api.modules.organization.models.user import UserCredential

            await UserCredential.filter(user_id=user_id).delete()
        except BaseException as exc:
            _raise_if_fatal(exc)
            self.logger.warning("Credential cleanup failed", user_id=str(user_id), error=str(exc))

        await cast(UserRepository, self.user_repo).anonymize_user(user_with_cred)

    async def _handle_refresh_reuse(self, user_id: UUID) -> None:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            return
        await self.user_repo.increment_token_version(user)
        store = self._require_refresh_store()
        await store.revoke_all(self._coerce_user_id(user))
        self.logger.warning("Refresh token reuse detected", user_id=str(user_id))

    async def login(self, *, identifier: str, password: str) -> TokenPair:
        store = self._require_refresh_store()
        user = await self.user_repo.get_by_identifier(identifier)
        credential = cast(CredentialLike | None, getattr(user, "credential", None) if user is not None else None)
        if user is None or credential is None:
            raise Unauthorized(
                message=self._ta("INVALID_CREDENTIALS", "账号或密码错误"),
                error="INVALID_CREDENTIALS",
            )

        if not self.user_repo.is_active(user):
            raise Forbidden(message=self._ta("USER_DISABLED", "账号不可用"), error="USER_DISABLED")

        if not verify_password(password, credential.password_hash, self.settings.auth):
            raise Unauthorized(
                message=self._ta("INVALID_CREDENTIALS", "账号或密码错误"),
                error="INVALID_CREDENTIALS",
            )

        user_id = self._coerce_user_id(user)
        token_version = self._coerce_token_version(user)

        access_token, access_ttl = build_access_token(
            user_id=user_id,
            token_version=token_version,
            settings=self.settings.auth,
        )
        refresh_token, jti, refresh_ttl = build_refresh_token(
            user_id=user_id,
            token_version=token_version,
            settings=self.settings.auth,
        )

        now_ts = int(datetime.now(UTC).timestamp())
        record = {
            "jti": jti,
            "user_id": str(user_id),
            "token_version": token_version,
            "status": REFRESH_STATUS_ACTIVE,
            "issued_at": now_ts,
            "expires_at": now_ts + refresh_ttl,
        }
        await store.store(record, ttl=refresh_ttl)
        await self.user_repo.update_last_login(user)

        # Best-effort: emit audit-worthy login event (do not block auth flow).
        try:
            from apps.api.plugin.event_bus import Event
            from apps.api.plugin.host import host as plugin_host

            orgm = await OrgMembership.filter(user_id=user_id, status="active").order_by("created_at", "id").first()
            org_id = UUID(str(cast(HasOrganizationId, orgm).organization_id)) if orgm is not None else None

            await plugin_host.event_bus.publish(
                Event(
                    name="auth.login.succeeded",
                    payload={
                        "organization_id": str(org_id) if org_id else None,
                    },
                    source="api",
                    trace_id=correlation_id.get(None),
                    actor_user_id=str(user_id),
                )
            )
        except BaseException as exc:
            _raise_if_fatal(exc)
            self.logger.warning(
                "Auth login event publish failed",
                user_id=str(user_id),
                action="publish_auth_login_event",
                event_name="auth.login.succeeded",
                error=str(exc),
            )

        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=access_ttl,
            refresh_expires_in=refresh_ttl,
        )

    async def issue_token_pair_for_user(self, user_id: UUID) -> TokenPair:
        """
        Issue a TokenPair for a user without password verification.

        Used by SSO/OAuth flows where the user has already been authenticated by an upstream provider.
        """

        store = self._require_refresh_store()
        user = await self.user_repo.get_by_id(user_id)
        if user is None:
            raise Unauthorized(
                message=self._ta("INVALID_CREDENTIALS", "账号或密码错误"),
                error="INVALID_CREDENTIALS",
            )
        if not self.user_repo.is_active(user):
            raise Forbidden(message=self._ta("USER_DISABLED", "账号不可用"), error="USER_DISABLED")

        resolved_user_id = self._coerce_user_id(user)
        token_version = self._coerce_token_version(user)

        access_token, access_ttl = build_access_token(
            user_id=resolved_user_id,
            token_version=token_version,
            settings=self.settings.auth,
        )
        refresh_token, jti, refresh_ttl = build_refresh_token(
            user_id=resolved_user_id,
            token_version=token_version,
            settings=self.settings.auth,
        )

        now_ts = int(datetime.now(UTC).timestamp())
        record = {
            "jti": jti,
            "user_id": str(resolved_user_id),
            "token_version": token_version,
            "status": REFRESH_STATUS_ACTIVE,
            "issued_at": now_ts,
            "expires_at": now_ts + refresh_ttl,
        }
        await store.store(record, ttl=refresh_ttl)
        await self.user_repo.update_last_login(user)

        # Best-effort: emit audit-worthy login event (do not block auth flow).
        try:
            from apps.api.plugin.event_bus import Event
            from apps.api.plugin.host import host as plugin_host

            orgm = await OrgMembership.get_or_none(user_id=resolved_user_id)
            org_id = UUID(str(cast(HasOrganizationId, orgm).organization_id)) if orgm is not None else None

            await plugin_host.event_bus.publish(
                Event(
                    name="auth.login.succeeded",
                    payload={
                        "organization_id": str(org_id) if org_id else None,
                    },
                    source="api",
                    trace_id=correlation_id.get(None),
                    actor_user_id=str(resolved_user_id),
                )
            )
        except BaseException as exc:
            _raise_if_fatal(exc)
            self.logger.warning(
                "Auth token issue event publish failed",
                user_id=str(resolved_user_id),
                action="publish_auth_login_event",
                event_name="auth.login.succeeded",
                error=str(exc),
            )

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
    ) -> UserLike:
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

        if self._coerce_token_version(user) != int(token_version or 0):
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

        resolved_user_id = self._coerce_user_id(user)
        resolved_token_version = self._coerce_token_version(user)
        access_token, access_ttl = build_access_token(
            user_id=resolved_user_id,
            token_version=resolved_token_version,
            settings=self.settings.auth,
        )
        new_refresh_token, new_jti, refresh_ttl = build_refresh_token(
            user_id=resolved_user_id,
            token_version=resolved_token_version,
            settings=self.settings.auth,
        )

        await store.mark_rotated(jti, replaced_by=new_jti)
        now_ts = int(datetime.now(UTC).timestamp())
        new_record = {
            "jti": new_jti,
            "user_id": str(resolved_user_id),
            "token_version": resolved_token_version,
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
        await store.revoke_all(self._coerce_user_id(user))

    async def change_password(self, *, user_id: UUID, old_password: str, new_password: str) -> None:
        user = await self.user_repo.get_by_id_with_credential(user_id)
        credential = cast(CredentialLike | None, getattr(user, "credential", None) if user is not None else None)
        if user is None or credential is None:
            raise Unauthorized(message=self._ta("UNAUTHORIZED", "未授权"), error="UNAUTHORIZED")

        if not self.user_repo.is_active(user):
            raise Forbidden(message=self._ta("USER_DISABLED", "账号不可用"), error="USER_DISABLED")

        if not verify_password(old_password, credential.password_hash, self.settings.auth):
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
            await self.refresh_store.revoke_all(self._coerce_user_id(user))

    async def forgot_password(self, *, identifier: str) -> tuple[str, int, str, UUID] | None:
        store = self._require_reset_store()
        user = await self.user_repo.get_by_identifier(identifier)
        if not user or not self.user_repo.is_active(user):
            return None
        email_raw = getattr(user, "email", None)
        email = str(email_raw).strip() if email_raw else ""
        if not email:
            return None
        user_id = self._coerce_user_id(user)
        token, ttl = await store.issue(user_id)

        # Best-effort: record password reset request for investigation (do not leak data in payload).
        try:
            from apps.api.plugin.event_bus import Event
            from apps.api.plugin.host import host as plugin_host

            orgm = await OrgMembership.filter(user_id=user_id, status="active").order_by("created_at", "id").first()
            org_id = UUID(str(cast(HasOrganizationId, orgm).organization_id)) if orgm is not None else None

            await plugin_host.event_bus.publish(
                Event(
                    name="auth.password.reset.requested",
                    payload={
                        "organization_id": str(org_id) if org_id else None,
                        "subject_user_id": str(user_id),
                    },
                    source="api",
                    trace_id=correlation_id.get(None),
                    actor_user_id=None,
                )
            )
        except BaseException as exc:
            _raise_if_fatal(exc)
            self.logger.warning(
                "Password reset requested event publish failed",
                user_id=str(user_id),
                action="publish_password_reset_requested_event",
                event_name="auth.password.reset.requested",
                error=str(exc),
            )

        return token, ttl, email, user_id

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
        # We need credential loaded to compare password hashes. Without prefetch, `user.credential`
        # is a lazy relation (QuerySet) and will break attribute access.
        user = await self.user_repo.get_by_id_with_credential(user_id)
        if not user:
            raise Unauthorized(message=self._ta("USER_NOT_FOUND", "用户不存在"), error="USER_NOT_FOUND")

        if not self.user_repo.is_active(user):
            raise Forbidden(message=self._ta("USER_DISABLED", "账号不可用"), error="USER_DISABLED")

        credential = cast(CredentialLike | None, getattr(user, "credential", None))
        if credential is not None and verify_password(new_password, credential.password_hash, self.settings.auth):
            raise Conflict(
                message=self._ta("PASSWORD_DUPLICATE", "新密码不能与旧密码相同"),
                error="PASSWORD_DUPLICATE",
            )
        self._ensure_password_strength(new_password)

        await self.user_repo.set_password(user, hash_password(new_password, self.settings.auth))
        await self.user_repo.increment_token_version(user)
        if self.refresh_store is not None:
            await self.refresh_store.revoke_all(self._coerce_user_id(user))

        # Best-effort: record password reset completion.
        try:
            from apps.api.plugin.event_bus import Event
            from apps.api.plugin.host import host as plugin_host

            orgm = await OrgMembership.filter(user_id=user_id, status="active").order_by("created_at", "id").first()
            org_id = UUID(str(cast(HasOrganizationId, orgm).organization_id)) if orgm is not None else None

            await plugin_host.event_bus.publish(
                Event(
                    name="auth.password.reset.completed",
                    payload={
                        "organization_id": str(org_id) if org_id else None,
                        "subject_user_id": str(user_id),
                    },
                    source="api",
                    trace_id=correlation_id.get(None),
                    actor_user_id=str(user_id),
                )
            )
        except BaseException as exc:
            _raise_if_fatal(exc)
            self.logger.warning(
                "Password reset completed event publish failed",
                user_id=str(user_id),
                action="publish_password_reset_completed_event",
                event_name="auth.password.reset.completed",
                error=str(exc),
            )

    @staticmethod
    def build_user_profile(user: UserLike) -> UserProfile:
        return UserProfile(
            id=user.id,
            username=user.username,
            email=user.email,
            display_name=user.display_name,
            avatar_url=user.avatar_url,
            is_super_admin=bool(getattr(user, "is_super_admin", False)),
        )

    async def update_my_profile(self, *, user: User, payload: UpdateMyProfileRequest) -> UserProfile:
        """
        Update current user's profile fields.

        NOTE:
        - Only fields present in the payload are updated.
        - Empty strings are normalized to None by schema validators.
        """

        # Avoid importing schema types at module import time to keep the service layer light.
        model_fields_set = getattr(payload, "model_fields_set", set())

        should_update_display_name = "display_name" in model_fields_set
        if not should_update_display_name:
            return self.build_user_profile(user)

        updated = await self.user_repo.patch_profile(user, display_name=payload.display_name)
        return self.build_user_profile(updated)

    @staticmethod
    def mask_email(email: str) -> str:
        return AuthInvitationService.mask_email(email)

    async def _ensure_role_codes_have_admin_access(self, *, workspace_id: UUID, role_codes: list[str], conn) -> None:
        await self.invitation_service.ensure_role_codes_have_admin_access(
            workspace_id=workspace_id,
            role_codes=role_codes,
            conn=conn,
        )

    async def register_public(
        self,
        *,
        username: str,
        password: str,
        email: str | None = None,
        display_name: str | None = None,
    ) -> UserLike:
        from apps.api.modules.auth.registration.policy import get_public_register_policy

        policy = await get_public_register_policy(self.settings)
        if not policy.enabled:
            # Hide the endpoint by default to enforce invitation-only onboarding.
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

        normalized_email = (email or "").strip().lower() or None
        if policy.require_email and not normalized_email:
            raise BadRequest(message=self._ta("EMAIL_REQUIRED", "邮箱必填"), error="EMAIL_REQUIRED")
        if normalized_email and not policy.is_email_allowed(normalized_email):
            raise Forbidden(
                message=self._ta("REGISTER_DOMAIN_NOT_ALLOWED", "该邮箱域名不允许注册"),
                error="REGISTER_DOMAIN_NOT_ALLOWED",
            )
        user = await self.register(
            username=username,
            password=password,
            email=normalized_email,
            display_name=display_name,
        )

        # Public registration should always land in an operable bootstrap state.
        # Keep it idempotent and recoverable by using the shared provisioning orchestrator.
        try:
            from apps.api.modules.provision.service import TenantProvisioningService

            provisioning = TenantProvisioningService(self.settings)
            await provisioning.ensure_user_bootstrap(
                user_id=self._coerce_user_id(user),
                source="register",
            )
        except BaseException as exc:
            _raise_if_fatal(exc)
            self.logger.error(
                "Public register bootstrap failed",
                action="register_public_bootstrap",
                user_id=str(getattr(user, "id", "")),
                error=str(exc),
            )
            raise ServiceUnavailable(
                message=self._ta("REGISTER_BOOTSTRAP_FAILED", "Registration bootstrap failed"),
                error="REGISTER_BOOTSTRAP_FAILED",
            ) from exc

        return user

    async def request_password_reset(
        self,
        *,
        identifier: str,
    ) -> tuple[ResetTokenPayload | None, tuple[str, int, str, UUID] | None]:
        # Password reset is a critical flow: without email, the user can't complete the loop.
        # To avoid "fake success" and confusion, fail fast when email sending is disabled.
        if not await self.email_service.is_enabled():
            raise BadRequest(
                message=self._ta("MAIL_DISABLED", "系统未开启邮件服务，请联系管理员"),
                error="MAIL_DISABLED",
            )

        issued = await self.forgot_password(identifier=identifier)
        token_payload = None
        if issued and self.settings.app_env in {"development", "test"}:
            token, ttl, _recipient, _user_id = issued
            token_payload = ResetTokenPayload(reset_token=token, expires_in=ttl)
        return token_payload, issued

    async def list_my_invitations(
        self,
        *,
        user: User,
        params: PageParams,
        filters: MyInvitationListQuery,
    ) -> PageData[MyInvitationOut]:
        return await self.invitation_service.list_my_invitations(user=user, params=params, filters=filters)

    async def accept_invitation(self, *, payload: AcceptInvitationRequest) -> TokenPair:
        # If we cannot issue refresh tokens, the UX becomes confusing (account created but cannot login).
        self._require_refresh_store()
        return await self.invitation_service.accept_invitation(
            payload=payload,
            ensure_password_strength=self._ensure_password_strength,
            issue_tokens=self.login,
        )

    async def preview_invitation(self, *, token: str) -> InvitationPreviewResult:
        return await self.invitation_service.preview_invitation(token=token)

    async def accept_existing_invitation(
        self,
        *,
        payload: AcceptExistingInvitationRequest,
        user: User,
    ) -> AcceptExistingInvitationResult:
        return await self.invitation_service.accept_existing_invitation(payload=payload, user=user)
