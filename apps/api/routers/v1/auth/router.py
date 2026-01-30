from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from tortoise.transactions import in_transaction

from apps.api.common.schemas import AuthzSnapshot
from apps.api.config import Settings, get_settings
from apps.api.core.authz import get_authz_snapshot_provider, require_permission_strict
from apps.api.core.exceptions import BadRequest, Conflict, Forbidden, NotFound, ServiceUnavailable
from apps.api.core.http.pagination import PageData, PageParams, get_page_params, paginate_items
from apps.api.core.http.response import Response, ResponseModel
from apps.api.core.i18n import get_current_locale, t
from apps.api.core.organization.invitations import hash_invite_token
from apps.api.core.organization.repository import OrganizationRepository
from apps.api.infra.cache.valkey import get_valkey
from apps.api.infra.limiter.limiter import rate_limit
from apps.api.models.invitation import OrganizationInvitation
from apps.api.models.organization import Membership, MembershipStatus, Organization
from apps.api.models.rbac import MembershipRole, Role
from apps.api.models.user import User, UserCredential, UserStatus
from apps.api.routers.v1.auth.constants import (
    FORGOT_PASSWORD_RATE_LIMIT,
    LOGIN_RATE_LIMIT,
    REFRESH_RATE_LIMIT,
    REGISTER_RATE_LIMIT,
    RESET_PASSWORD_RATE_LIMIT,
)
from apps.api.routers.v1.auth.deps import get_current_user
from apps.api.routers.v1.auth.schema import (
    AcceptInvitationRequest,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    MyOrganizationOut,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    ResetTokenPayload,
    TokenPair,
    UserProfile,
)
from apps.api.routers.v1.auth.services import AuthService

router = APIRouter(tags=["Services: Auth Service"])


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


@router.get("/me/orgs", response_model=ResponseModel[PageData[MyOrganizationOut]])
async def me_orgs(
    user: User = Depends(get_current_user),
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[MyOrganizationOut]]:
    """
    List organizations the current user belongs to.

    This endpoint is primarily used by the admin frontend to implement org selection (strategy B).
    """

    repo = OrganizationRepository()
    memberships = await repo.list_user_memberships_with_org(user_id=user.id)
    items: list[MyOrganizationOut] = []
    for membership in memberships:
        org = membership.organization
        items.append(
            MyOrganizationOut(
                organization_id=org.id,
                slug=org.slug,
                name=org.name,
                logo_url=org.logo_url,
                is_active=org.is_active,
                membership_id=membership.id,
                membership_status=membership.status,
            )
        )
    return Response.success(data=paginate_items(items, params=params))


@router.get(
    "/me/authz",
    response_model=ResponseModel[AuthzSnapshot],
    dependencies=[require_permission_strict("admin:access")],
)
async def me_authz(
    user: User = Depends(get_current_user),
) -> ResponseModel[AuthzSnapshot]:
    provider = get_authz_snapshot_provider()
    if provider is None:
        raise ServiceUnavailable(
            message=t("errors", "AUTHZ_ENGINE_UNAVAILABLE", default="鉴权引擎不可用"),
            error="AUTHZ_ENGINE_UNAVAILABLE",
        )
    payload = await provider.get_snapshot(user.id)
    return Response.success(data=AuthzSnapshot.model_validate(payload))


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

    now = datetime.now(UTC)
    token_hash = hash_invite_token(token)

    # Make invitation acceptance atomic:
    # - lock invitation row (FOR UPDATE)
    # - create user + membership + role bindings
    # - mark invitation accepted
    # Any failure rolls back and leaves no "half-created" user behind.
    async with in_transaction() as conn:
        inv = await OrganizationInvitation.filter(token_hash=token_hash).using_db(conn).select_for_update().first()
        if inv is None:
            raise NotFound(message=t("auth", "INVITE_NOT_FOUND", default="邀请不存在"), error="INVITE_NOT_FOUND")

        if inv.revoked_at is not None:
            raise Forbidden(message=t("auth", "INVITE_REVOKED", default="邀请已被撤销"), error="INVITE_REVOKED")
        if inv.accepted_at is not None:
            raise Conflict(
                message=t("auth", "INVITE_ALREADY_ACCEPTED", default="邀请已被使用"),
                error="INVITE_ALREADY_ACCEPTED",
            )
        if inv.expires_at is not None and inv.expires_at <= now:
            raise Forbidden(message=t("auth", "INVITE_EXPIRED", default="邀请已过期"), error="INVITE_EXPIRED")

        # NOTE: avoid `select_related("organization")` here because it can introduce an OUTER JOIN.
        # Postgres forbids applying `FOR UPDATE` to the nullable side of an outer join.
        organization_id = UUID(str(inv.organization_id))
        org = await Organization.get_or_none(id=organization_id, using_db=conn)
        if org is None or not org.is_active:
            raise Forbidden(message=t("auth", "ORG_INACTIVE", default="组织不可用"), error="ORG_INACTIVE")

        username = payload.username.strip()
        email = (inv.email or "").strip().lower()
        display_name = payload.display_name.strip() if payload.display_name else None

        if not username:
            raise BadRequest(
                message=t("auth", "USERNAME_REQUIRED", default="用户名不能为空"), error="USERNAME_REQUIRED"
            )
        if not email:
            raise BadRequest(message=t("auth", "EMAIL_REQUIRED", default="邮箱不能为空"), error="EMAIL_REQUIRED")

        # Enforce uniqueness inside the same transaction to avoid races.
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

        membership, _created = await Membership.get_or_create(
            using_db=conn,
            user_id=user.id,
            organization_id=org.id,
            defaults={"status": MembershipStatus.ACTIVE, "invited_by_user_id": inv.invited_by_user_id},
        )
        if membership.status != MembershipStatus.ACTIVE:
            membership.status = MembershipStatus.ACTIVE
            await membership.save(using_db=conn, update_fields=["status"])

        # Role binding strategy:
        # - If invitation provides a role_code, bind it.
        # - Otherwise, bind all default roles (is_default=True).
        roles: list[Role] = []
        if inv.role_code:
            role = await Role.get_or_none(code=inv.role_code, using_db=conn)
            if role is not None:
                roles = [role]
        else:
            roles = await Role.filter(is_default=True).using_db(conn).all()

        for role in roles:
            await MembershipRole.get_or_create(using_db=conn, membership_id=membership.id, role_id=role.id)

        inv.accepted_by_user_id = user.id
        inv.accepted_at = now
        await inv.save(using_db=conn, update_fields=["accepted_by_user_id", "accepted_at"])

    tokens = await service.login(identifier=payload.username, password=payload.password)
    return Response.success(message=t("auth", "INVITE_ACCEPTED", default="加入组织成功"), data=tokens)
