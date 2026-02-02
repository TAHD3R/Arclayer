from __future__ import annotations

from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from tortoise.expressions import Q
from tortoise.transactions import in_transaction

from apps.api.common.utils.tortoise_protocols import HasOrganizationId, HasWorkspaceId
from apps.api.config import Settings, get_settings
from apps.api.core.exceptions import BadRequest, Conflict, Forbidden, NotFound, ServiceUnavailable
from apps.api.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.core.http.response import Response, ResponseModel
from apps.api.core.i18n import get_current_locale, t
from apps.api.core.invitations.tokens import verify_invite_token
from apps.api.infra.cache.valkey import get_valkey
from apps.api.infra.limiter.limiter import rate_limit
from apps.api.models.org_membership import OrgMembership
from apps.api.models.organization import Organization
from apps.api.models.rbac import Permission, Role
from apps.api.models.user import User, UserCredential, UserStatus
from apps.api.models.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipRole, WorkspaceMembershipStatus
from apps.api.models.workspace_invite import WorkspaceEmailInvite, WorkspaceInviteLink, WorkspaceInviteLinkUseEvent
from apps.api.routers.v1.auth.constants import (
    FORGOT_PASSWORD_RATE_LIMIT,
    LOGIN_RATE_LIMIT,
    REFRESH_RATE_LIMIT,
    REGISTER_RATE_LIMIT,
    RESET_PASSWORD_RATE_LIMIT,
)
from apps.api.routers.v1.auth.deps import get_current_user
from apps.api.routers.v1.auth.schema import (
    AcceptExistingInvitationRequest,
    AcceptExistingInvitationResult,
    AcceptInvitationRequest,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    InvitationPreviewInvitationOut,
    InvitationPreviewInviterOut,
    InvitationPreviewOrganizationOut,
    InvitationPreviewResult,
    InvitationPreviewRoleOut,
    InvitationPreviewWorkspaceOut,
    LoginRequest,
    LogoutRequest,
    MyInvitationInviterOut,
    MyInvitationListQuery,
    MyInvitationOrganizationOut,
    MyInvitationOut,
    MyInvitationWorkspaceOut,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    ResetTokenPayload,
    TokenPair,
    UserProfile,
)
from apps.api.routers.v1.auth.services import AuthService

router = APIRouter(tags=["Services: Auth Service"])


def _mask_email(email: str) -> str:
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


async def _ensure_role_codes_have_admin_access(*, workspace_id: UUID, role_codes: list[str], conn) -> None:
    """
    Defensive invariant for onboarding flows:
    user must be able to access admin console after accepting the invitation.
    """

    codes = sorted({(c or "").strip() for c in (role_codes or []) if (c or "").strip()})
    if not codes:
        raise Forbidden(
            message=t("auth", "INVITE_ROLE_NO_ADMIN_ACCESS", default="邀请角色未包含后台访问权限"),
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
            message=t("auth", "INVITE_ROLE_NO_ADMIN_ACCESS", default="邀请角色未包含后台访问权限"),
            error="INVITE_ROLE_MISSING_ADMIN_ACCESS",
        )


def _get_auth_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> AuthService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    return AuthService(settings, valkey=valkey)


