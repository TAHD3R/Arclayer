from __future__ import annotations

import asyncio
import re
from datetime import UTC, datetime
from typing import Protocol, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.constants.auth import (
    PASSWORD_REGEX,
    REAUTH_MAX_AGE_SECONDS,
    REFRESH_STATUS_ACTIVE,
    REFRESH_STATUS_REVOKED,
    REFRESH_STATUS_ROTATED,
    RESET_TOKEN_REGEX,
    TOKEN_TYPE_REFRESH,
)
from src.common.email.service import EmailService
from src.common.protocols.tortoise import HasOrganizationId
from src.common.types.json_types import JsonObject
from src.common.utils.ids import uuid7
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, Forbidden, NotFound, ServiceUnavailable, Unauthorized
from src.core.http.pagination import PageData, PageParams
from src.core.i18n import t
from src.core.registries import ConnectorRegistry
from src.core.services import BaseService
from src.models.organization.org_membership import OrgMembership
from src.models.organization.user import User
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.auth.contracts.schema import CredentialLike, UserLike, UserRepositoryLike
from src.modules.auth.invitations.service import AuthInvitationService
from src.modules.auth.oauth.social.repository import OAuthSocialRepository
from src.modules.auth.onboarding.service import WorkspaceFirstOnboardingService
from src.modules.auth.repository import (
    EmailChangeStore,
    PasswordRemovalCodeStore,
    PasswordResetStore,
    RefreshTokenStore,
    RegistrationEmailVerificationStore,
    UserRepository,
)
from src.modules.auth.schema import (
    AcceptExistingInvitationRequest,
    AcceptExistingInvitationResult,
    AcceptInvitationRequest,
    InvitationPreviewResult,
    MyInvitationListQuery,
    MyInvitationOut,
    MySecurityCapabilityOut,
    RegisterEmailVerificationOut,
    RegisterResult,
    ResetTokenPayload,
    TokenPair,
    UpdateMyProfileRequest,
    UserProfile,
)
from src.modules.auth.security_verification.schema import SecurityAction
from src.modules.auth.sessions.device_label import build_device_label
from src.modules.auth.sessions.location_lookup import AuthSessionLocationLookup
from src.modules.auth.sessions.request_context import AuthRequestContext
from src.modules.auth.tokens.service import (
    build_access_token,
    build_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from src.platform.cache.valkey import ValkeyClientLike

_FATAL_AUTH_EVENT_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)

_GENERATED_USERNAME_MAX_LENGTH = 32


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_AUTH_EVENT_ERRORS):
        raise exc


def _sanitize_generated_username_base(value: str | None) -> str:
    raw = (value or "").strip().lower()
    if "@" in raw:
        raw = raw.split("@", 1)[0]
    raw = re.sub(r"[^a-z0-9]+", "-", raw)
    raw = re.sub(r"-+", "-", raw).strip("-")
    return raw[:_GENERATED_USERNAME_MAX_LENGTH].strip("-") or "user"


class _TwoFactorReauthLike(Protocol):
    async def is_enabled(self, *, user_id: UUID) -> bool: ...

    async def verify_for_login(self, *, user_id: UUID, code: str | None, backup_code: str | None) -> None: ...


class _ActionVerificationLike(Protocol):
    async def enabled_methods(self, *, user_id: UUID) -> list[str]: ...

    async def require(
        self,
        *,
        user_id: UUID,
        session_id: str,
        token_version: int,
        action: SecurityAction,
        proof: str | None,
    ) -> None: ...


