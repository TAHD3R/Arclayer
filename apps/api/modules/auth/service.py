from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from tortoise.expressions import Q
from tortoise.transactions import in_transaction

from apps.api.common.email.service import EmailService
from apps.api.common.protocols.tortoise import HasOrganizationId, HasWorkspaceId
from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, Conflict, Forbidden, NotFound, ServiceUnavailable, Unauthorized
from apps.api.core.http.pagination import PageData, PageParams
from apps.api.core.i18n import get_current_locale, t
from apps.api.infra.cache.valkey import ValkeyClientLike
from apps.api.modules.auth.constants import PASSWORD_REGEX, REFRESH_STATUS_ACTIVE, RESET_TOKEN_REGEX
from apps.api.modules.auth.contracts import CredentialLike, UserLike, UserRepositoryLike
from apps.api.modules.auth.repository import PasswordResetStore, RefreshTokenStore, UserRepository
from apps.api.modules.auth.schema import (
    AcceptExistingInvitationRequest,
    AcceptExistingInvitationResult,
    AcceptInvitationRequest,
    InvitationPreviewInvitationOut,
    InvitationPreviewInviterOut,
    InvitationPreviewOrganizationOut,
    InvitationPreviewResult,
    InvitationPreviewRoleOut,
    InvitationPreviewWorkspaceOut,
    MyInvitationInviterOut,
    MyInvitationListQuery,
    MyInvitationOrganizationOut,
    MyInvitationOut,
    MyInvitationWorkspaceOut,
    ResetTokenPayload,
    TokenPair,
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
from apps.api.modules.organization.models.organization import Organization
from apps.api.modules.organization.models.user import User, UserCredential, UserStatus
from apps.api.modules.system.models.rbac import Permission, Role
from apps.api.modules.workspaces.invitations.tokens import verify_invite_token
from apps.api.modules.workspaces.models.workspace import (
    Workspace,
    WorkspaceMembership,
    WorkspaceMembershipRole,
    WorkspaceMembershipStatus,
)
from apps.api.modules.workspaces.models.workspace_invite import (
    WorkspaceEmailInvite,
    WorkspaceInviteLink,
    WorkspaceInviteLinkUseEvent,
)


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

    def _coerce_user_id(self, user: UserLike) -> UUID:
        return UUID(str(user.id))

    def _coerce_token_version(self, user: UserLike) -> int:
        raw = getattr(user, "token_version", 0)
        try:
            return int(raw or 0)
        except Exception:
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

    @staticmethod
    def build_user_profile(user: UserLike) -> UserProfile:
        return UserProfile(
            id=user.id,
            username=user.username,
            email=user.email,
            display_name=user.display_name,
            avatar_url=user.avatar_url,
        )

    @staticmethod
    def mask_email(email: str) -> str:
        """
        Mask an email address for safer display.

        Examples:
        - john@example.com -> jo***n@example.com
        - a@example.com -> a***@example.com
        """

        raw = (email or "").strip()
        if "@" not in raw:
            return raw
        local, domain = raw.split("@", 1)
        if not local:
            return f"***@{domain}"
        if len(local) <= 2:
            return f"{local[0]}***@{domain}"
        return f"{local[:2]}***{local[-1]}@{domain}"

    async def _ensure_role_codes_have_admin_access(self, *, workspace_id: UUID, role_codes: list[str], conn) -> None:
        """
        Defensive invariant for onboarding flows:
        user must be able to access admin console after accepting the invitation.
        """

        codes = sorted({(c or "").strip() for c in (role_codes or []) if (c or "").strip()})
        if not codes:
            raise Forbidden(
                message=self._ta("INVITE_ROLE_NO_ADMIN_ACCESS", "邀请角色未包含后台访问权限"),
                error="INVITE_ROLE_MISSING_ADMIN_ACCESS",
            )

        # Superuser roles implicitly have all permissions.
        if await Role.filter(workspace_id=workspace_id, code__in=codes, is_superuser=True).using_db(conn).exists():
            return

        ok = (
            await Permission
            .filter(
                code="admin:access",
                scope="workspace",
                permission_roles__role__workspace_id=workspace_id,
                permission_roles__role__code__in=codes,
            )
            .using_db(conn)
            .exists()
        )
        if not ok:
            raise Forbidden(
                message=self._ta("INVITE_ROLE_NO_ADMIN_ACCESS", "邀请角色未包含后台访问权限"),
                error="INVITE_ROLE_MISSING_ADMIN_ACCESS",
            )

    async def register_public(
        self,
        *,
        username: str,
        password: str,
        email: str | None = None,
        display_name: str | None = None,
    ) -> UserLike:
        if not self.settings.auth.allow_public_register:
            # Hide the endpoint by default to enforce invitation-only onboarding.
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")
        return await self.register(
            username=username,
            password=password,
            email=email,
            display_name=display_name,
        )

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
        email = (user.email or "").strip().lower()
        if not email:
            return PageData[MyInvitationOut](
                items=[],
                total=0,
                page=params.page,
                size=params.size,
                pages=0,
                next=None,
                prev=None,
            )

        now = datetime.now(UTC)

        qs = WorkspaceEmailInvite.filter(email=email).select_related("organization", "workspace")

        status = (filters.status or "").strip().lower() if filters.status else ""
        if status == "accepted":
            qs = qs.filter(accepted_by_user_id=user.id, accepted_at__not_isnull=True).order_by("-accepted_at")
        else:
            # Default to pending.
            qs = (
                qs
                .filter(accepted_at=None, revoked_at=None)
                .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
                .order_by("-created_at")
            )

        if filters.q:
            needle = filters.q.strip()
            if needle:
                qs = qs.filter(
                    Q(role_code__icontains=needle)
                    | Q(organization__name__icontains=needle)
                    | Q(workspace__name__icontains=needle)
                )

        total = int(await qs.count())
        pages = (total + params.size - 1) // params.size if params.size else 0
        rows = await qs.limit(params.limit).offset(params.offset).all()

        inviter_ids = {UUID(str(inv.created_by_user_id)) for inv in rows if inv.created_by_user_id is not None}
        inviter_map: dict[UUID, MyInvitationInviterOut] = {}
        if inviter_ids:
            inviter_rows = await User.filter(id__in=list(inviter_ids)).all()
            for u in inviter_rows:
                inviter_map[u.id] = MyInvitationInviterOut(
                    id=u.id,
                    username=u.username,
                    email=u.email,
                    display_name=u.display_name,
                    avatar_url=u.avatar_url,
                )

        items: list[MyInvitationOut] = []
        for inv in rows:
            org = inv.organization
            org_out = MyInvitationOrganizationOut(
                id=org.id,
                name=org.name,
                slug=org.slug,
                logo_url=org.logo_url,
            )
            ws = inv.workspace
            ws_out = MyInvitationWorkspaceOut(
                id=ws.id,
                name=ws.name,
                slug=ws.slug,
            )
            inviter = inviter_map.get(UUID(str(inv.created_by_user_id))) if inv.created_by_user_id is not None else None

            is_accepted = inv.accepted_at is not None and str(inv.accepted_by_user_id) == str(user.id)
            out_status = "accepted" if is_accepted else "pending"

            items.append(
                MyInvitationOut(
                    id=inv.id,
                    email=inv.email,
                    role_code=inv.role_code,
                    expires_at=inv.expires_at,
                    organization=org_out,
                    workspace=ws_out,
                    inviter=inviter,
                    status=out_status,
                    accepted_at=inv.accepted_at,
                    created_at=inv.created_at,
                    updated_at=inv.updated_at,
                )
            )

        next_page = params.page + 1 if pages and params.page < pages else None
        prev_page = min(params.page - 1, pages) if pages and params.page > 1 else None

        return PageData[MyInvitationOut](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=next_page,
            prev=prev_page,
        )

    async def accept_invitation(self, *, payload: AcceptInvitationRequest) -> TokenPair:
        # If we can't issue refresh tokens, the UX becomes confusing (account created but can't login).
        self._require_refresh_store()

        token = payload.token.strip()
        if not token:
            raise BadRequest(
                message=self._ta("INVITE_TOKEN_INVALID", "邀请 Token 无效"),
                error="INVITE_TOKEN_INVALID",
            )

        code = verify_invite_token(self.settings, token=token)
        if code is None:
            raise BadRequest(
                message=self._ta("INVITE_TOKEN_INVALID", "邀请 Token 无效"),
                error="INVITE_TOKEN_INVALID",
            )

        now = datetime.now(UTC)

        inviter_user_id: UUID | None = None
        accepted_user_id: UUID | None = None
        accepted_display_name: str | None = None
        organization_id: UUID | None = None
        workspace_id: UUID | None = None

        async with in_transaction() as conn:
            assigned_role_code: str | None = None
            invite_email: str | None = None
            invite_link: WorkspaceInviteLink | None = None
            email_inv: WorkspaceEmailInvite | None = None

            if code.startswith("il_"):
                invite_link = await WorkspaceInviteLink.filter(code=code).using_db(conn).select_for_update().first()
                if invite_link is None:
                    raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")
                if invite_link.disabled_at is not None:
                    raise Forbidden(message=self._ta("INVITE_REVOKED", "邀请已被撤销"), error="INVITE_REVOKED")
                if invite_link.expires_at is not None and invite_link.expires_at <= now:
                    raise Forbidden(message=self._ta("INVITE_EXPIRED", "邀请已过期"), error="INVITE_EXPIRED")
                if invite_link.max_uses is not None and int(invite_link.uses_count or 0) >= int(invite_link.max_uses):
                    raise Forbidden(
                        message=self._ta("INVITE_REVOKED", "邀请不可用"),
                        error="INVITE_MAX_USES_REACHED",
                    )

                organization_id = UUID(str(cast(HasOrganizationId, invite_link).organization_id))
                workspace_id = UUID(str(cast(HasWorkspaceId, invite_link).workspace_id))
                inviter_user_id = invite_link.created_by_user_id
                assigned_role_code = invite_link.role_code

                invite_email = (payload.email or "").strip().lower()
                if not invite_email:
                    raise BadRequest(message=self._ta("EMAIL_REQUIRED", "邮箱不能为空"), error="EMAIL_REQUIRED")

                allowed_domain = (invite_link.allowed_email_domain or "").strip().lower()
                if allowed_domain:
                    allowed_domain = allowed_domain[1:] if allowed_domain.startswith("@") else allowed_domain
                    if "@" not in invite_email:
                        raise Forbidden(
                            message=self._ta("INVITE_EMAIL_MISMATCH", "邮箱不符合要求"),
                            error="INVITE_EMAIL_DOMAIN_FORBIDDEN",
                        )
                    domain = invite_email.split("@", 1)[1].strip().lower()
                    if domain != allowed_domain:
                        raise Forbidden(
                            message=self._ta("INVITE_EMAIL_MISMATCH", "邮箱不符合要求"),
                            error="INVITE_EMAIL_DOMAIN_FORBIDDEN",
                        )
            elif code.startswith("ei_"):
                email_inv = await WorkspaceEmailInvite.filter(code=code).using_db(conn).select_for_update().first()
                if email_inv is None:
                    raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")
                if email_inv.revoked_at is not None:
                    raise Forbidden(message=self._ta("INVITE_REVOKED", "邀请已被撤销"), error="INVITE_REVOKED")
                if email_inv.accepted_at is not None:
                    raise Conflict(
                        message=self._ta("INVITE_REVOKED", "邀请不可用"),
                        error="INVITE_ALREADY_ACCEPTED",
                    )
                if email_inv.expires_at is not None and email_inv.expires_at <= now:
                    raise Forbidden(message=self._ta("INVITE_EXPIRED", "邀请已过期"), error="INVITE_EXPIRED")

                organization_id = UUID(str(cast(HasOrganizationId, email_inv).organization_id))
                workspace_id = UUID(str(cast(HasWorkspaceId, email_inv).workspace_id))
                inviter_user_id = email_inv.created_by_user_id
                assigned_role_code = email_inv.role_code

                invite_email = (email_inv.email or "").strip().lower()
                if payload.email is not None:
                    provided = str(payload.email).strip().lower()
                    if provided and provided != invite_email:
                        raise Forbidden(
                            message=self._ta("INVITE_EMAIL_MISMATCH", "邀请邮箱不匹配"),
                            error="INVITE_EMAIL_MISMATCH",
                        )
            else:
                raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")

            if organization_id is None or workspace_id is None:
                raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")

            org = await Organization.get_or_none(id=organization_id, using_db=conn)
            if org is None or not org.is_active:
                raise Forbidden(message=self._ta("ORG_INACTIVE", "组织不可用"), error="ORG_INACTIVE")
            ws = await Workspace.get_or_none(id=workspace_id, using_db=conn)
            if ws is None or not ws.is_active:
                raise Forbidden(
                    message=t("errors", "NOT_FOUND", default="资源不存在"),
                    error="WORKSPACE_INACTIVE",
                )
            if UUID(str(cast(HasOrganizationId, ws).organization_id)) != organization_id:
                raise Forbidden(
                    message=t("errors", "PERMISSION_DENIED", default="权限不足"),
                    error="CROSS_ORG_ACCESS_DENIED",
                )

            username = payload.username.strip()
            email = (invite_email or "").strip().lower()
            display_name = payload.display_name.strip() if payload.display_name else None

            if not username:
                raise BadRequest(message=self._ta("USERNAME_REQUIRED", "用户名不能为空"), error="USERNAME_REQUIRED")
            if not email:
                raise BadRequest(message=self._ta("EMAIL_REQUIRED", "邮箱不能为空"), error="EMAIL_REQUIRED")

            if await User.filter(username=username).using_db(conn).exists():
                raise Conflict(message=self._ta("USERNAME_EXISTS", "用户名已存在"), error="USERNAME_EXISTS")
            if await User.filter(email=email).using_db(conn).exists():
                raise Conflict(message=self._ta("EMAIL_EXISTS", "邮箱已存在"), error="EMAIL_EXISTS")

            self._ensure_password_strength(payload.password)

            password_hash = hash_password(payload.password, self.settings.auth)
            user = await User.create(
                using_db=conn,
                username=username,
                email=email,
                status=UserStatus.ACTIVE,
                display_name=display_name,
                avatar_url=None,
            )
            await UserCredential.create(using_db=conn, user_id=user.id, password_hash=password_hash)

            # One user can only belong to one organization.
            from apps.api.modules.organization.models.org_membership import OrgRole

            await OrgMembership.create(
                using_db=conn,
                organization_id=organization_id,
                user_id=user.id,
                role=OrgRole.MEMBER,
                status="active",
            )

            wsm, _created = await WorkspaceMembership.get_or_create(
                using_db=conn,
                user_id=user.id,
                workspace_id=workspace_id,
                defaults={"status": WorkspaceMembershipStatus.ACTIVE, "invited_by_user_id": inviter_user_id},
            )
            if wsm.status != WorkspaceMembershipStatus.ACTIVE:
                wsm.status = WorkspaceMembershipStatus.ACTIVE
                await wsm.save(using_db=conn, update_fields=["status"])

            roles: list[Role] = []
            if assigned_role_code:
                role = await Role.get_or_none(workspace_id=workspace_id, code=assigned_role_code, using_db=conn)
                if role is not None:
                    roles = [role]
            else:
                roles = await Role.filter(workspace_id=workspace_id, is_default=True).using_db(conn).all()

            for role in roles:
                await WorkspaceMembershipRole.get_or_create(using_db=conn, membership_id=wsm.id, role_id=role.id)

            await self._ensure_role_codes_have_admin_access(
                workspace_id=workspace_id, role_codes=[r.code for r in roles], conn=conn
            )

            if email_inv is not None:
                email_inv.accepted_by_user_id = user.id
                email_inv.accepted_at = now
                await email_inv.save(using_db=conn, update_fields=["accepted_by_user_id", "accepted_at"])

            if invite_link is not None:
                invite_link.uses_count = int(invite_link.uses_count or 0) + 1
                invite_link.last_used_by_user_id = user.id
                invite_link.last_used_at = now
                await invite_link.save(
                    using_db=conn,
                    update_fields=["uses_count", "last_used_by_user_id", "last_used_at"],
                )
                await WorkspaceInviteLinkUseEvent.create(
                    using_db=conn,
                    link_id=invite_link.id,
                    used_by_user_id=user.id,
                    used_at=now,
                    joined_membership_id=wsm.id,
                )

            accepted_user_id = user.id
            accepted_display_name = user.display_name or user.username

        tokens = await self.login(identifier=payload.username, password=payload.password)

        # Best-effort: notify inviter that the invite was accepted.
        # This must never break the onboarding flow if notification creation fails.
        if inviter_user_id is not None and accepted_user_id is not None:
            try:
                from apps.api.modules.system.models.notification import NotificationCategory, NotificationRecord
                from apps.api.modules.system.models.setting import SettingRecord
                from apps.api.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

                # Optional gate: allow disabling invite-related in-app notifications.
                try:
                    core = await SettingRecord.get_or_none(
                        scope_type=SCOPE_TYPE_SYSTEM, scope_id=SYSTEM_SCOPE_ID, namespace="core"
                    )
                    v = core.value if core and isinstance(core.value, dict) else {}
                    notifications_cfg = v.get("notifications")
                    invite_enabled = True
                    if isinstance(notifications_cfg, dict) and isinstance(
                        notifications_cfg.get("invite_enabled"), bool
                    ):
                        invite_enabled = bool(notifications_cfg.get("invite_enabled"))
                except Exception:
                    invite_enabled = True

                if invite_enabled:
                    await NotificationRecord.create(
                        workspace_id=workspace_id,
                        recipient_user_id=inviter_user_id,
                        actor_user_id=accepted_user_id,
                        category=NotificationCategory.TEAM,
                        title=t(
                            "notifications",
                            "NOTIFICATIONS_TEAM_INVITE_ACCEPTED_TITLE",
                            default="{name} 已加入工作区",
                            name=accepted_display_name or "新成员",
                        ),
                        body=t(
                            "notifications",
                            "NOTIFICATIONS_TEAM_INVITE_ACCEPTED_BODY",
                            default="对方已接受邀请并成功加入。",
                        ),
                        target_to="/settings/team/members",
                        target_meta=None,
                        event_name="team.invitation.accepted",
                        dedupe_key=f"workspace.invitation.accepted:{code}",
                    )
            except Exception as exc:
                self.logger.warning(
                    "Notification create failed (invite accepted)",
                    error=str(exc),
                    org_id=str(organization_id),
                    inviter_user_id=str(inviter_user_id),
                )

        return tokens

    async def preview_invitation(self, *, token: str) -> InvitationPreviewResult:
        token = (token or "").strip()
        if not token:
            raise BadRequest(
                message=self._ta("INVITE_TOKEN_INVALID", "邀请 Token 无效"),
                error="INVITE_TOKEN_INVALID",
            )

        now = datetime.now(UTC)
        code = verify_invite_token(self.settings, token=token)
        if code is None:
            raise BadRequest(
                message=self._ta("INVITE_TOKEN_INVALID", "邀请 Token 无效"),
                error="INVITE_TOKEN_INVALID",
            )

        inviter_user_id: UUID | None = None
        role_code: str | None = None
        expires_at: datetime | None = None
        invitation_email: str | None = None

        org: Organization | None = None
        ws: Workspace | None = None

        if code.startswith("il_"):
            link = await WorkspaceInviteLink.get_or_none(code=code).select_related("organization", "workspace")
            if link is None:
                raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")
            if link.disabled_at is not None:
                raise Forbidden(message=self._ta("INVITE_REVOKED", "邀请已被撤销"), error="INVITE_REVOKED")
            if link.expires_at is not None and link.expires_at <= now:
                raise Forbidden(message=self._ta("INVITE_EXPIRED", "邀请已过期"), error="INVITE_EXPIRED")
            if link.max_uses is not None and int(link.uses_count or 0) >= int(link.max_uses):
                raise Forbidden(
                    message=self._ta("INVITE_REVOKED", "邀请不可用"),
                    error="INVITE_MAX_USES_REACHED",
                )

            org = link.organization
            ws = link.workspace
            role_code = link.role_code
            inviter_user_id = link.created_by_user_id
            expires_at = link.expires_at
            invitation_email = None
        elif code.startswith("ei_"):
            inv = await WorkspaceEmailInvite.get_or_none(code=code).select_related("organization", "workspace")
            if inv is None:
                raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")
            if inv.revoked_at is not None:
                raise Forbidden(message=self._ta("INVITE_REVOKED", "邀请已被撤销"), error="INVITE_REVOKED")
            if inv.accepted_at is not None:
                raise Conflict(
                    message=self._ta("INVITE_REVOKED", "邀请不可用"),
                    error="INVITE_ALREADY_ACCEPTED",
                )
            if inv.expires_at is not None and inv.expires_at <= now:
                raise Forbidden(message=self._ta("INVITE_EXPIRED", "邀请已过期"), error="INVITE_EXPIRED")

            org = inv.organization
            ws = inv.workspace
            role_code = inv.role_code
            inviter_user_id = inv.created_by_user_id
            expires_at = inv.expires_at
            invitation_email = inv.email
        else:
            raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")

        if org is None or not org.is_active:
            raise Forbidden(message=self._ta("ORG_INACTIVE", "组织不可用"), error="ORG_INACTIVE")
        if ws is None or not ws.is_active:
            raise Forbidden(message=t("errors", "NOT_FOUND", default="资源不存在"), error="WORKSPACE_INACTIVE")

        inviter: InvitationPreviewInviterOut | None = None
        if inviter_user_id is not None:
            u = await User.get_or_none(id=inviter_user_id)
            if u is not None:
                inviter = InvitationPreviewInviterOut(
                    id=u.id,
                    username=u.username,
                    display_name=u.display_name,
                    avatar_url=u.avatar_url,
                )

        role_out: InvitationPreviewRoleOut | None = None
        role_obj: Role | None = None
        if role_code:
            role_obj = await Role.get_or_none(workspace_id=ws.id, code=role_code)
        if role_obj is None:
            role_obj = await Role.get_or_none(workspace_id=ws.id, code="viewer")
        if role_obj is None:
            role_obj = await Role.filter(workspace_id=ws.id, is_default=True).order_by("code").first()
        if role_obj is not None:
            # Localize role name/description for preview UX.
            from apps.api.modules.system.rbac.service import RBACService

            rbac = RBACService(self.settings)
            localized = rbac.localize_role(role_obj, locale=get_current_locale())
            role_out = InvitationPreviewRoleOut(
                code=role_obj.code,
                name=str(localized.get("name") or role_obj.code),
                description=localized.get("description"),
            )

        user_exists = bool(invitation_email) and await User.filter(email=invitation_email).exists()

        return InvitationPreviewResult(
            invitation=InvitationPreviewInvitationOut(
                email=invitation_email,
                masked_email=self.mask_email(invitation_email) if invitation_email else None,
                role_code=role_code,
                expires_at=expires_at,
            ),
            organization=InvitationPreviewOrganizationOut(
                id=org.id,
                name=org.name,
                slug=org.slug,
                logo_url=org.logo_url,
            ),
            workspace=InvitationPreviewWorkspaceOut(
                id=ws.id,
                name=ws.name,
                slug=ws.slug,
            ),
            inviter=inviter,
            role=role_out,
            user_exists=bool(user_exists),
        )

    async def accept_existing_invitation(
        self,
        *,
        payload: AcceptExistingInvitationRequest,
        user: User,
    ) -> AcceptExistingInvitationResult:
        token = (payload.token or "").strip()
        if not token:
            raise BadRequest(
                message=self._ta("INVITE_TOKEN_INVALID", "邀请 Token 无效"),
                error="INVITE_TOKEN_INVALID",
            )

        code = verify_invite_token(self.settings, token=token)
        if code is None:
            raise BadRequest(
                message=self._ta("INVITE_TOKEN_INVALID", "邀请 Token 无效"),
                error="INVITE_TOKEN_INVALID",
            )

        now = datetime.now(UTC)

        inviter_user_id: UUID | None = None
        organization_id: UUID | None = None
        workspace_id: UUID | None = None
        assigned_role_code: str | None = None

        async with in_transaction() as conn:
            invite_link: WorkspaceInviteLink | None = None
            email_inv: WorkspaceEmailInvite | None = None

            if code.startswith("il_"):
                invite_link = await WorkspaceInviteLink.filter(code=code).using_db(conn).select_for_update().first()
                if invite_link is None:
                    raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")
                if invite_link.disabled_at is not None:
                    raise Forbidden(message=self._ta("INVITE_REVOKED", "邀请已被撤销"), error="INVITE_REVOKED")
                if invite_link.expires_at is not None and invite_link.expires_at <= now:
                    raise Forbidden(message=self._ta("INVITE_EXPIRED", "邀请已过期"), error="INVITE_EXPIRED")
                if invite_link.max_uses is not None and int(invite_link.uses_count or 0) >= int(invite_link.max_uses):
                    raise Forbidden(
                        message=self._ta("INVITE_REVOKED", "邀请不可用"),
                        error="INVITE_MAX_USES_REACHED",
                    )

                organization_id = UUID(str(cast(HasOrganizationId, invite_link).organization_id))
                workspace_id = UUID(str(cast(HasWorkspaceId, invite_link).workspace_id))
                inviter_user_id = invite_link.created_by_user_id
                assigned_role_code = invite_link.role_code

                user_email = (user.email or "").strip().lower()
                if not user_email:
                    raise Forbidden(message=self._ta("EMAIL_REQUIRED", "邮箱不能为空"), error="EMAIL_REQUIRED")
                allowed_domain = (invite_link.allowed_email_domain or "").strip().lower()
                if allowed_domain:
                    allowed_domain = allowed_domain[1:] if allowed_domain.startswith("@") else allowed_domain
                    if "@" not in user_email:
                        raise Forbidden(
                            message=self._ta("INVITE_EMAIL_MISMATCH", "邮箱不符合要求"),
                            error="INVITE_EMAIL_DOMAIN_FORBIDDEN",
                        )
                    domain = user_email.split("@", 1)[1].strip().lower()
                    if domain != allowed_domain:
                        raise Forbidden(
                            message=self._ta("INVITE_EMAIL_MISMATCH", "邮箱不符合要求"),
                            error="INVITE_EMAIL_DOMAIN_FORBIDDEN",
                        )
            elif code.startswith("ei_"):
                email_inv = await WorkspaceEmailInvite.filter(code=code).using_db(conn).select_for_update().first()
                if email_inv is None:
                    raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")
                if email_inv.revoked_at is not None:
                    raise Forbidden(message=self._ta("INVITE_REVOKED", "邀请已被撤销"), error="INVITE_REVOKED")
                if email_inv.accepted_at is not None:
                    raise Conflict(
                        message=self._ta("INVITE_REVOKED", "邀请不可用"),
                        error="INVITE_ALREADY_ACCEPTED",
                    )
                if email_inv.expires_at is not None and email_inv.expires_at <= now:
                    raise Forbidden(message=self._ta("INVITE_EXPIRED", "邀请已过期"), error="INVITE_EXPIRED")

                organization_id = UUID(str(cast(HasOrganizationId, email_inv).organization_id))
                workspace_id = UUID(str(cast(HasWorkspaceId, email_inv).workspace_id))
                inviter_user_id = email_inv.created_by_user_id
                assigned_role_code = email_inv.role_code

                user_email = (user.email or "").strip().lower()
                invite_email = (email_inv.email or "").strip().lower()
                if not user_email or user_email != invite_email:
                    raise Forbidden(
                        message=self._ta("INVITE_EMAIL_MISMATCH", "邀请邮箱不匹配"),
                        error="INVITE_EMAIL_MISMATCH",
                    )
            else:
                raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")

            if organization_id is None or workspace_id is None:
                raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")

            org = await Organization.get_or_none(id=organization_id, using_db=conn)
            if org is None or not org.is_active:
                raise Forbidden(message=self._ta("ORG_INACTIVE", "组织不可用"), error="ORG_INACTIVE")
            ws = await Workspace.get_or_none(id=workspace_id, using_db=conn)
            if ws is None or not ws.is_active:
                raise Forbidden(
                    message=t("errors", "NOT_FOUND", default="资源不存在"),
                    error="WORKSPACE_INACTIVE",
                )
            if UUID(str(cast(HasOrganizationId, ws).organization_id)) != organization_id:
                raise Forbidden(
                    message=t("errors", "PERMISSION_DENIED", default="权限不足"),
                    error="CROSS_ORG_ACCESS_DENIED",
                )

            # One user can only be in one organization.
            existing_orgm = await OrgMembership.filter(user_id=user.id).using_db(conn).select_for_update().first()
            if existing_orgm is None:
                from apps.api.modules.organization.models.org_membership import OrgRole

                await OrgMembership.create(
                    using_db=conn,
                    organization_id=organization_id,
                    user_id=user.id,
                    role=OrgRole.MEMBER,
                    status="active",
                )
            else:
                if UUID(str(cast(HasOrganizationId, existing_orgm).organization_id)) != organization_id:
                    raise Forbidden(
                        message=t("errors", "PERMISSION_DENIED", default="权限不足"),
                        error="CROSS_ORG_ACCESS_DENIED",
                    )

            wsm, _created = await WorkspaceMembership.get_or_create(
                using_db=conn,
                user_id=user.id,
                workspace_id=workspace_id,
                defaults={"status": WorkspaceMembershipStatus.ACTIVE, "invited_by_user_id": inviter_user_id},
            )
            if wsm.status != WorkspaceMembershipStatus.ACTIVE:
                wsm.status = WorkspaceMembershipStatus.ACTIVE
                await wsm.save(using_db=conn, update_fields=["status"])

            roles: list[Role] = []
            if assigned_role_code:
                role = await Role.get_or_none(workspace_id=workspace_id, code=assigned_role_code, using_db=conn)
                if role is not None:
                    roles = [role]
            else:
                roles = await Role.filter(workspace_id=workspace_id, is_default=True).using_db(conn).all()

            for role in roles:
                await WorkspaceMembershipRole.get_or_create(using_db=conn, membership_id=wsm.id, role_id=role.id)

            await self._ensure_role_codes_have_admin_access(
                workspace_id=workspace_id, role_codes=[r.code for r in roles], conn=conn
            )

            if email_inv is not None:
                email_inv.accepted_by_user_id = user.id
                email_inv.accepted_at = now
                await email_inv.save(using_db=conn, update_fields=["accepted_by_user_id", "accepted_at"])

            if invite_link is not None:
                invite_link.uses_count = int(invite_link.uses_count or 0) + 1
                invite_link.last_used_by_user_id = user.id
                invite_link.last_used_at = now
                await invite_link.save(
                    using_db=conn,
                    update_fields=["uses_count", "last_used_by_user_id", "last_used_at"],
                )
                await WorkspaceInviteLinkUseEvent.create(
                    using_db=conn,
                    link_id=invite_link.id,
                    used_by_user_id=user.id,
                    used_at=now,
                    joined_membership_id=wsm.id,
                )

            assigned_role_code = assigned_role_code or (roles[0].code if roles else None)

        if inviter_user_id is not None and organization_id is not None:
            try:
                from apps.api.modules.system.models.notification import NotificationCategory, NotificationRecord

                accepted_display_name = user.display_name or user.username
                await NotificationRecord.create(
                    workspace_id=workspace_id,
                    recipient_user_id=inviter_user_id,
                    actor_user_id=user.id,
                    category=NotificationCategory.TEAM,
                    title=t(
                        "notifications",
                        "NOTIFICATIONS_TEAM_INVITE_ACCEPTED_TITLE",
                        default="{name} 已加入工作区",
                        name=accepted_display_name or "新成员",
                    ),
                    body=t(
                        "notifications",
                        "NOTIFICATIONS_TEAM_INVITE_ACCEPTED_BODY",
                        default="对方已接受邀请并成功加入。",
                    ),
                    target_to="/settings/team/members",
                    target_meta=None,
                    event_name="workspace.invitation.accepted",
                    dedupe_key=f"workspace.invitation.accepted:{code}",
                )
            except Exception as exc:
                self.logger.warning(
                    "Notification create failed (invite accepted existing)",
                    error=str(exc),
                    org_id=str(organization_id),
                    inviter_user_id=str(inviter_user_id),
                )

        if organization_id is None or workspace_id is None:
            raise ServiceUnavailable(
                message=t("errors", "SERVICE_UNAVAILABLE", default="服务不可用"),
                error="SERVICE_UNAVAILABLE",
            )

        return AcceptExistingInvitationResult(
            organization_id=organization_id,
            workspace_id=workspace_id,
            role_code=assigned_role_code,
        )
