from __future__ import annotations

from urllib.parse import urlparse

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from fastapi import Response as FastAPIResponse

from apps.api.src.config import Settings, get_settings
from apps.api.src.core.exceptions import BadRequest, Forbidden, Unauthorized
from apps.api.src.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.core.i18n import get_current_locale, t
from apps.api.src.infra.cache.valkey import get_valkey
from apps.api.src.infra.limiter.limiter import rate_limit
from apps.api.src.modules.auth.constants import (
    ACCOUNT_DELETE_RATE_LIMIT,
    EMAIL_CHANGE_CONFIRM_RATE_LIMIT,
    EMAIL_CHANGE_REQUEST_RATE_LIMIT,
    FORGOT_PASSWORD_RATE_LIMIT,
    LOGIN_RATE_LIMIT,
    REFRESH_RATE_LIMIT,
    REGISTER_RATE_LIMIT,
    RESET_PASSWORD_RATE_LIMIT,
)
from apps.api.src.modules.auth.deps import get_current_user
from apps.api.src.modules.auth.schema import (
    AcceptExistingInvitationRequest,
    AcceptExistingInvitationResult,
    AcceptInvitationRequest,
    ChangePasswordRequest,
    ConfirmMyEmailChangeRequest,
    DeleteMyAccountRequest,
    ForgotPasswordRequest,
    InvitationPreviewResult,
    LoginRequest,
    LogoutRequest,
    MyInvitationListQuery,
    MyInvitationOut,
    RefreshRequest,
    RegisterRequest,
    RequestMyEmailChangeOut,
    RequestMyEmailChangeRequest,
    ResetPasswordRequest,
    ResetTokenPayload,
    TokenPair,
    UpdateMyProfileRequest,
    UserProfile,
)
from apps.api.src.modules.auth.service import AuthService
from apps.api.src.modules.auth.sso.router import router as auth_sso_router
from apps.api.src.modules.organization.models.user import User

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


def _get_refresh_cookie_domain(settings: Settings) -> str | None:
    override = settings.auth.cookie.domain
    if override:
        return override

    if settings.application.deployment_mode != "saas":
        return None

    base_domain = (settings.saas.base_domain or "").strip()
    if not base_domain:
        return None
    return f".{base_domain.lstrip('.')}"


def _set_refresh_cookie(
    fastapi_response: FastAPIResponse,
    *,
    settings: Settings,
    refresh_token: str,
    refresh_ttl_seconds: int,
) -> None:
    if not settings.auth.cookie.enabled:
        return
    fastapi_response.set_cookie(
        settings.auth.cookie.name,
        refresh_token,
        httponly=True,
        secure=settings.auth.cookie.secure,
        samesite=settings.auth.cookie.samesite,  # type: ignore[arg-type]
        domain=_get_refresh_cookie_domain(settings),
        path="/",
        max_age=refresh_ttl_seconds,
    )


def _clear_refresh_cookie(
    fastapi_response: FastAPIResponse,
    *,
    settings: Settings,
) -> None:
    if not settings.auth.cookie.enabled:
        return
    fastapi_response.delete_cookie(
        settings.auth.cookie.name,
        domain=_get_refresh_cookie_domain(settings),
        path="/",
    )


def _enforce_refresh_cookie_origin_policy(request: Request, *, settings: Settings) -> None:
    """
    Basic CSRF mitigation for cookie-based refresh.

    Rationale:
    - `/auth/refresh-cookie` authenticates via a browser cookie.
    - When cookies are used for authentication, CSRF becomes relevant.
    - We enforce an Origin allowlist based on the configured SaaS base domain.

    Notes:
    - We keep this intentionally minimal and only apply it to the refresh-cookie endpoint.
    - If you ever switch to `SameSite=None`, consider enabling a full CSRF middleware.
    """

    if not settings.auth.cookie.enabled:
        return

    origin = (request.headers.get("origin") or "").strip()
    if not origin:
        raise Forbidden(
            message=t("auth", "CSRF_ORIGIN_REQUIRED", default="Origin header is required for refresh-cookie."),
            error="CSRF_ORIGIN_REQUIRED",
        )

    parsed = urlparse(origin)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise Forbidden(
            message=t("auth", "CSRF_ORIGIN_INVALID", default="Origin is invalid for refresh-cookie."),
            error="CSRF_ORIGIN_INVALID",
        )

    if settings.application.deployment_mode != "saas":
        return

    base_domain = (settings.saas.base_domain or "").strip().lower().lstrip(".").rstrip(".")
    if not base_domain:
        return

    host = parsed.hostname.strip().lower().rstrip(".")
    if host == base_domain or host.endswith(f".{base_domain}"):
        return

    raise Forbidden(
        message=t("auth", "CSRF_ORIGIN_NOT_ALLOWED", default="Origin is not allowed for refresh-cookie."),
        error="CSRF_ORIGIN_NOT_ALLOWED",
    )