class AuthService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        valkey: ValkeyClientLike | None = None,
        connector_registry: ConnectorRegistry | None = None,
        user_repo: UserRepositoryLike | None = None,
        two_factor: _TwoFactorReauthLike | None = None,
        action_verification: _ActionVerificationLike | None = None,
        onboarding_service: WorkspaceFirstOnboardingService | None = None,
    ) -> None:
        super().__init__(settings)
        self.user_repo: UserRepositoryLike = user_repo or UserRepository()
        from src.modules.auth.two_factor.service import AuthTwoFactorService

        self.two_factor: _TwoFactorReauthLike = two_factor or AuthTwoFactorService(settings)
        if action_verification is None:
            from src.modules.auth.security_verification.service import AuthActionVerificationService

            action_verification = AuthActionVerificationService(
                settings,
                valkey=valkey,
                two_factor=self.two_factor,
            )
        self.action_verification = action_verification
        self.valkey = valkey
        self.refresh_store = RefreshTokenStore(valkey, settings.auth) if valkey else None
        self.reset_store = PasswordResetStore(valkey, settings.auth) if valkey else None
        self.email_change_store = EmailChangeStore(valkey) if valkey else None
        self.registration_email_verification_store = RegistrationEmailVerificationStore(valkey) if valkey else None
        self.password_removal_store = PasswordRemovalCodeStore(valkey) if valkey else None
        self.email_service = EmailService(
            settings,
            connector_registry=connector_registry,
        )
        self.invitation_service = AuthInvitationService(settings)
        self.location_lookup = AuthSessionLocationLookup(settings)
        self.oauth_repo = OAuthSocialRepository()
        self.onboarding_service = onboarding_service or WorkspaceFirstOnboardingService(settings)

    def _ta(self, key: str, default: str) -> str:
        return t("auth", key, default=default)

    @staticmethod
    def _normalize_email(email: str) -> str:
        return email.strip().lower()

    def _build_session_metadata(
        self, *, request_context: AuthRequestContext | None, auth_method: str
    ) -> dict[str, object | None]:
        ip_address = None if request_context is None else request_context.ip_address
        user_agent = None if request_context is None else request_context.user_agent
        return {
            "ip_address": ip_address,
            "user_agent": user_agent,
            "device_label": build_device_label(user_agent),
            "location_label": self.location_lookup.lookup(ip_address=ip_address),
            "auth_method": (auth_method or "password").strip() or "password",
        }

    def _build_refresh_record(
        self,
        *,
        jti: str,
        user_id: UUID,
        token_version: int,
        session_id: str,
        now_ts: int,
        refresh_ttl: int,
        request_context: AuthRequestContext | None,
        auth_method: str,
        parent: str | None = None,
    ) -> dict[str, object | None]:
        record: dict[str, object | None] = {
            "jti": jti,
            "user_id": str(user_id),
            "token_version": token_version,
            "sid": session_id,
            "status": REFRESH_STATUS_ACTIVE,
            "issued_at": now_ts,
            "last_used_at": now_ts,
            "expires_at": now_ts + refresh_ttl,
        }
        record.update(self._build_session_metadata(request_context=request_context, auth_method=auth_method))
        if parent:
            record["parent"] = parent
        return record

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

    def _require_registration_email_verification_store(self) -> RegistrationEmailVerificationStore:
        if self.registration_email_verification_store is None:
            raise ServiceUnavailable(
                message=self._ta("EMAIL_VERIFICATION_STORE_UNAVAILABLE", "邮箱验证服务不可用"),
                error="EMAIL_VERIFICATION_STORE_UNAVAILABLE",
            )
        return self.registration_email_verification_store

    def _require_password_removal_store(self) -> PasswordRemovalCodeStore:
        if self.password_removal_store is None:
            raise ServiceUnavailable(
                message=self._ta("REMOVE_PASSWORD_STORE_UNAVAILABLE", "密码移除验证服务不可用"),
                error="REMOVE_PASSWORD_STORE_UNAVAILABLE",
            )
        return self.password_removal_store

    def _require_reset_store(self) -> PasswordResetStore:
        if self.reset_store is None:
            raise ServiceUnavailable(
                message=self._ta("RESET_STORE_UNAVAILABLE", "重置令牌服务不可用"),
                error="RESET_STORE_UNAVAILABLE",
            )
        return self.reset_store

    def _parse_user_id(self, raw: object | None) -> UUID:
        if raw is None:
            raise Unauthorized(message=self._ta("TOKEN_INVALID", "Token 无效"), error="TOKEN_INVALID")
        raw_str = str(raw).strip()
        if not raw_str:
            raise Unauthorized(message=self._ta("TOKEN_INVALID", "Token 无效"), error="TOKEN_INVALID")
        try:
            return UUID(raw_str)
        except ValueError as exc:
            raise Unauthorized(message=self._ta("TOKEN_INVALID", "Token 无效"), error="TOKEN_INVALID") from exc

    def _coerce_user_id(self, user: UserLike) -> UUID:
        return UUID(str(user.id))

    async def _write_auth_activity_event(
        self,
        *,
        name: str,
        user_id: UUID,
        actor_user_id: UUID | None = None,
        subject_user_id: UUID | None = None,
        entity_type: str | None = None,
        entity_id: UUID | None = None,
        properties: JsonObject | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        query = OrgMembership.filter(user_id=user_id, status="active").order_by("created_at", "id")
        orgm = await (query.using_db(conn).first() if conn is not None else query.first())
        org_id = UUID(str(cast(HasOrganizationId, orgm).organization_id)) if orgm is not None else None
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=name,
                organization_id=org_id,
                actor_user_id=actor_user_id,
                subject_user_id=subject_user_id,
                entity_type=entity_type,
                entity_id=entity_id,
                source="api",
                properties=properties or {},
            ),
            conn=conn,
        )

    async def _write_password_activity_event(
        self,
        *,
        user_id: UUID,
        actor_user_id: UUID | None = None,
        subject_user_id: UUID | None = None,
        change_kind: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        await self._write_auth_activity_event(
            name="auth.password.updated",
            user_id=user_id,
            actor_user_id=actor_user_id,
            subject_user_id=subject_user_id,
            entity_type="auth_credential",
            properties={"change_kind": change_kind},
            conn=conn,
        )

    async def _record_login_activity(
        self,
        *,
        user: UserLike,
        user_id: UUID,
        auth_method: str,
    ) -> None:
        if isinstance(self.user_repo, UserRepository):
            async with self.tx() as conn:
                await self.user_repo.update_last_login_in_connection(user, conn=conn)
                await self._write_auth_activity_event(
                    name="auth.login",
                    user_id=user_id,
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    entity_type="auth_session",
                    properties={"auth_method": auth_method},
                    conn=conn,
                )
            return

        await self.user_repo.update_last_login(user)
        await self._write_auth_activity_event(
            name="auth.login",
            user_id=user_id,
            actor_user_id=user_id,
            subject_user_id=user_id,
            entity_type="auth_session",
            properties={"auth_method": auth_method},
        )

    def _coerce_token_version(self, user: UserLike) -> int:
        raw = user.token_version
        if isinstance(raw, int):
            return raw
        if isinstance(raw, str):
            value = raw.strip()
            if not value:
                raise Unauthorized(message=self._ta("TOKEN_INVALID", "Token 无效"), error="TOKEN_INVALID")
            try:
                return int(value)
            except ValueError as exc:
                raise Unauthorized(message=self._ta("TOKEN_INVALID", "Token 无效"), error="TOKEN_INVALID") from exc
        raise Unauthorized(message=self._ta("TOKEN_INVALID", "Token 无效"), error="TOKEN_INVALID")

    def _parse_refresh_jti(self, raw: object | None) -> str:
        if not isinstance(raw, str):
            raise Unauthorized(message=self._ta("REFRESH_INVALID", "Refresh Token 无效"), error="REFRESH_INVALID")
        value = raw.strip()
        if not value:
            raise Unauthorized(message=self._ta("REFRESH_INVALID", "Refresh Token 无效"), error="REFRESH_INVALID")
        return value

    def _parse_refresh_token_version(self, raw: object | None) -> int:
        if raw is None:
            raise Unauthorized(message=self._ta("REFRESH_INVALID", "Refresh Token 无效"), error="REFRESH_INVALID")
        if isinstance(raw, int):
            return raw
        if isinstance(raw, str):
            value = raw.strip()
            if not value:
                raise Unauthorized(message=self._ta("REFRESH_INVALID", "Refresh Token 无效"), error="REFRESH_INVALID")
            try:
                return int(value)
            except ValueError as exc:
                raise Unauthorized(
                    message=self._ta("REFRESH_INVALID", "Refresh Token 无效"), error="REFRESH_INVALID"
                ) from exc
        raise Unauthorized(message=self._ta("REFRESH_INVALID", "Refresh Token 无效"), error="REFRESH_INVALID")

    def _parse_session_id(self, raw: object | None) -> str | None:
        if raw is None:
            return None
        if not isinstance(raw, str):
            return None
        value = raw.strip()
        return value or None

    def _ensure_password_strength(self, password: str) -> None:
        if not re.match(PASSWORD_REGEX, password):
            raise BadRequest(
                message=self._ta(
                    "PASSWORD_INVALID",
                    "密码必须为 8-128 个字符，并同时包含字母和数字。",
                ),
                error="PASSWORD_INVALID",
            )

    def _ensure_reset_token_format(self, reset_token: str) -> None:
        if not re.match(RESET_TOKEN_REGEX, reset_token):
            raise BadRequest(
                message=self._ta("RESET_TOKEN_FORMAT_INVALID", "重置令牌格式不正确"),
                error="RESET_TOKEN_INVALID",
            )

    async def request_email_change(self, *, user: User, new_email: str) -> tuple[str | None, int, str, int]:
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

        user_id = cast(UUID, user.id)
        store = self._require_email_change_store()
        existing = await store.get(user_id=user_id)
        if existing is not None:
            expires_in = store.remaining_expires_in(existing)
            issued_email = str(existing.get("new_email") or "").strip().lower()
            if expires_in > 0 and issued_email == new_email:
                retry_after = store.remaining_retry_after(existing)
                if retry_after > 0:
                    return None, expires_in, new_email, retry_after

        code, ttl, retry_after = await store.issue(user_id=user_id, new_email=new_email)
        return code, ttl, new_email, retry_after

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

    async def send_registration_verification_email(
        self,
        *,
        recipient: str,
        verification_token: str,
        expires_in: int,
        user_id: UUID | None = None,
        locale: str | None = None,
    ) -> None:
        await self.email_service.send_registration_verification(
            recipient=recipient,
            verification_token=verification_token,
            expires_in=expires_in,
            user_id=str(user_id) if user_id else None,
            locale=locale,
        )

    async def _has_linked_oauth_identities(self, *, user_id: UUID) -> bool:
        return await self.oauth_repo.has_identity_for_user(user_id=user_id)

    async def _require_mfa_action(
        self,
        *,
        user_id: UUID,
        action: SecurityAction,
        mfa_proof: str | None,
        session_id: str | None,
        token_version: int | None,
    ) -> bool:
        if session_id is None or token_version is None:
            if await self.action_verification.enabled_methods(user_id=user_id):
                raise Unauthorized(error="MFA_VERIFICATION_CONTEXT_REQUIRED")
            return False
        enabled = bool(await self.action_verification.enabled_methods(user_id=user_id))
        await self.action_verification.require(
            user_id=user_id,
            session_id=session_id,
            token_version=token_version,
            action=action,
            proof=mfa_proof,
        )
        return enabled

    async def confirm_email_change(
        self,
        *,
        user: User,
        new_email: str,
        code: str,
        mfa_proof: str | None = None,
        session_id: str | None = None,
        token_version: int | None = None,
    ) -> UserProfile:
        new_email = new_email.strip().lower()
        code = code.strip()

        user_with_cred = await self.user_repo.get_by_id_with_credential(cast(UUID, user.id))
        if user_with_cred is None:
            raise Unauthorized(message=self._ta("USER_NOT_FOUND", "用户不存在"), error="USER_NOT_FOUND")
        user_id = cast(UUID, user.id)
        await self._require_mfa_action(
            user_id=user_id,
            action="confirm_email_change",
            mfa_proof=mfa_proof,
            session_id=session_id,
            token_version=token_version,
        )

        store = self._require_email_change_store()
        record = await store.get(user_id=user_id)
        if not record:
            raise Unauthorized(message=self._ta("EMAIL_CODE_INVALID", "验证码无效或已过期"), error="EMAIL_CODE_INVALID")

        issued_email = str(record.get("new_email") or "").strip().lower()
        issued_code = str(record.get("code") or "").strip()

        if issued_email != new_email:
            raise BadRequest(message=self._ta("EMAIL_MISMATCH", "邮箱与验证码不匹配"), error="EMAIL_MISMATCH")
        if issued_code != code:
            tries = await store.bump_attempts(user_id=user_id)
            if tries >= 5:
                await store.delete(user_id=user_id)
            raise Unauthorized(message=self._ta("EMAIL_CODE_INVALID", "验证码无效或已过期"), error="EMAIL_CODE_INVALID")

        current_email = user_with_cred.email.strip().lower() if isinstance(user_with_cred.email, str) else None
        if current_email and new_email == current_email:
            await store.delete(user_id=user_id)
            raise BadRequest(message=self._ta("EMAIL_SAME", "新邮箱不能与当前邮箱相同"), error="EMAIL_SAME")

        if await self.user_repo.exists_email(new_email):
            await store.delete(user_id=user_id)
            raise Conflict(message=self._ta("EMAIL_EXISTS", "邮箱已被占用"), error="EMAIL_EXISTS")

        await self.user_repo.set_email(user_with_cred, new_email)
        await self.invalidate_user_sessions(user=user_with_cred)
        await store.delete(user_id=user_id)
        return self.build_user_profile(user_with_cred)

    def _reauth_required(self, *, methods: list[str]) -> Unauthorized:
        return Unauthorized(
            message=self._ta("REAUTH_REQUIRED", "需要重新验证"),
            error="REAUTH_REQUIRED",
            meta={"methods": methods},
        )

    def _reauth_by_recent_login_or_raise(self, *, user: UserLike) -> None:
        last_login_at = cast(datetime | None, getattr(user, "last_login_at", None))
        if last_login_at is None:
            raise self._reauth_required(methods=["relogin"])
        now = datetime.now(tz=UTC)
        age = (now - last_login_at.astimezone(UTC)).total_seconds()
        if age > float(REAUTH_MAX_AGE_SECONDS):
            raise self._reauth_required(methods=["relogin"])

    def _reauth_by_password_or_raise_if_present(self, *, user: UserLike, password: str | None) -> bool:
        credential = cast(CredentialLike | None, getattr(user, "credential", None))
        if credential is None:
            return False

        normalized = (password or "").strip()
        if not normalized:
            raise self._reauth_required(methods=["password"])
        if not verify_password(normalized, cast(str, credential.password_hash), self.settings.auth):
            raise Unauthorized(
                message=self._ta("INVALID_CREDENTIALS", "账号或密码错误"),
                error="INVALID_CREDENTIALS",
            )
        return True

    async def _reauth_by_two_factor_or_raise(self, *, user_id: UUID, code: str | None, backup_code: str | None) -> None:
        has_totp = bool(code and str(code).strip())
        has_backup = bool(backup_code and str(backup_code).strip())
        if has_totp == has_backup:
            raise self._reauth_required(methods=["2fa"])
        try:
            await self.two_factor.verify_for_login(user_id=user_id, code=code, backup_code=backup_code)
        except BadRequest as exc:
            raise Unauthorized(message=exc.message, error=exc.error) from exc

    @staticmethod
    def _required_reauth_methods(*, has_password: bool, two_factor_enabled: bool) -> list[str]:
        if has_password:
            return ["password"]
        if two_factor_enabled:
            return ["2fa"]
        return ["relogin"]

    async def invalidate_user_sessions(self, *, user: UserLike) -> None:
        await self.user_repo.increment_token_version(user)
        if self.refresh_store is not None:
            await self.refresh_store.revoke_all(self._coerce_user_id(user))

    async def get_my_security_capabilities(self, *, user_id: UUID) -> MySecurityCapabilityOut:
        user_with_cred = cast(User | None, await self.user_repo.get_by_id_with_credential(user_id))
        if user_with_cred is None:
            raise Unauthorized(message=self._ta("USER_NOT_FOUND", "用户不存在"), error="USER_NOT_FOUND")
        has_password = cast(CredentialLike | None, getattr(user_with_cred, "credential", None)) is not None
        two_factor_enabled = bool(await self.action_verification.enabled_methods(user_id=user_id))
        has_linked_oauth_identities = await self._has_linked_oauth_identities(user_id=user_id)
        return MySecurityCapabilityOut(
            has_password=has_password,
            two_factor_enabled=two_factor_enabled,
            has_linked_oauth_identities=has_linked_oauth_identities,
            set_password_required_reauth_methods=(
                []
                if has_password
                else self._required_reauth_methods(has_password=False, two_factor_enabled=two_factor_enabled)
            ),
            email_change_required_reauth_methods=self._required_reauth_methods(
                has_password=has_password,
                two_factor_enabled=two_factor_enabled,
            ),
        )

    async def request_remove_password(
        self,
        *,
        user_id: UUID,
        current_password: str,
        locale: str | None = None,
    ) -> tuple[int, int]:
        user = await self.user_repo.get_by_id_with_credential(user_id)
        credential = cast(CredentialLike | None, getattr(user, "credential", None) if user is not None else None)
        if user is None or credential is None:
            raise Unauthorized(message=self._ta("UNAUTHORIZED", "未授权"), error="UNAUTHORIZED")
        if not self.user_repo.is_active(user):
            raise Forbidden(message=self._ta("USER_DISABLED", "账号不可用"), error="USER_DISABLED")
        if not await self.email_service.is_enabled():
            raise BadRequest(
                message=self._ta("MAIL_DISABLED", "系统未开启邮件服务，请联系管理员"),
                error="MAIL_DISABLED",
            )

        email = str(getattr(user, "email", "") or "").strip().lower()
        if not email:
            raise BadRequest(message=self._ta("EMAIL_REQUIRED", "当前账号未绑定邮箱"), error="EMAIL_REQUIRED")
        if not verify_password(current_password, cast(str, credential.password_hash), self.settings.auth):
            raise Unauthorized(
                message=self._ta("INVALID_CREDENTIALS", "原密码错误"),
                error="INVALID_CREDENTIALS",
            )

        store = self._require_password_removal_store()
        existing = await store.get(user_id=user_id)
        if existing is not None:
            expires_in = store.remaining_expires_in(existing)
            if expires_in > 0:
                retry_after = store.remaining_retry_after(existing)
                if retry_after > 0:
                    return expires_in, retry_after

        code, expires_in, retry_after = await store.issue(user_id=user_id, email=email)
        try:
            await self.email_service.send_login_code(
                recipient=email,
                code=code,
                expires_in=expires_in,
                user_id=str(user_id),
                locale=locale,
            )
        except BaseException:
            await store.delete(user_id=user_id)
            raise

        return expires_in, retry_after

    async def confirm_remove_password(
        self,
        *,
        user_id: UUID,
        code: str,
        mfa_proof: str | None = None,
        session_id: str | None = None,
        token_version: int | None = None,
    ) -> None:
        await self._require_mfa_action(
            user_id=user_id,
            action="confirm_remove_password",
            mfa_proof=mfa_proof,
            session_id=session_id,
            token_version=token_version,
        )
        user = await self.user_repo.get_by_id_with_credential(user_id)
        credential = cast(CredentialLike | None, getattr(user, "credential", None) if user is not None else None)
        if user is None or credential is None:
            raise Unauthorized(message=self._ta("UNAUTHORIZED", "未授权"), error="UNAUTHORIZED")
        if not self.user_repo.is_active(user):
            raise Forbidden(message=self._ta("USER_DISABLED", "账号不可用"), error="USER_DISABLED")

        store = self._require_password_removal_store()
        record = await store.get(user_id=user_id)
        if not record:
            raise Unauthorized(message=self._ta("EMAIL_CODE_INVALID", "验证码无效或已过期"), error="EMAIL_CODE_INVALID")

        issued_code = str(record.get("code") or "").strip()
        normalized_code = code.strip()
        if issued_code != normalized_code:
            tries = await store.bump_attempts(user_id=user_id)
            if tries >= store.max_attempts:
                await store.delete(user_id=user_id)
            raise Unauthorized(message=self._ta("EMAIL_CODE_INVALID", "验证码无效或已过期"), error="EMAIL_CODE_INVALID")

        if isinstance(self.user_repo, UserRepository):
            async with self.tx() as conn:
                await self.user_repo.remove_password_in_connection(user, conn=conn)
                await self.user_repo.increment_token_version_in_connection(user, conn=conn)
                await self._write_password_activity_event(
                    user_id=user_id,
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    change_kind="remove",
                    conn=conn,
                )
        else:
            await self.user_repo.remove_password(user)
            await self.user_repo.increment_token_version(user)
            await self._write_password_activity_event(
                user_id=user_id,
                actor_user_id=user_id,
                subject_user_id=user_id,
                change_kind="remove",
            )
        if self.refresh_store is not None:
            await self.refresh_store.revoke_all(self._coerce_user_id(user))
        await store.delete(user_id=user_id)

    async def set_password_for_current_user(
        self,
        *,
        user_id: UUID,
        new_password: str,
        mfa_proof: str | None = None,
        session_id: str | None = None,
        token_version: int | None = None,
    ) -> None:
        user_with_cred = cast(User | None, await self.user_repo.get_by_id_with_credential(user_id))
        if user_with_cred is None:
            raise Unauthorized(message=self._ta("USER_NOT_FOUND", "用户不存在"), error="USER_NOT_FOUND")
        if not self.user_repo.is_active(user_with_cred):
            raise Forbidden(message=self._ta("USER_DISABLED", "账号不可用"), error="USER_DISABLED")
        if cast(CredentialLike | None, getattr(user_with_cred, "credential", None)) is not None:
            raise Conflict(message=self._ta("PASSWORD_ALREADY_SET", "当前账号已设置密码"), error="PASSWORD_ALREADY_SET")

        mfa_enabled = await self._require_mfa_action(
            user_id=user_id,
            action="set_password",
            mfa_proof=mfa_proof,
            session_id=session_id,
            token_version=token_version,
        )

        self._ensure_password_strength(new_password)
        if not mfa_enabled:
            self._reauth_by_recent_login_or_raise(user=user_with_cred)

        if isinstance(self.user_repo, UserRepository):
            async with self.tx() as conn:
                await self.user_repo.set_password_in_connection(
                    user_with_cred,
                    password_hash=hash_password(new_password, self.settings.auth),
                    conn=conn,
                )
                await self.user_repo.increment_token_version_in_connection(user_with_cred, conn=conn)
                await self._write_password_activity_event(
                    user_id=user_id,
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    change_kind="set",
                    conn=conn,
                )
        else:
            await self.user_repo.set_password(user_with_cred, hash_password(new_password, self.settings.auth))
            await self.user_repo.increment_token_version(user_with_cred)
            await self._write_password_activity_event(
                user_id=user_id,
                actor_user_id=user_id,
                subject_user_id=user_id,
                change_kind="set",
            )
        if self.refresh_store is not None:
            await self.refresh_store.revoke_all(self._coerce_user_id(user_with_cred))

    async def delete_my_account(
        self,
        *,
        user: UserLike,
        email: str,
        password: str | None,
        mfa_proof: str | None = None,
        session_id: str | None = None,
        token_version: int | None = None,
    ) -> None:
        """
        Delete/anonymize the current account.

        For safety, we anonymize instead of hard-deleting to avoid breaking foreign-key-less references
        (many tables store `*_user_id` as raw UUID fields).
        """

        user_with_cred = cast(User | None, await self.user_repo.get_by_id_with_credential(cast(UUID, user.id)))
        if user_with_cred is None:
            raise Unauthorized(message=self._ta("USER_NOT_FOUND", "用户不存在"), error="USER_NOT_FOUND")

        if not user_with_cred.email:
            raise BadRequest(message=self._ta("EMAIL_REQUIRED", "当前账号未绑定邮箱"), error="EMAIL_REQUIRED")

        normalized_email = email.strip().lower()
        if normalized_email != user_with_cred.email.strip().lower():
            raise BadRequest(message=self._ta("EMAIL_MISMATCH", "邮箱与当前账号不匹配"), error="EMAIL_MISMATCH")

        user_id = cast(UUID, user.id)
        mfa_enabled = await self._require_mfa_action(
            user_id=user_id,
            action="delete_my_account",
            mfa_proof=mfa_proof,
            session_id=session_id,
            token_version=token_version,
        )

        # Password users still confirm their password. SSO-only users either completed the
        # action-bound MFA proof above or must have a recent login when MFA is disabled.
        authed_by_password = self._reauth_by_password_or_raise_if_present(user=user_with_cred, password=password)
        if not authed_by_password and not mfa_enabled:
            self._reauth_by_recent_login_or_raise(user=user_with_cred)

        # Guard: prevent deleting the last owner in any org/workspace.
        from src.modules.auth.account_deletion.guard import AccountDeletionGuard

        await AccountDeletionGuard().ensure_deletable(user_id=user_id)

        if isinstance(self.user_repo, UserRepository):
            from src.models.auth.user_two_factor import UserTwoFactor, UserTwoFactorBackupCode
            from src.models.auth.user_webauthn import UserWebAuthnChallenge, UserWebAuthnCredential
            from src.models.organization.org_membership import OrgMembership
            from src.models.organization.user import UserCredential
            from src.models.workspaces.workspace import WorkspaceMembership, WorkspaceMembershipStatus

            async with self.tx() as conn:
                await self.user_repo.increment_token_version_in_connection(user_with_cred, conn=conn)
                await self.oauth_repo.delete_identities_for_user(user_id=user_id, conn=conn)
                await UserTwoFactorBackupCode.filter(user_id=user_id).using_db(conn).delete()
                await UserTwoFactor.filter(user_id=user_id).using_db(conn).delete()
                await UserWebAuthnChallenge.filter(user_id=user_id).using_db(conn).delete()
                await UserWebAuthnCredential.filter(user_id=user_id).using_db(conn).delete()
                await self._write_auth_activity_event(
                    name="auth.account.deleted",
                    user_id=user_id,
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    entity_type="auth_account",
                    entity_id=user_id,
                    properties={"change_kind": "delete"},
                    conn=conn,
                )
                # Revoke grants before bulk membership disable (Tortoise signals do not fire for .update()).
                from src.llm.keys import revoke_user_grants_for_workspace

                active_memberships = (
                    await WorkspaceMembership
                    .filter(user_id=user_id, status=WorkspaceMembershipStatus.ACTIVE)
                    .using_db(conn)
                    .all()
                )
                for m in active_memberships:
                    await revoke_user_grants_for_workspace(
                        user_id=user_id,
                        workspace_id=m.workspace_id,
                        using_db=conn,
                    )

                await (
                    WorkspaceMembership
                    .filter(user_id=user_id)
                    .using_db(conn)
                    .update(status=WorkspaceMembershipStatus.DISABLED)
                )
                await OrgMembership.filter(user_id=user_id).using_db(conn).delete()
                await UserCredential.filter(user_id=user_id).using_db(conn).delete()
                await self.user_repo.anonymize_user_in_connection(user_with_cred, conn=conn)
        else:
            await self.user_repo.increment_token_version(user)
            await self.oauth_repo.delete_identities_for_user(user_id=user_id)
            await cast(UserRepository, self.user_repo).anonymize_user(user_with_cred)
            await self._write_auth_activity_event(
                name="auth.account.deleted",
                user_id=user_id,
                actor_user_id=user_id,
                subject_user_id=user_id,
                entity_type="auth_account",
                entity_id=user_id,
                properties={"change_kind": "delete"},
            )

        if self.refresh_store is not None:
            await self.refresh_store.revoke_all(user_id)

    async def _handle_refresh_reuse(self, user_id: UUID) -> None:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            return
        await self.user_repo.increment_token_version(user)
        store = self._require_refresh_store()
        await store.revoke_all(self._coerce_user_id(user))
        self.logger.warning("Refresh token reuse detected", user_id=str(user_id))

    async def login(
        self,
        *,
        identifier: str,
        password: str,
        request_context: AuthRequestContext | None = None,
    ) -> TokenPair:
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

        if not verify_password(password, cast(str, credential.password_hash), self.settings.auth):
            raise Unauthorized(
                message=self._ta("INVALID_CREDENTIALS", "账号或密码错误"),
                error="INVALID_CREDENTIALS",
            )

        user_id = self._coerce_user_id(user)
        token_version = self._coerce_token_version(user)
        session_id = uuid7().hex

        access_token, access_ttl = build_access_token(
            user_id=user_id,
            token_version=token_version,
            session_id=session_id,
            settings=self.settings.auth,
        )
        refresh_token, jti, refresh_ttl = build_refresh_token(
            user_id=user_id,
            token_version=token_version,
            session_id=session_id,
            settings=self.settings.auth,
        )

        now_ts = int(datetime.now(UTC).timestamp())
        record = self._build_refresh_record(
            jti=jti,
            user_id=user_id,
            token_version=token_version,
            session_id=session_id,
            now_ts=now_ts,
            refresh_ttl=refresh_ttl,
            request_context=request_context,
            auth_method="password",
        )
        await store.store(record, ttl=refresh_ttl)
        try:
            await self._record_login_activity(user=user, user_id=user_id, auth_method="password")
        except BaseException:
            await store.forget(jti)
            raise

        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=access_ttl,
            refresh_expires_in=refresh_ttl,
        )

    async def issue_token_pair_for_user(
        self,
        user_id: UUID,
        *,
        request_context: AuthRequestContext | None = None,
        auth_method: str = "password",
    ) -> TokenPair:
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
        session_id = uuid7().hex

        access_token, access_ttl = build_access_token(
            user_id=resolved_user_id,
            token_version=token_version,
            session_id=session_id,
            settings=self.settings.auth,
        )
        refresh_token, jti, refresh_ttl = build_refresh_token(
            user_id=resolved_user_id,
            token_version=token_version,
            session_id=session_id,
            settings=self.settings.auth,
        )

        now_ts = int(datetime.now(UTC).timestamp())
        record = self._build_refresh_record(
            jti=jti,
            user_id=resolved_user_id,
            token_version=token_version,
            session_id=session_id,
            now_ts=now_ts,
            refresh_ttl=refresh_ttl,
            request_context=request_context,
            auth_method=auth_method,
        )
        await store.store(record, ttl=refresh_ttl)
        try:
            await self._record_login_activity(user=user, user_id=resolved_user_id, auth_method=auth_method)
        except BaseException:
            await store.forget(jti)
            raise

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
        user = await self.user_repo.create_user(
            username=username,
            email=email,
            display_name=display_name,
            password_hash=password_hash,
            email_verified_at=datetime.now(UTC) if email else None,
        )
        user_id = UUID(str(user.id))
        await self.onboarding_service.ensure_initialized(user_id=user_id)
        return user

    async def email_exists(self, *, email: str) -> bool:
        return await self.user_repo.exists_email(self._normalize_email(email))

    async def get_email_check(self, *, email: str) -> tuple[bool, bool]:
        user = await self.user_repo.get_by_email(self._normalize_email(email))
        if user is None:
            return False, False
        credential = cast(CredentialLike | None, getattr(user, "credential", None))
        return True, credential is not None

    async def username_exists(self, *, username: str) -> bool:
        return await self.user_repo.exists_username(username.strip().lower())

    async def generate_unique_username(self, *, email: str | None = None) -> str:
        base = _sanitize_generated_username_base(email)
        if len(base) >= 3 and not await self.user_repo.exists_username(base):
            return base

        suffix_length = 7
        prefix = base[: max(1, _GENERATED_USERNAME_MAX_LENGTH - suffix_length)].strip("-") or "user"
        for _ in range(10):
            username = f"{prefix}-{uuid7().hex[:6]}"
            if not await self.user_repo.exists_username(username):
                return username

        return f"user-{uuid7().hex[:12]}"

    async def refresh(
        self,
        *,
        refresh_token: str,
        request_context: AuthRequestContext | None = None,
    ) -> TokenPair:
        store = self._require_refresh_store()
        payload = decode_token(refresh_token, self.settings.auth)
        if payload.get("typ") != TOKEN_TYPE_REFRESH:
            raise Unauthorized(
                message=self._ta("REFRESH_INVALID", "Refresh Token 无效"),
                error="REFRESH_INVALID",
            )

        user_id = self._parse_user_id(payload.get("sub"))
        token_version = self._parse_refresh_token_version(payload.get("ver"))
        jti = self._parse_refresh_jti(payload.get("jti"))
        token_sid = self._parse_session_id(payload.get("sid"))

        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise Unauthorized(message=self._ta("USER_NOT_FOUND", "用户不存在"), error="USER_NOT_FOUND")

        if not self.user_repo.is_active(user):
            raise Forbidden(message=self._ta("USER_DISABLED", "账号不可用"), error="USER_DISABLED")

        if self._coerce_token_version(user) != token_version:
            raise Unauthorized(message=self._ta("TOKEN_STALE", "Token 已失效"), error="TOKEN_STALE")

        record_raw = await store.get(jti)
        if record_raw is None:
            raise Unauthorized(
                message=self._ta("REFRESH_NOT_FOUND", "Refresh Token 已失效"),
                error="REFRESH_NOT_FOUND",
            )
        if not isinstance(record_raw, dict):
            raise Unauthorized(
                message=self._ta("REFRESH_INVALID", "Refresh Token 无效"),
                error="REFRESH_INVALID",
            )
        record = cast(dict[str, object], record_raw)

        status = record.get("status")
        if status != REFRESH_STATUS_ACTIVE:
            if status == REFRESH_STATUS_REVOKED:
                raise Unauthorized(
                    message=self._ta("REFRESH_REVOKED", "Refresh Token 已被撤销"),
                    error="REFRESH_REVOKED",
                )
            if status == REFRESH_STATUS_ROTATED:
                await self._handle_refresh_reuse(user_id)
                raise Unauthorized(
                    message=self._ta("TOKEN_REUSED", "Refresh Token 已被使用"),
                    error="TOKEN_REUSED",
                )
            raise Unauthorized(
                message=self._ta("REFRESH_INVALID", "Refresh Token 无效"),
                error="REFRESH_INVALID",
            )

        if record.get("user_id") != str(user_id) or record.get("token_version") != token_version:
            await self._handle_refresh_reuse(user_id)
            raise Unauthorized(
                message=self._ta("TOKEN_REUSED", "Refresh Token 异常"),
                error="TOKEN_REUSED",
            )

        now_ts = int(datetime.now(UTC).timestamp())
        record["last_used_at"] = now_ts
        await store.update(jti, record)

        resolved_user_id = self._coerce_user_id(user)
        resolved_token_version = self._coerce_token_version(user)
        record_sid = self._parse_session_id(record.get("sid"))
        session_id = token_sid or record_sid or uuid7().hex
        access_token, access_ttl = build_access_token(
            user_id=resolved_user_id,
            token_version=resolved_token_version,
            session_id=session_id,
            settings=self.settings.auth,
        )
        new_refresh_token, new_jti, refresh_ttl = build_refresh_token(
            user_id=resolved_user_id,
            token_version=resolved_token_version,
            session_id=session_id,
            settings=self.settings.auth,
        )

        await store.mark_rotated(jti, replaced_by=new_jti)
        effective_context = request_context
        if effective_context is None:
            raw_ip_address = record.get("ip_address")
            raw_user_agent = record.get("user_agent")
            effective_context = AuthRequestContext(
                ip_address=(raw_ip_address if isinstance(raw_ip_address, str) else None),
                user_agent=(raw_user_agent if isinstance(raw_user_agent, str) else None),
            )
        raw_auth_method = record.get("auth_method")
        auth_method = (raw_auth_method.strip() or "password") if isinstance(raw_auth_method, str) else "password"
        new_record = self._build_refresh_record(
            jti=new_jti,
            user_id=resolved_user_id,
            token_version=resolved_token_version,
            session_id=session_id,
            now_ts=now_ts,
            refresh_ttl=refresh_ttl,
            request_context=effective_context,
            auth_method=auth_method,
            parent=jti,
        )
        await store.store(new_record, ttl=refresh_ttl)

        return TokenPair(
            access_token=access_token,
            refresh_token=new_refresh_token,
            expires_in=access_ttl,
            refresh_expires_in=refresh_ttl,
        )

    async def logout(self, *, user_id: UUID, refresh_token: str | None) -> None:
        """
        Logout current session by revoking the provided refresh token.

        Notes:
        - This endpoint is intentionally scoped to the *current session*.
        - Use `logout_all()` to revoke all sessions/devices.
        """

        store = self._require_refresh_store()
        if not refresh_token:
            raise BadRequest(message=self._ta("REFRESH_REQUIRED", "需要 Refresh Token"), error="REFRESH_REQUIRED")

        payload = decode_token(refresh_token, self.settings.auth)
        if payload.get("typ") != TOKEN_TYPE_REFRESH:
            raise Unauthorized(
                message=self._ta("REFRESH_INVALID", "Refresh Token 无效"),
                error="REFRESH_INVALID",
            )

        token_user_id = self._parse_user_id(payload.get("sub"))
        if token_user_id != user_id:
            raise Forbidden(
                message=self._ta("REFRESH_USER_MISMATCH", "Refresh Token 异常"), error="REFRESH_USER_MISMATCH"
            )

        jti = self._parse_refresh_jti(payload.get("jti"))
        previous_record = await store.get(jti)
        await store.revoke(jti)
        if previous_record is None:
            return
        try:
            await self._write_auth_activity_event(
                name="auth.session.revoked",
                user_id=user_id,
                actor_user_id=user_id,
                subject_user_id=user_id,
                entity_type="auth_session",
                properties={"session_id": str(previous_record.get("sid") or jti), "scope": "current"},
            )
        except BaseException:
            await store.restore_active(jti, previous_record=previous_record)
            raise

    async def logout_all(self, *, user_id: UUID) -> None:
        store = self._require_refresh_store()
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise Unauthorized(message=self._ta("USER_NOT_FOUND", "用户不存在"), error="USER_NOT_FOUND")

        active_session_count = len(await store.list_active(self._coerce_user_id(user)))
        if isinstance(self.user_repo, UserRepository):
            async with self.tx() as conn:
                await self.user_repo.increment_token_version_in_connection(user, conn=conn)
                await self._write_auth_activity_event(
                    name="auth.session.revoked",
                    user_id=user_id,
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    entity_type="auth_session",
                    properties={"scope": "all", "revoked_count": active_session_count},
                    conn=conn,
                )
        else:
            await self.user_repo.increment_token_version(user)
            await self._write_auth_activity_event(
                name="auth.session.revoked",
                user_id=user_id,
                actor_user_id=user_id,
                subject_user_id=user_id,
                entity_type="auth_session",
                properties={"scope": "all", "revoked_count": active_session_count},
            )
        await store.revoke_all(self._coerce_user_id(user))

    async def change_password(
        self,
        *,
        user_id: UUID,
        old_password: str,
        new_password: str,
        mfa_proof: str | None = None,
        session_id: str | None = None,
        token_version: int | None = None,
    ) -> None:
        await self._require_mfa_action(
            user_id=user_id,
            action="change_password",
            mfa_proof=mfa_proof,
            session_id=session_id,
            token_version=token_version,
        )
        user = await self.user_repo.get_by_id_with_credential(user_id)
        credential = cast(CredentialLike | None, getattr(user, "credential", None) if user is not None else None)
        if user is None or credential is None:
            raise Unauthorized(message=self._ta("UNAUTHORIZED", "未授权"), error="UNAUTHORIZED")

        if not self.user_repo.is_active(user):
            raise Forbidden(message=self._ta("USER_DISABLED", "账号不可用"), error="USER_DISABLED")

        if not verify_password(old_password, cast(str, credential.password_hash), self.settings.auth):
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

        if isinstance(self.user_repo, UserRepository):
            async with self.tx() as conn:
                await self.user_repo.set_password_in_connection(
                    user,
                    password_hash=hash_password(new_password, self.settings.auth),
                    conn=conn,
                )
                await self.user_repo.increment_token_version_in_connection(user, conn=conn)
                await self._write_password_activity_event(
                    user_id=user_id,
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    change_kind="change",
                    conn=conn,
                )
        else:
            await self.user_repo.set_password(user, hash_password(new_password, self.settings.auth))
            await self.user_repo.increment_token_version(user)
            await self._write_password_activity_event(
                user_id=user_id,
                actor_user_id=user_id,
                subject_user_id=user_id,
                change_kind="change",
            )
        if self.refresh_store is not None:
            await self.refresh_store.revoke_all(self._coerce_user_id(user))
        await self.send_security_alert(user_id=user_id, event_key="password_changed")

    async def forgot_password(self, *, email: str) -> tuple[str, int, str, UUID] | None:
        store = self._require_reset_store()
        user = await self.user_repo.get_by_email(self._normalize_email(email))
        if not user or not self.user_repo.is_active(user):
            return None
        email_raw = getattr(user, "email", None)
        email = str(email_raw).strip() if email_raw else ""
        if not email:
            return None
        user_id = self._coerce_user_id(user)
        token, ttl = await store.issue(user_id)

        await self._write_auth_activity_event(
            name="auth.password.reset.requested",
            user_id=user_id,
            subject_user_id=user_id,
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

    async def send_security_alert(
        self,
        *,
        user_id: UUID,
        event_key: str,
        request_context: AuthRequestContext | None = None,
        locale: str | None = None,
    ) -> None:
        user = await self.user_repo.get_by_id(user_id)
        recipient = str(getattr(user, "email", "") or "").strip() if user is not None else ""
        if not recipient:
            return
        try:
            await self.email_service.send_security_alert(
                recipient=recipient,
                title=t(
                    "auth",
                    "SECURITY_ALERT_EMAIL_TITLE",
                    default="Security activity on your account",
                    locale=locale,
                ),
                intro=t(
                    "auth",
                    "SECURITY_ALERT_EMAIL_INTRO",
                    default="We detected a security-sensitive action on your Arclayer account.",
                    locale=locale,
                ),
                event_label=self._security_alert_event_label(event_key),
                user_id=str(user_id),
                ip_address=None if request_context is None else request_context.ip_address,
                user_agent=None if request_context is None else request_context.user_agent,
                occurred_at=datetime.now(UTC),
                locale=locale,
            )
        except BaseException as exc:
            _raise_if_fatal(exc)
            self.logger.warning(
                "Security alert email send failed",
                user_id=str(user_id),
                event_key=event_key,
                error=str(exc),
            )

    @staticmethod
    def _security_alert_event_label(event_key: str) -> str:
        labels = {
            "password_login": "Password login",
            "email_code": "Email code login",
            "sso": "Single sign-on login",
            "password_changed": "Password changed",
            "password_reset": "Password reset",
        }
        return labels.get(event_key, event_key.replace("_", " ").strip().title() or "Security event")

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
        try:
            async with self.tx() as conn:
                # We need credential loaded to compare password hashes. Without prefetch,
                # `user.credential` is a lazy relation and will break attribute access.
                user = await self.user_repo.get_by_id_with_credential_in_connection(user_id, conn=conn)
                if not user:
                    raise Unauthorized(message=self._ta("USER_NOT_FOUND", "用户不存在"), error="USER_NOT_FOUND")

                if not self.user_repo.is_active(user):
                    raise Forbidden(message=self._ta("USER_DISABLED", "账号不可用"), error="USER_DISABLED")

                credential = cast(CredentialLike | None, getattr(user, "credential", None))
                if credential is not None and verify_password(
                    new_password, cast(str, credential.password_hash), self.settings.auth
                ):
                    raise Conflict(
                        message=self._ta("PASSWORD_DUPLICATE", "新密码不能与旧密码相同"),
                        error="PASSWORD_DUPLICATE",
                    )
                self._ensure_password_strength(new_password)

                await self.user_repo.set_password_in_connection(
                    user,
                    password_hash=hash_password(new_password, self.settings.auth),
                    conn=conn,
                )
                await self.user_repo.increment_token_version_in_connection(user, conn=conn)
                await self._write_auth_activity_event(
                    name="auth.password.reset.completed",
                    user_id=user_id,
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    conn=conn,
                )
        except BaseException:
            await store.restore(reset_token, previous_record=record)
            raise
        if self.refresh_store is not None:
            await self.refresh_store.revoke_all(self._coerce_user_id(user))
        await self.send_security_alert(user_id=user_id, event_key="password_reset")

    @staticmethod
    def build_user_profile(user: UserLike) -> UserProfile:
        avatar_asset_id = getattr(user, "avatar_asset_id", None)
        avatar_asset_uuid = UUID(str(avatar_asset_id)) if avatar_asset_id is not None else None
        avatar_url = cast(str | None, user.avatar_url)
        if avatar_asset_uuid is not None:
            from src.common.utils.public_ids import encode_uuid

            avatar_url = f"/assets/{encode_uuid(avatar_asset_uuid)}"
        return UserProfile(
            id=UUID(str(user.id)),
            username=cast(str, user.username),
            email=cast(str | None, user.email),
            display_name=cast(str | None, user.display_name),
            avatar_url=avatar_url,
            avatar_asset_id=avatar_asset_uuid,
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
        should_update_avatar = "avatar_asset_id" in model_fields_set

        if not (should_update_display_name or should_update_avatar):
            return self.build_user_profile(user)

        patch_kwargs: dict[str, object] = {}
        avatar_asset_aligned = False
        if should_update_display_name:
            patch_kwargs["display_name"] = payload.display_name

        if should_update_avatar:
            next_avatar_asset_id = payload.avatar_asset_id
            if next_avatar_asset_id is None:
                patch_kwargs["avatar_asset_id"] = None
                patch_kwargs["avatar_url"] = None
            else:
                from src.common.constants.assets import ASSET_SCOPE_USER
                from src.models.assets.asset import AssetPurpose, AssetRecord
                from src.modules.assets.admin.assets.binding_align import align_asset_for_binding
                from src.modules.assets.scope import AssetScope, scope_filter_kwargs

                scope = AssetScope(type=ASSET_SCOPE_USER, id=user.id)
                asset = await AssetRecord.get_or_none(
                    id=UUID(str(next_avatar_asset_id)),
                    deleted_at=None,
                    **scope_filter_kwargs(scope),
                )
                if asset is None:
                    raise NotFound(message=t("errors", "ASSET_NOT_FOUND"), error="ASSET_NOT_FOUND")
                avatar_asset_aligned = await align_asset_for_binding(
                    self.settings,
                    scope=scope,
                    asset_id=UUID(str(asset.id)),
                    purpose=AssetPurpose.AVATAR,
                )

                from src.common.utils.public_ids import encode_uuid

                patch_kwargs["avatar_asset_id"] = asset.id
                patch_kwargs["avatar_url"] = f"/assets/{encode_uuid(UUID(str(asset.id)))}"

        updated = await self.user_repo.patch_profile(user, **patch_kwargs)
        profile = self.build_user_profile(updated)
        return profile.model_copy(update={"avatar_asset_aligned": avatar_asset_aligned})

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
        password: str,
        email: str | None = None,
        display_name: str | None = None,
    ) -> RegisterResult:
        from src.modules.auth.registration.service import get_public_register_policy

        policy = await get_public_register_policy(self.settings)
        if not policy.enabled:
            # Hide the endpoint by default to enforce invitation-only onboarding.
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

        normalized_email = (email or "").strip().lower() or None
        if policy.require_email and not normalized_email:
            raise BadRequest(message=self._ta("EMAIL_REQUIRED", "邮箱必填"), error="EMAIL_REQUIRED")
        if policy.require_email_verification:
            if not normalized_email:
                raise BadRequest(message=self._ta("EMAIL_REQUIRED", "邮箱必填"), error="EMAIL_REQUIRED")
            if not await self.email_service.is_enabled():
                raise BadRequest(
                    message=self._ta("MAIL_DISABLED", "系统未开启邮件服务，请联系管理员"),
                    error="MAIL_DISABLED",
                )
            self._require_registration_email_verification_store()
        if normalized_email and not policy.is_email_allowed(normalized_email):
            raise Forbidden(
                message=self._ta("REGISTER_DOMAIN_NOT_ALLOWED", "该邮箱域名不允许注册"),
                error="REGISTER_DOMAIN_NOT_ALLOWED",
            )
        username = await self.generate_unique_username(email=normalized_email)
        user = await self.register(
            username=username,
            password=password,
            email=normalized_email,
            display_name=display_name,
        )
        profile = self.build_user_profile(user)
        if not policy.require_email_verification:
            return RegisterResult(user=profile, requires_email_verification=False)

        user_id = UUID(str(user.id))
        store = self._require_registration_email_verification_store()
        await self.user_repo.set_email_verified_at(user, None)
        token, ttl, retry_after = await store.issue(user_id=user_id, email=cast(str, normalized_email))
        try:
            await self.send_registration_verification_email(
                recipient=cast(str, normalized_email),
                verification_token=token,
                expires_in=ttl,
                user_id=user_id,
            )
        except BaseException:
            await store.delete_by_email(email=cast(str, normalized_email))
            await self.user_repo.delete_user(user)
            raise

        return RegisterResult(
            user=profile,
            requires_email_verification=True,
            expires_in=ttl,
            retry_after=retry_after,
        )

    async def resend_registration_email_verification(
        self,
        *,
        email: str,
        locale: str | None = None,
    ) -> RegisterResult:
        from src.modules.auth.registration.service import get_public_register_policy

        policy = await get_public_register_policy(self.settings)
        if not policy.enabled:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
        if not policy.require_email_verification:
            raise BadRequest(
                message=self._ta("EMAIL_VERIFICATION_NOT_REQUIRED", "当前不需要邮箱验证"),
                error="EMAIL_VERIFICATION_NOT_REQUIRED",
            )
        if not await self.email_service.is_enabled():
            raise BadRequest(
                message=self._ta("MAIL_DISABLED", "系统未开启邮件服务，请联系管理员"),
                error="MAIL_DISABLED",
            )

        normalized_email = self._normalize_email(email)
        user = await self.user_repo.get_by_email(normalized_email)
        if user is None:
            raise Unauthorized(message=self._ta("USER_NOT_FOUND", "用户不存在"), error="USER_NOT_FOUND")
        if getattr(user, "email_verified_at", None) is not None:
            return RegisterResult(user=self.build_user_profile(user), requires_email_verification=False)

        store = self._require_registration_email_verification_store()
        existing = await store.get_by_email(email=normalized_email)
        if existing is not None:
            expires_in = store.remaining_expires_in(existing)
            retry_after = store.remaining_retry_after(existing)
            if expires_in > 0 and retry_after > 0:
                return RegisterResult(
                    user=self.build_user_profile(user),
                    requires_email_verification=True,
                    expires_in=expires_in,
                    retry_after=retry_after,
                )

        await store.delete_by_email(email=normalized_email)
        user_id = UUID(str(user.id))
        token, ttl, retry_after = await store.issue(user_id=user_id, email=normalized_email)
        try:
            await self.send_registration_verification_email(
                recipient=normalized_email,
                verification_token=token,
                expires_in=ttl,
                user_id=user_id,
                locale=locale,
            )
        except BaseException:
            await store.delete_by_email(email=normalized_email)
            raise

        return RegisterResult(
            user=self.build_user_profile(user),
            requires_email_verification=True,
            expires_in=ttl,
            retry_after=retry_after,
        )

    async def confirm_registration_email_verification(self, *, token: str) -> RegisterEmailVerificationOut:
        store = self._require_registration_email_verification_store()
        normalized_token = token.strip()
        record = await store.get_by_token(token=normalized_token)
        if record is None or store.remaining_expires_in(record) <= 0:
            if record is not None:
                await store.delete_record(record)
            raise Unauthorized(
                message=self._ta("EMAIL_VERIFICATION_TOKEN_INVALID", "邮箱验证链接无效或已过期"),
                error="EMAIL_VERIFICATION_TOKEN_INVALID",
            )

        email = str(record.get("email") or "").strip().lower()
        user_id_raw = str(record.get("user_id") or "").strip()
        if not email or not user_id_raw:
            await store.delete_record(record)
            raise Unauthorized(
                message=self._ta("EMAIL_VERIFICATION_TOKEN_INVALID", "邮箱验证链接无效或已过期"),
                error="EMAIL_VERIFICATION_TOKEN_INVALID",
            )

        user = await self.user_repo.get_by_id(UUID(user_id_raw))
        if user is None:
            await store.delete_record(record)
            raise Unauthorized(message=self._ta("USER_NOT_FOUND", "用户不存在"), error="USER_NOT_FOUND")
        current_email = str(getattr(user, "email", "") or "").strip().lower()
        if current_email != email:
            await store.delete_record(record)
            raise BadRequest(message=self._ta("EMAIL_MISMATCH", "邮箱与验证码不匹配"), error="EMAIL_MISMATCH")

        if getattr(user, "email_verified_at", None) is None:
            await self.user_repo.mark_email_verified(user)
        await store.delete_record(record)
        return RegisterEmailVerificationOut(email=email)

    async def request_password_reset(
        self,
        *,
        email: str,
    ) -> tuple[ResetTokenPayload | None, tuple[str, int, str, UUID] | None]:
        # Password reset is a critical flow: without email, the user can't complete the loop.
        # To avoid "fake success" and confusion, fail fast when email sending is disabled.
        if not await self.email_service.is_enabled():
            raise BadRequest(
                message=self._ta("MAIL_DISABLED", "系统未开启邮件服务，请联系管理员"),
                error="MAIL_DISABLED",
            )

        issued = await self.forgot_password(email=email)
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
            issue_tokens=lambda **kwargs: self.login(**kwargs),
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