@router.post(
    "/login",
    response_model=ResponseModel[TokenPair],
    dependencies=[rate_limit(*LOGIN_RATE_LIMIT)],
)
async def login(
    payload: LoginRequest,
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[TokenPair]:
    tokens = await service.login(identifier=payload.username, password=payload.password)
    return Response.success(message=t("auth", "LOGIN_SUCCESS", default="登录成功"), data=tokens)


@router.post(
    "/register",
    response_model=ResponseModel[UserProfile],
    dependencies=[rate_limit(*REGISTER_RATE_LIMIT)],
)
async def register(
    payload: RegisterRequest,
    background_tasks: BackgroundTasks,
    settings: Settings = Depends(get_settings),
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[UserProfile]:
    if not settings.auth.allow_public_register:
        # Hide the endpoint by default to enforce invitation-only onboarding.
        raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

    user = await service.register(
        username=payload.username,
        password=payload.password,
        email=payload.email,
        display_name=payload.display_name,
    )
    profile = UserProfile(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
    )
    if user.email:
        locale = get_current_locale()
        background_tasks.add_task(
            service.send_welcome_email,
            recipient=user.email,
            username=user.username,
            user_id=user.id,
            locale=locale,
        )
    return Response.success(message=t("auth", "REGISTER_SUCCESS", default="注册成功"), data=profile)


@router.post(
    "/refresh",
    response_model=ResponseModel[TokenPair],
    dependencies=[rate_limit(*REFRESH_RATE_LIMIT)],
)
async def refresh(
    payload: RefreshRequest,
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[TokenPair]:
    tokens = await service.refresh(refresh_token=payload.refresh_token)
    return Response.success(message=t("auth", "REFRESH_SUCCESS", default="刷新成功"), data=tokens)


@router.post(
    "/forgot-password",
    response_model=ResponseModel[ResetTokenPayload],
    dependencies=[rate_limit(*FORGOT_PASSWORD_RATE_LIMIT)],
)
async def forgot_password(
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    settings: Settings = Depends(get_settings),
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[ResetTokenPayload]:
    # Password reset is a critical flow: without email, the user can't complete the loop.
    # To avoid "fake success" and confusion, fail fast when email sending is disabled.
    if not await service.email_service.is_enabled():
        raise BadRequest(
            message=t("auth", "MAIL_DISABLED", default="系统未开启邮件服务，请联系管理员"),
            error="MAIL_DISABLED",
        )

    issued = await service.forgot_password(identifier=payload.identifier)
    token_payload = None
    if issued and settings.app_env in {"development", "test"}:
        token, ttl, _recipient, _user_id = issued
        token_payload = ResetTokenPayload(reset_token=token, expires_in=ttl)
    if issued:
        token, ttl, recipient, user_id = issued
        locale = get_current_locale()
        background_tasks.add_task(
            service.send_reset_email,
            recipient=recipient,
            reset_token=token,
            expires_in=ttl,
            user_id=user_id,
            locale=locale,
        )
    return Response.success(
        message=t("auth", "RESET_SENT", default="如账号存在则将发送重置码至指定邮箱"),
        data=token_payload,
    )


@router.post(
    "/reset-password",
    response_model=ResponseModel[None],
    dependencies=[rate_limit(*RESET_PASSWORD_RATE_LIMIT)],
)
async def reset_password(
    payload: ResetPasswordRequest,
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[None]:
    await service.reset_password(reset_token=payload.reset_token, new_password=payload.new_password)
    return Response.success(message=t("auth", "RESET_SUCCESS", default="密码重置成功"))


@router.post("/change-password", response_model=ResponseModel[None])
async def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[None]:
    await service.change_password(
        user_id=user.id,
        old_password=payload.old_password,
        new_password=payload.new_password,
    )
    return Response.success(message=t("auth", "PASSWORD_CHANGED", default="密码修改成功"))


@router.post("/logout", response_model=ResponseModel[None])
async def logout(
    payload: LogoutRequest,
    user: User = Depends(get_current_user),
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[None]:
    await service.logout(user_id=user.id, refresh_token=payload.refresh_token)
    return Response.success(message=t("auth", "LOGOUT_SUCCESS", default="退出成功"))


@router.get("/me", response_model=ResponseModel[UserProfile])
async def me(
    user: User = Depends(get_current_user),
) -> ResponseModel[UserProfile]:
    profile = UserProfile(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
    )
    return Response.success(data=profile)


@router.get("/me/invitations", response_model=ResponseModel[PageData[MyInvitationOut]])
async def me_invitations(
    user: User = Depends(get_current_user),
    params: PageParams = Depends(get_page_params),
    filters: MyInvitationListQuery = Depends(),
) -> ResponseModel[PageData[MyInvitationOut]]:
    """
    List invitations sent to the current user (email-bound).

    Semantics:
    - pending: invitations to my email that are not accepted/revoked/expired
    - accepted: invitations accepted by me
    """

    email = (user.email or "").strip().lower()
    if not email:
        return Response.success(
            data=PageData[MyInvitationOut](
                items=[],
                total=0,
                page=params.page,
                size=params.size,
                pages=0,
                next=None,
                prev=None,
            )
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
        inviter = None
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

    return Response.success(
        data=PageData[MyInvitationOut](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=next_page,
            prev=prev_page,
        )
    )


@router.post(
    "/invitations/accept",
    response_model=ResponseModel[TokenPair],
    dependencies=[rate_limit(*REGISTER_RATE_LIMIT)],
)
async def accept_invitation(
    payload: AcceptInvitationRequest,
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[TokenPair]:
    # If we can't issue refresh tokens, the UX becomes confusing (account created but can't login).
    service._require_refresh_store()

    token = payload.token.strip()
    if not token:
        raise BadRequest(
            message=t("auth", "INVITE_TOKEN_INVALID", default="邀请 Token 无效"), error="INVITE_TOKEN_INVALID"
        )

    code = verify_invite_token(service.settings, token=token)
    if code is None:
        raise BadRequest(
            message=t("auth", "INVITE_TOKEN_INVALID", default="邀请 Token 无效"), error="INVITE_TOKEN_INVALID"
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
                raise NotFound(message=t("auth", "INVITE_NOT_FOUND", default="邀请不存在"), error="INVITE_NOT_FOUND")
            if invite_link.disabled_at is not None:
                raise Forbidden(message=t("auth", "INVITE_REVOKED", default="邀请已被撤销"), error="INVITE_REVOKED")
            if invite_link.expires_at is not None and invite_link.expires_at <= now:
                raise Forbidden(message=t("auth", "INVITE_EXPIRED", default="邀请已过期"), error="INVITE_EXPIRED")
            if invite_link.max_uses is not None and int(invite_link.uses_count or 0) >= int(invite_link.max_uses):
                raise Forbidden(
                    message=t("auth", "INVITE_REVOKED", default="邀请不可用"), error="INVITE_MAX_USES_REACHED"
                )

            organization_id = UUID(str(cast(HasOrganizationId, invite_link).organization_id))
            workspace_id = UUID(str(cast(HasWorkspaceId, invite_link).workspace_id))
            inviter_user_id = invite_link.created_by_user_id
            assigned_role_code = invite_link.role_code

            invite_email = (payload.email or "").strip().lower()
            if not invite_email:
                raise BadRequest(message=t("auth", "EMAIL_REQUIRED", default="邮箱不能为空"), error="EMAIL_REQUIRED")

            allowed_domain = (invite_link.allowed_email_domain or "").strip().lower()
            if allowed_domain:
                allowed_domain = allowed_domain[1:] if allowed_domain.startswith("@") else allowed_domain
                if "@" not in invite_email:
                    raise Forbidden(
                        message=t("auth", "INVITE_EMAIL_MISMATCH", default="邮箱不符合要求"),
                        error="INVITE_EMAIL_DOMAIN_FORBIDDEN",
                    )
                domain = invite_email.split("@", 1)[1].strip().lower()
                if domain != allowed_domain:
                    raise Forbidden(
                        message=t("auth", "INVITE_EMAIL_MISMATCH", default="邮箱不符合要求"),
                        error="INVITE_EMAIL_DOMAIN_FORBIDDEN",
                    )
        elif code.startswith("ei_"):
            email_inv = await WorkspaceEmailInvite.filter(code=code).using_db(conn).select_for_update().first()
            if email_inv is None:
                raise NotFound(message=t("auth", "INVITE_NOT_FOUND", default="邀请不存在"), error="INVITE_NOT_FOUND")
            if email_inv.revoked_at is not None:
                raise Forbidden(message=t("auth", "INVITE_REVOKED", default="邀请已被撤销"), error="INVITE_REVOKED")
            if email_inv.accepted_at is not None:
                raise Conflict(
                    message=t("auth", "INVITE_REVOKED", default="邀请不可用"), error="INVITE_ALREADY_ACCEPTED"
                )
            if email_inv.expires_at is not None and email_inv.expires_at <= now:
                raise Forbidden(message=t("auth", "INVITE_EXPIRED", default="邀请已过期"), error="INVITE_EXPIRED")

            organization_id = UUID(str(cast(HasOrganizationId, email_inv).organization_id))
            workspace_id = UUID(str(cast(HasWorkspaceId, email_inv).workspace_id))
            inviter_user_id = email_inv.created_by_user_id
            assigned_role_code = email_inv.role_code

            invite_email = (email_inv.email or "").strip().lower()
            if payload.email is not None:
                provided = str(payload.email).strip().lower()
                if provided and provided != invite_email:
                    raise Forbidden(
                        message=t("auth", "INVITE_EMAIL_MISMATCH", default="邀请邮箱不匹配"),
                        error="INVITE_EMAIL_MISMATCH",
                    )
        else:
            raise NotFound(message=t("auth", "INVITE_NOT_FOUND", default="邀请不存在"), error="INVITE_NOT_FOUND")

        if organization_id is None or workspace_id is None:
            raise NotFound(message=t("auth", "INVITE_NOT_FOUND", default="邀请不存在"), error="INVITE_NOT_FOUND")

        org = await Organization.get_or_none(id=organization_id, using_db=conn)
        if org is None or not org.is_active:
            raise Forbidden(message=t("auth", "ORG_INACTIVE", default="组织不可用"), error="ORG_INACTIVE")
        ws = await Workspace.get_or_none(id=workspace_id, using_db=conn)
        if ws is None or not ws.is_active:
            raise Forbidden(message=t("errors", "NOT_FOUND", default="资源不存在"), error="WORKSPACE_INACTIVE")
        if UUID(str(cast(HasOrganizationId, ws).organization_id)) != organization_id:
            raise Forbidden(
                message=t("errors", "PERMISSION_DENIED", default="权限不足"), error="CROSS_ORG_ACCESS_DENIED"
            )

        username = payload.username.strip()
        email = (invite_email or "").strip().lower()
        display_name = payload.display_name.strip() if payload.display_name else None

        if not username:
            raise BadRequest(
                message=t("auth", "USERNAME_REQUIRED", default="用户名不能为空"), error="USERNAME_REQUIRED"
            )
        if not email:
            raise BadRequest(message=t("auth", "EMAIL_REQUIRED", default="邮箱不能为空"), error="EMAIL_REQUIRED")

        if await User.filter(username=username).using_db(conn).exists():
            raise Conflict(message=t("auth", "USERNAME_EXISTS", default="用户名已存在"), error="USERNAME_EXISTS")
        if await User.filter(email=email).using_db(conn).exists():
            raise Conflict(message=t("auth", "EMAIL_EXISTS", default="邮箱已存在"), error="EMAIL_EXISTS")

        service._ensure_password_strength(payload.password)
        from apps.api.routers.v1.auth.security import hash_password

        password_hash = hash_password(payload.password, service.settings.auth)
        user = await User.create(
            using_db=conn,
            username=username,
            email=email,
            status=UserStatus.ACTIVE,
            display_name=display_name,
            avatar_url=None,
        )
        await UserCredential.create(using_db=conn, user_id=user.id, password_hash=password_hash)

        # A2 invariant: user can only belong to one organization.
        from apps.api.models.org_membership import OrgRole

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

        await _ensure_role_codes_have_admin_access(
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
            await invite_link.save(using_db=conn, update_fields=["uses_count", "last_used_by_user_id", "last_used_at"])
            await WorkspaceInviteLinkUseEvent.create(
                using_db=conn,
                link_id=invite_link.id,
                used_by_user_id=user.id,
                used_at=now,
                joined_membership_id=wsm.id,
            )

        accepted_user_id = user.id
        accepted_display_name = user.display_name or user.username

    tokens = await service.login(identifier=payload.username, password=payload.password)

    # Best-effort: notify inviter that the invite was accepted.
    # This must never break the onboarding flow if notification creation fails.
    if inviter_user_id is not None and accepted_user_id is not None:
        try:
            from apps.api.models.notification import NotificationCategory, NotificationRecord
            from apps.api.models.setting import SettingRecord
            from apps.api.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

            # Optional gate: allow disabling invite-related in-app notifications.
            try:
                core = await SettingRecord.get_or_none(
                    scope_type=SCOPE_TYPE_SYSTEM, scope_id=SYSTEM_SCOPE_ID, namespace="core"
                )
                v = core.value if core and isinstance(core.value, dict) else {}
                notifications_cfg = v.get("notifications")
                invite_enabled = True
                if isinstance(notifications_cfg, dict) and isinstance(notifications_cfg.get("invite_enabled"), bool):
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
            service.logger.warning(
                "Notification create failed (invite accepted)",
                error=str(exc),
                org_id=str(organization_id),
                inviter_user_id=str(inviter_user_id),
            )

    return Response.success(message=t("auth", "INVITE_ACCEPTED", default="加入工作区成功"), data=tokens)


@router.get(
    "/invitations/preview",
    response_model=ResponseModel[InvitationPreviewResult],
    dependencies=[rate_limit(*REGISTER_RATE_LIMIT)],
)
async def preview_invitation(
    token: str = Query(..., min_length=8, max_length=512, description="Invitation token."),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[InvitationPreviewResult]:
    token = (token or "").strip()
    if not token:
        raise BadRequest(
            message=t("auth", "INVITE_TOKEN_INVALID", default="邀请 Token 无效"),
            error="INVITE_TOKEN_INVALID",
        )

    now = datetime.now(UTC)
    code = verify_invite_token(settings, token=token)
    if code is None:
        raise BadRequest(
            message=t("auth", "INVITE_TOKEN_INVALID", default="邀请 Token 无效"), error="INVITE_TOKEN_INVALID"
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
            raise NotFound(message=t("auth", "INVITE_NOT_FOUND", default="邀请不存在"), error="INVITE_NOT_FOUND")
        if link.disabled_at is not None:
            raise Forbidden(message=t("auth", "INVITE_REVOKED", default="邀请已被撤销"), error="INVITE_REVOKED")
        if link.expires_at is not None and link.expires_at <= now:
            raise Forbidden(message=t("auth", "INVITE_EXPIRED", default="邀请已过期"), error="INVITE_EXPIRED")
        if link.max_uses is not None and int(link.uses_count or 0) >= int(link.max_uses):
            raise Forbidden(message=t("auth", "INVITE_REVOKED", default="邀请不可用"), error="INVITE_MAX_USES_REACHED")

        org = link.organization
        ws = link.workspace
        role_code = link.role_code
        inviter_user_id = link.created_by_user_id
        expires_at = link.expires_at
        invitation_email = None
    elif code.startswith("ei_"):
        inv = await WorkspaceEmailInvite.get_or_none(code=code).select_related("organization", "workspace")
        if inv is None:
            raise NotFound(message=t("auth", "INVITE_NOT_FOUND", default="邀请不存在"), error="INVITE_NOT_FOUND")
        if inv.revoked_at is not None:
            raise Forbidden(message=t("auth", "INVITE_REVOKED", default="邀请已被撤销"), error="INVITE_REVOKED")
        if inv.accepted_at is not None:
            raise Conflict(message=t("auth", "INVITE_REVOKED", default="邀请不可用"), error="INVITE_ALREADY_ACCEPTED")
        if inv.expires_at is not None and inv.expires_at <= now:
            raise Forbidden(message=t("auth", "INVITE_EXPIRED", default="邀请已过期"), error="INVITE_EXPIRED")

        org = inv.organization
        ws = inv.workspace
        role_code = inv.role_code
        inviter_user_id = inv.created_by_user_id
        expires_at = inv.expires_at
        invitation_email = inv.email
    else:
        raise NotFound(message=t("auth", "INVITE_NOT_FOUND", default="邀请不存在"), error="INVITE_NOT_FOUND")

    if org is None or not org.is_active:
        raise Forbidden(message=t("auth", "ORG_INACTIVE", default="组织不可用"), error="ORG_INACTIVE")
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
        from apps.api.core.i18n import get_current_locale
        from apps.api.core.rbac.service import RBACService

        rbac = RBACService(settings)
        localized = rbac.localize_role(role_obj, locale=get_current_locale())
        role_out = InvitationPreviewRoleOut(
            code=role_obj.code,
            name=str(localized.get("name") or role_obj.code),
            description=localized.get("description"),
        )

    user_exists = bool(invitation_email) and await User.filter(email=invitation_email).exists()

    out = InvitationPreviewResult(
        invitation=InvitationPreviewInvitationOut(
            email=invitation_email,
            masked_email=_mask_email(invitation_email) if invitation_email else None,
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
    return Response.success(data=out)


@router.post(
    "/invitations/accept-existing",
    response_model=ResponseModel[AcceptExistingInvitationResult],
    dependencies=[rate_limit(*REGISTER_RATE_LIMIT)],
)
async def accept_existing_invitation(
    payload: AcceptExistingInvitationRequest,
    user: User = Depends(get_current_user),
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[AcceptExistingInvitationResult]:
    token = (payload.token or "").strip()
    if not token:
        raise BadRequest(
            message=t("auth", "INVITE_TOKEN_INVALID", default="邀请 Token 无效"), error="INVITE_TOKEN_INVALID"
        )

    code = verify_invite_token(service.settings, token=token)
    if code is None:
        raise BadRequest(
            message=t("auth", "INVITE_TOKEN_INVALID", default="邀请 Token 无效"), error="INVITE_TOKEN_INVALID"
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
                raise NotFound(message=t("auth", "INVITE_NOT_FOUND", default="邀请不存在"), error="INVITE_NOT_FOUND")
            if invite_link.disabled_at is not None:
                raise Forbidden(message=t("auth", "INVITE_REVOKED", default="邀请已被撤销"), error="INVITE_REVOKED")
            if invite_link.expires_at is not None and invite_link.expires_at <= now:
                raise Forbidden(message=t("auth", "INVITE_EXPIRED", default="邀请已过期"), error="INVITE_EXPIRED")
            if invite_link.max_uses is not None and int(invite_link.uses_count or 0) >= int(invite_link.max_uses):
                raise Forbidden(
                    message=t("auth", "INVITE_REVOKED", default="邀请不可用"), error="INVITE_MAX_USES_REACHED"
                )

            organization_id = UUID(str(cast(HasOrganizationId, invite_link).organization_id))
            workspace_id = UUID(str(cast(HasWorkspaceId, invite_link).workspace_id))
            inviter_user_id = invite_link.created_by_user_id
            assigned_role_code = invite_link.role_code

            user_email = (user.email or "").strip().lower()
            if not user_email:
                raise Forbidden(message=t("auth", "EMAIL_REQUIRED", default="邮箱不能为空"), error="EMAIL_REQUIRED")
            allowed_domain = (invite_link.allowed_email_domain or "").strip().lower()
            if allowed_domain:
                allowed_domain = allowed_domain[1:] if allowed_domain.startswith("@") else allowed_domain
                if "@" not in user_email:
                    raise Forbidden(
                        message=t("auth", "INVITE_EMAIL_MISMATCH", default="邮箱不符合要求"),
                        error="INVITE_EMAIL_DOMAIN_FORBIDDEN",
                    )
                domain = user_email.split("@", 1)[1].strip().lower()
                if domain != allowed_domain:
                    raise Forbidden(
                        message=t("auth", "INVITE_EMAIL_MISMATCH", default="邮箱不符合要求"),
                        error="INVITE_EMAIL_DOMAIN_FORBIDDEN",
                    )
        elif code.startswith("ei_"):
            email_inv = await WorkspaceEmailInvite.filter(code=code).using_db(conn).select_for_update().first()
            if email_inv is None:
                raise NotFound(message=t("auth", "INVITE_NOT_FOUND", default="邀请不存在"), error="INVITE_NOT_FOUND")
            if email_inv.revoked_at is not None:
                raise Forbidden(message=t("auth", "INVITE_REVOKED", default="邀请已被撤销"), error="INVITE_REVOKED")
            if email_inv.accepted_at is not None:
                raise Conflict(
                    message=t("auth", "INVITE_REVOKED", default="邀请不可用"), error="INVITE_ALREADY_ACCEPTED"
                )
            if email_inv.expires_at is not None and email_inv.expires_at <= now:
                raise Forbidden(message=t("auth", "INVITE_EXPIRED", default="邀请已过期"), error="INVITE_EXPIRED")

            organization_id = UUID(str(cast(HasOrganizationId, email_inv).organization_id))
            workspace_id = UUID(str(cast(HasWorkspaceId, email_inv).workspace_id))
            inviter_user_id = email_inv.created_by_user_id
            assigned_role_code = email_inv.role_code

            user_email = (user.email or "").strip().lower()
            invite_email = (email_inv.email or "").strip().lower()
            if not user_email or user_email != invite_email:
                raise Forbidden(
                    message=t("auth", "INVITE_EMAIL_MISMATCH", default="邀请邮箱不匹配"), error="INVITE_EMAIL_MISMATCH"
                )
        else:
            raise NotFound(message=t("auth", "INVITE_NOT_FOUND", default="邀请不存在"), error="INVITE_NOT_FOUND")

        if organization_id is None or workspace_id is None:
            raise NotFound(message=t("auth", "INVITE_NOT_FOUND", default="邀请不存在"), error="INVITE_NOT_FOUND")

        org = await Organization.get_or_none(id=organization_id, using_db=conn)
        if org is None or not org.is_active:
            raise Forbidden(message=t("auth", "ORG_INACTIVE", default="组织不可用"), error="ORG_INACTIVE")
        ws = await Workspace.get_or_none(id=workspace_id, using_db=conn)
        if ws is None or not ws.is_active:
            raise Forbidden(message=t("errors", "NOT_FOUND", default="资源不存在"), error="WORKSPACE_INACTIVE")
        if UUID(str(cast(HasOrganizationId, ws).organization_id)) != organization_id:
            raise Forbidden(
                message=t("errors", "PERMISSION_DENIED", default="权限不足"), error="CROSS_ORG_ACCESS_DENIED"
            )

        # A2: user can only be in one org.
        existing_orgm = await OrgMembership.filter(user_id=user.id).using_db(conn).select_for_update().first()
        if existing_orgm is None:
            from apps.api.models.org_membership import OrgRole

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

        await _ensure_role_codes_have_admin_access(
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
            await invite_link.save(using_db=conn, update_fields=["uses_count", "last_used_by_user_id", "last_used_at"])
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
            from apps.api.models.notification import NotificationCategory, NotificationRecord

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
            service.logger.warning(
                "Notification create failed (invite accepted existing)",
                error=str(exc),
                org_id=str(organization_id),
                inviter_user_id=str(inviter_user_id),
            )

    if organization_id is None or workspace_id is None:
        raise ServiceUnavailable(
            message=t("errors", "SERVICE_UNAVAILABLE", default="服务不可用"), error="SERVICE_UNAVAILABLE"
        )

    return Response.success(
        message=t("auth", "INVITE_ACCEPTED", default="加入工作区成功"),
        data=AcceptExistingInvitationResult(
            organization_id=organization_id, workspace_id=workspace_id, role_code=assigned_role_code
        ),
    )