@router.post(
    "/login",
    response_model=ResponseModel[TokenPair],
    dependencies=[rate_limit(*LOGIN_RATE_LIMIT)],
    summary="Login and issue access/refresh tokens",
)
async def login(
    payload: LoginRequest,
    fastapi_response: FastAPIResponse,
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[TokenPair]:
    tokens = await service.login(identifier=payload.username, password=payload.password)
    _set_refresh_cookie(
        fastapi_response,
        settings=service.settings,
        refresh_token=tokens.refresh_token,
        refresh_ttl_seconds=tokens.refresh_expires_in,
    )
    return Response.success(message=t("auth", "LOGIN_SUCCESS", default="登录成功"), data=tokens)


@router.post(
    "/register",
    response_model=ResponseModel[UserProfile],
    dependencies=[rate_limit(*REGISTER_RATE_LIMIT)],
    summary="Register a new account",
)
async def register(
    payload: RegisterRequest,
    background_tasks: BackgroundTasks,
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[UserProfile]:
    user = await service.register_public(
        username=payload.username,
        password=payload.password,
        email=payload.email,
        display_name=payload.display_name,
    )
    profile = service.build_user_profile(user)
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
    summary="Refresh access token",
)
async def refresh(
    payload: RefreshRequest,
    fastapi_response: FastAPIResponse,
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[TokenPair]:
    tokens = await service.refresh(refresh_token=payload.refresh_token)
    _set_refresh_cookie(
        fastapi_response,
        settings=service.settings,
        refresh_token=tokens.refresh_token,
        refresh_ttl_seconds=tokens.refresh_expires_in,
    )
    return Response.success(message=t("auth", "REFRESH_SUCCESS", default="刷新成功"), data=tokens)


@router.post(
    "/refresh-cookie",
    response_model=ResponseModel[TokenPair],
    dependencies=[rate_limit(*REFRESH_RATE_LIMIT)],
    summary="Refresh tokens using refresh cookie",
)
async def refresh_cookie(
    request: Request,
    fastapi_response: FastAPIResponse,
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[TokenPair]:
    settings = service.settings
    if not settings.auth.cookie.enabled:
        raise BadRequest(
            message=t("auth", "REFRESH_COOKIE_DISABLED", default="Refresh cookie is not enabled."),
            error="REFRESH_COOKIE_DISABLED",
        )

    _enforce_refresh_cookie_origin_policy(request, settings=settings)

    raw = request.cookies.get(settings.auth.cookie.name)
    if not raw:
        raise Unauthorized(
            message=t("auth", "REFRESH_COOKIE_MISSING", default="Refresh cookie is missing."),
            error="REFRESH_COOKIE_MISSING",
        )

    tokens = await service.refresh(refresh_token=raw)
    _set_refresh_cookie(
        fastapi_response,
        settings=settings,
        refresh_token=tokens.refresh_token,
        refresh_ttl_seconds=tokens.refresh_expires_in,
    )
    return Response.success(message=t("auth", "REFRESH_SUCCESS", default="刷新成功"), data=tokens)


@router.post(
    "/forgot-password",
    response_model=ResponseModel[ResetTokenPayload],
    dependencies=[rate_limit(*FORGOT_PASSWORD_RATE_LIMIT)],
    summary="Request password reset",
)
async def forgot_password(
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[ResetTokenPayload]:
    token_payload, issued = await service.request_password_reset(identifier=payload.identifier)
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
    summary="Reset password using token",
)
async def reset_password(
    payload: ResetPasswordRequest,
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[None]:
    await service.reset_password(reset_token=payload.reset_token, new_password=payload.new_password)
    return Response.success(message=t("auth", "RESET_SUCCESS", default="密码重置成功"))


@router.post(
    "/change-password",
    response_model=ResponseModel[None],
    summary="Change current password",
)
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


@router.post(
    "/logout",
    response_model=ResponseModel[None],
    summary="Logout and revoke refresh tokens",
)
async def logout(
    payload: LogoutRequest,
    fastapi_response: FastAPIResponse,
    user: User = Depends(get_current_user),
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[None]:
    await service.logout(user_id=user.id, refresh_token=payload.refresh_token)
    _clear_refresh_cookie(fastapi_response, settings=service.settings)
    return Response.success(message=t("auth", "LOGOUT_SUCCESS", default="退出成功"))


@router.get(
    "/me",
    response_model=ResponseModel[UserProfile],
    summary="Get current user profile",
)
async def me(
    user: User = Depends(get_current_user),
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[UserProfile]:
    profile = service.build_user_profile(user)
    return Response.success(data=profile)


@router.patch(
    "/me",
    response_model=ResponseModel[UserProfile],
    summary="Update current user profile",
)
async def update_me(
    payload: UpdateMyProfileRequest,
    user: User = Depends(get_current_user),
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[UserProfile]:
    profile = await service.update_my_profile(user=user, payload=payload)
    return Response.success(message=t("auth", "PROFILE_UPDATED", default="资料已更新"), data=profile)


@router.post(
    "/me/email/request",
    response_model=ResponseModel[RequestMyEmailChangeOut],
    dependencies=[rate_limit(*EMAIL_CHANGE_REQUEST_RATE_LIMIT)],
    summary="Request email change verification code",
)
async def request_email_change(
    payload: RequestMyEmailChangeRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[RequestMyEmailChangeOut]:
    code, ttl, new_email = await service.request_email_change(user=user, new_email=str(payload.new_email))
    locale = get_current_locale()
    background_tasks.add_task(
        service.send_email_change_code,
        recipient=new_email,
        code=code,
        expires_in=ttl,
        user_id=user.id,
        locale=locale,
    )
    return Response.success(
        message=t("auth", "EMAIL_CODE_SENT", default="验证码已发送"),
        data=RequestMyEmailChangeOut(expires_in=ttl),
    )


@router.post(
    "/me/email/confirm",
    response_model=ResponseModel[UserProfile],
    dependencies=[rate_limit(*EMAIL_CHANGE_CONFIRM_RATE_LIMIT)],
    summary="Confirm email change",
)
async def confirm_email_change(
    payload: ConfirmMyEmailChangeRequest,
    user: User = Depends(get_current_user),
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[UserProfile]:
    profile = await service.confirm_email_change(
        user=user,
        new_email=str(payload.new_email),
        code=payload.code,
        password=payload.password,
    )
    return Response.success(message=t("auth", "EMAIL_CHANGED", default="邮箱已更新"), data=profile)


@router.post(
    "/me/delete",
    response_model=ResponseModel[None],
    dependencies=[rate_limit(*ACCOUNT_DELETE_RATE_LIMIT)],
    summary="Delete current account",
)
async def delete_my_account(
    payload: DeleteMyAccountRequest,
    user: User = Depends(get_current_user),
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[None]:
    await service.delete_my_account(user=user, email=str(payload.email), password=payload.password)
    return Response.success(message=t("auth", "ACCOUNT_DELETED", default="账号已删除"))


@router.get(
    "/me/invitations",
    response_model=ResponseModel[PageData[MyInvitationOut]],
    summary="List invitations for current user",
)
async def me_invitations(
    user: User = Depends(get_current_user),
    params: PageParams = Depends(get_page_params),
    filters: MyInvitationListQuery = Depends(),
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[PageData[MyInvitationOut]]:
    """
    List invitations sent to the current user (email-bound).

    Semantics:
    - pending: invitations to my email that are not accepted/revoked/expired
    - accepted: invitations accepted by me
    """

    page = await service.list_my_invitations(user=user, params=params, filters=filters)
    return Response.success(data=page)


@router.post(
    "/invitations/accept",
    response_model=ResponseModel[TokenPair],
    dependencies=[rate_limit(*REGISTER_RATE_LIMIT)],
    summary="Accept invitation and create account",
)
async def accept_invitation(
    payload: AcceptInvitationRequest,
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[TokenPair]:
    tokens = await service.accept_invitation(payload=payload)
    return Response.success(message=t("auth", "INVITE_ACCEPTED", default="加入工作区成功"), data=tokens)


@router.get(
    "/invitations/preview",
    response_model=ResponseModel[InvitationPreviewResult],
    dependencies=[rate_limit(*REGISTER_RATE_LIMIT)],
    summary="Preview invitation details",
)
async def preview_invitation(
    token: str = Query(..., min_length=8, max_length=512, description="Invitation token."),
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[InvitationPreviewResult]:
    out = await service.preview_invitation(token=token)
    return Response.success(data=out)


@router.post(
    "/invitations/accept-existing",
    response_model=ResponseModel[AcceptExistingInvitationResult],
    dependencies=[rate_limit(*REGISTER_RATE_LIMIT)],
    summary="Accept invitation for existing account",
)
async def accept_existing_invitation(
    payload: AcceptExistingInvitationRequest,
    user: User = Depends(get_current_user),
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[AcceptExistingInvitationResult]:
    result = await service.accept_existing_invitation(payload=payload, user=user)
    return Response.success(
        message=t("auth", "INVITE_ACCEPTED", default="加入工作区成功"),
        data=result,
    )


# Social login / SSO extensions (provided by plugins).
router.include_router(auth_sso_router)
