from __future__ import annotations

from urllib.parse import urlparse

from fastapi import APIRouter, BackgroundTasks, Body, Depends, Header, Query, Request
from fastapi import Response as FastAPIResponse

from src.common.constants.assets import ASSET_SCOPE_USER
from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.exceptions import BadRequest, Forbidden, Unauthorized
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import get_current_locale, t
from src.infra.cache.valkey import get_valkey
from src.infra.limiter.limiter import rate_limit
from src.models.organization.user import User
from src.modules.assets.admin.uploads.schema import (
    UploadAbortOut,
    UploadCompleteOut,
    UploadInitOut,
    UploadPartCommitRequest,
    UploadPartPresignOut,
    UploadStatusOut,
)
from src.modules.assets.admin.uploads.service import UploadsService
from src.modules.assets.scope import AssetScope
from src.modules.auth.account_deletion.capability_service import AccountDeletionCapabilityService
from src.modules.auth.http.service import get_current_access_payload, get_current_user
from src.modules.auth.limits.service import (
    ACCOUNT_DELETE_RATE_LIMIT,
    EMAIL_CHANGE_CONFIRM_RATE_LIMIT,
    EMAIL_CHANGE_REQUEST_RATE_LIMIT,
    FORGOT_PASSWORD_RATE_LIMIT,
    LOGIN_RATE_LIMIT,
    REFRESH_RATE_LIMIT,
    REGISTER_RATE_LIMIT,
    RESET_PASSWORD_RATE_LIMIT,
    TWO_FACTOR_BACKUP_REGEN_RATE_LIMIT,
    TWO_FACTOR_CONFIRM_RATE_LIMIT,
    TWO_FACTOR_DISABLE_RATE_LIMIT,
    TWO_FACTOR_LOGIN_RATE_LIMIT,
)
from src.modules.auth.login.service import AuthLoginService
from src.modules.auth.schema import (
    AcceptExistingInvitationRequest,
    AcceptExistingInvitationResult,
    AcceptInvitationRequest,
    AvatarUploadInitRequest,
    ChangePasswordRequest,
    ConfirmMyEmailChangeRequest,
    DeleteMyAccountCapabilityOut,
    DeleteMyAccountRequest,
    ForgotPasswordRequest,
    InvitationPreviewResult,
    LoginRequest,
    LogoutRequest,
    MyInvitationListQuery,
    MyInvitationOut,
    MySecurityCapabilityOut,
    RefreshRequest,
    RegisterRequest,
    RequestMyEmailChangeOut,
    RequestMyEmailChangeRequest,
    ResetPasswordRequest,
    ResetTokenPayload,
    SetMyPasswordRequest,
    TokenPair,
    UpdateMyProfileRequest,
    UserProfile,
)
from src.modules.auth.service import AuthService
from src.modules.auth.sessions.request_context import build_auth_request_context
from src.modules.auth.sessions.schema import AuthSessionListOut, AuthSessionRevokeOthersOut
from src.modules.auth.sessions.service import AuthSessionService
from src.modules.auth.sso.router import router as auth_sso_router
from src.modules.auth.two_factor.capability_service import TwoFactorCapabilityService
from src.modules.auth.two_factor.schema import (
    TwoFactorCapabilitiesOut,
    TwoFactorConfirmOut,
    TwoFactorConfirmRequest,
    TwoFactorDisableRequest,
    TwoFactorLoginRequest,
    TwoFactorRegenerateBackupCodesOut,
    TwoFactorRegenerateBackupCodesRequest,
    TwoFactorSetupOut,
    TwoFactorSetupRequest,
    TwoFactorStatusOut,
)
from src.modules.auth.two_factor.service import AuthTwoFactorService

router = APIRouter(tags=["global.auth"])


def _get_auth_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> AuthService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    return AuthService(settings, valkey=valkey)


def _get_auth_session_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> AuthSessionService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    return AuthSessionService(settings, valkey=valkey)


def _get_auth_two_factor_service(
    settings: Settings = Depends(get_settings),
) -> AuthTwoFactorService:
    return AuthTwoFactorService(settings)


def _get_auth_two_factor_capability_service(
    settings: Settings = Depends(get_settings),
) -> TwoFactorCapabilityService:
    return TwoFactorCapabilityService(settings)


def _get_auth_login_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> AuthLoginService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    auth_service = AuthService(settings, valkey=valkey)
    two_factor_service = AuthTwoFactorService(settings)
    return AuthLoginService(settings, valkey=valkey, auth_service=auth_service, two_factor=two_factor_service)


def _get_uploads_service(settings: Settings = Depends(get_settings)) -> UploadsService:
    return UploadsService(settings)


def _user_asset_scope(user: User) -> AssetScope:
    return AssetScope(type=ASSET_SCOPE_USER, id=user.id)


def _get_platform_base_domain(settings: Settings) -> str | None:
    base_domain = (settings.saas.base_domain or "").strip().lower().lstrip(".").rstrip(".")
    if not base_domain:
        return None

    candidate_urls = (
        settings.application.frontend_base_url,
        settings.saas.admin_url,
    )
    for raw_url in candidate_urls:
        if not raw_url:
            continue
        parsed = urlparse(raw_url)
        host = (parsed.hostname or "").strip().lower().rstrip(".")
        if host == base_domain or host.endswith(f".{base_domain}"):
            return base_domain
    return None


def _get_refresh_cookie_domain(settings: Settings) -> str | None:
    override = settings.auth.cookie.domain
    if override:
        return override

    base_domain = _get_platform_base_domain(settings)
    if not base_domain:
        return None
    return f".{base_domain}"


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
    - We enforce an Origin allowlist only when a shared platform base domain is configured.

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

    base_domain = _get_platform_base_domain(settings)
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
    request: Request,
    fastapi_response: FastAPIResponse,
    service: AuthLoginService = Depends(_get_auth_login_service),
) -> ResponseModel[TokenPair]:
    """Login and issue access/refresh tokens."""
    tokens = await service.login(
        identifier=payload.username,
        password=payload.password,
        request_context=build_auth_request_context(request),
    )
    _set_refresh_cookie(
        fastapi_response,
        settings=service.settings,
        refresh_token=tokens.refresh_token,
        refresh_ttl_seconds=tokens.refresh_expires_in,
    )
    return ApiResponse.success(message=t("auth", "LOGIN_SUCCESS", default="登录成功"), data=tokens)


@router.post(
    "/login/2fa",
    response_model=ResponseModel[TokenPair],
    dependencies=[rate_limit(*TWO_FACTOR_LOGIN_RATE_LIMIT)],
    summary="Complete login with 2FA challenge token",
)
async def login_two_factor(
    payload: TwoFactorLoginRequest,
    request: Request,
    fastapi_response: FastAPIResponse,
    service: AuthLoginService = Depends(_get_auth_login_service),
) -> ResponseModel[TokenPair]:
    """Complete login with 2FA challenge token."""
    tokens = await service.complete_two_factor_login(
        two_factor_token=payload.two_factor_token,
        code=payload.code,
        backup_code=payload.backup_code,
        request_context=build_auth_request_context(request),
    )
    _set_refresh_cookie(
        fastapi_response,
        settings=service.settings,
        refresh_token=tokens.refresh_token,
        refresh_ttl_seconds=tokens.refresh_expires_in,
    )
    return ApiResponse.success(message=t("auth", "LOGIN_SUCCESS", default="登录成功"), data=tokens)


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
    """Register a new account."""
    user = await service.register_public(
        username=payload.username,
        password=payload.password,
        email=payload.email,
        display_name=payload.display_name,
    )
    profile = service.build_user_profile(user)
    if profile.email:
        locale = get_current_locale()
        background_tasks.add_task(
            service.send_welcome_email,
            recipient=profile.email,
            username=profile.username,
            user_id=profile.id,
            locale=locale,
        )
    return ApiResponse.success(message=t("auth", "REGISTER_SUCCESS", default="注册成功"), data=profile)


@router.post(
    "/refresh",
    response_model=ResponseModel[TokenPair],
    dependencies=[rate_limit(*REFRESH_RATE_LIMIT)],
    summary="Refresh access token",
)
async def refresh(
    payload: RefreshRequest,
    request: Request,
    fastapi_response: FastAPIResponse,
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[TokenPair]:
    """Refresh access token."""
    tokens = await service.refresh(
        refresh_token=payload.refresh_token,
        request_context=build_auth_request_context(request),
    )
    _set_refresh_cookie(
        fastapi_response,
        settings=service.settings,
        refresh_token=tokens.refresh_token,
        refresh_ttl_seconds=tokens.refresh_expires_in,
    )
    return ApiResponse.success(message=t("auth", "REFRESH_SUCCESS", default="刷新成功"), data=tokens)


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
    """Refresh tokens using refresh cookie."""
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
    return ApiResponse.success(message=t("auth", "REFRESH_SUCCESS", default="刷新成功"), data=tokens)


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
    """Request password reset."""
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
    return ApiResponse.success(
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
    """Reset password using token."""
    await service.reset_password(reset_token=payload.reset_token, new_password=payload.new_password)
    return ApiResponse.success(message=t("auth", "RESET_SUCCESS", default="密码重置成功"))


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
    """Change current password."""
    await service.change_password(
        user_id=user.id,
        old_password=payload.old_password,
        new_password=payload.new_password,
    )
    return ApiResponse.success(message=t("auth", "PASSWORD_CHANGED", default="密码修改成功"))


@router.post(
    "/me/set-password",
    response_model=ResponseModel[None],
    summary="Set password for current user (OAuth-only accounts)",
)
async def set_my_password(
    payload: SetMyPasswordRequest,
    user: User = Depends(get_current_user),
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[None]:
    """Set password for current user (OAuth-only accounts)."""
    await service.set_password_for_current_user(
        user_id=user.id,
        new_password=payload.new_password,
        code=payload.code,
        backup_code=payload.backup_code,
    )
    return ApiResponse.success(message=t("auth", "PASSWORD_SET", default="密码设置成功"))


@router.post(
    "/logout",
    response_model=ResponseModel[None],
    summary="Logout and revoke refresh tokens",
)
async def logout(
    payload: LogoutRequest,
    request: Request,
    fastapi_response: FastAPIResponse,
    user: User = Depends(get_current_user),
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[None]:
    """Logout and revoke refresh tokens."""
    refresh_token = payload.refresh_token
    if not refresh_token and service.settings.auth.cookie.enabled:
        refresh_token = request.cookies.get(service.settings.auth.cookie.name)
    await service.logout(user_id=user.id, refresh_token=refresh_token)
    _clear_refresh_cookie(fastapi_response, settings=service.settings)
    return ApiResponse.success(message=t("auth", "LOGOUT_SUCCESS", default="退出成功"))


@router.post(
    "/logout-all",
    response_model=ResponseModel[None],
    summary="Logout from all sessions and revoke refresh tokens",
)
async def logout_all(
    fastapi_response: FastAPIResponse,
    user: User = Depends(get_current_user),
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[None]:
    """Logout from all sessions and revoke refresh tokens."""
    await service.logout_all(user_id=user.id)
    _clear_refresh_cookie(fastapi_response, settings=service.settings)
    return ApiResponse.success(message=t("auth", "LOGOUT_SUCCESS", default="退出成功"))


@router.get(
    "/sessions",
    response_model=ResponseModel[AuthSessionListOut],
    summary="List active sessions for current user",
)
async def list_my_sessions(
    user: User = Depends(get_current_user),
    access_payload: dict[str, object] = Depends(get_current_access_payload),
    service: AuthSessionService = Depends(_get_auth_session_service),
) -> ResponseModel[AuthSessionListOut]:
    """List active sessions for current user."""
    current_sid_raw = access_payload.get("sid")
    current_sid = current_sid_raw.strip() if isinstance(current_sid_raw, str) and current_sid_raw.strip() else None
    out = await service.list_sessions(user_id=user.id, current_session_id=current_sid)
    return ApiResponse.success(data=out)


@router.post(
    "/sessions/{session_id}/revoke",
    response_model=ResponseModel[None],
    summary="Revoke a session for current user",
)
async def revoke_my_session(
    session_id: str,
    user: User = Depends(get_current_user),
    service: AuthSessionService = Depends(_get_auth_session_service),
) -> ResponseModel[None]:
    """Revoke a session for current user."""
    await service.revoke_session(user_id=user.id, session_id=session_id)
    return ApiResponse.success(message=t("auth", "SESSION_REVOKED", default="会话已撤销"))


@router.post(
    "/sessions/revoke-others",
    response_model=ResponseModel[AuthSessionRevokeOthersOut],
    summary="Revoke all sessions except current",
)
async def revoke_other_sessions(
    user: User = Depends(get_current_user),
    access_payload: dict[str, object] = Depends(get_current_access_payload),
    service: AuthSessionService = Depends(_get_auth_session_service),
) -> ResponseModel[AuthSessionRevokeOthersOut]:
    """Revoke all sessions except current."""
    current_sid_raw = access_payload.get("sid")
    current_sid = current_sid_raw.strip() if isinstance(current_sid_raw, str) and current_sid_raw.strip() else None
    if not current_sid:
        raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="CURRENT_SESSION_MISSING")
    revoked_count = await service.revoke_other_sessions(user_id=user.id, current_session_id=current_sid)
    return ApiResponse.success(data=AuthSessionRevokeOthersOut(revoked_count=revoked_count))


@router.get(
    "/2fa",
    response_model=ResponseModel[TwoFactorStatusOut],
    summary="Get 2FA status for current user",
)
async def get_two_factor_status(
    user: User = Depends(get_current_user),
    service: AuthTwoFactorService = Depends(_get_auth_two_factor_service),
) -> ResponseModel[TwoFactorStatusOut]:
    """Get 2FA status for current user."""
    enabled, backup_codes_remaining = await service.get_status(user_id=user.id)
    return ApiResponse.success(data=TwoFactorStatusOut(enabled=enabled, backup_codes_remaining=backup_codes_remaining))


@router.get(
    "/2fa/capabilities",
    response_model=ResponseModel[TwoFactorCapabilitiesOut],
    summary="Get 2FA capabilities for current user",
)
async def get_two_factor_capabilities(
    user: User = Depends(get_current_user),
    service: TwoFactorCapabilityService = Depends(_get_auth_two_factor_capability_service),
) -> ResponseModel[TwoFactorCapabilitiesOut]:
    """Get 2FA capabilities for current user."""
    out = await service.get_capabilities(user_id=user.id)
    return ApiResponse.success(data=out)


@router.post(
    "/2fa/setup",
    response_model=ResponseModel[TwoFactorSetupOut],
    summary="Start 2FA (TOTP) setup for current user",
)
async def begin_two_factor_setup(
    payload: TwoFactorSetupRequest | None = Body(default=None),
    user: User = Depends(get_current_user),
    service: AuthTwoFactorService = Depends(_get_auth_two_factor_service),
) -> ResponseModel[TwoFactorSetupOut]:
    """Start 2FA (TOTP) setup for current user."""
    issuer = service.settings.application.app_name
    account_label = user.email or user.username
    secret, otpauth_uri = await service.begin_setup(
        user_id=user.id,
        issuer=issuer,
        account_label=account_label,
        password=payload.password if payload is not None else None,
    )
    return ApiResponse.success(data=TwoFactorSetupOut(secret=secret, otpauth_uri=otpauth_uri))


@router.post(
    "/2fa/confirm",
    response_model=ResponseModel[TwoFactorConfirmOut],
    dependencies=[rate_limit(*TWO_FACTOR_CONFIRM_RATE_LIMIT)],
    summary="Confirm 2FA setup (TOTP code required)",
)
async def confirm_two_factor_setup(
    payload: TwoFactorConfirmRequest,
    user: User = Depends(get_current_user),
    service: AuthTwoFactorService = Depends(_get_auth_two_factor_service),
) -> ResponseModel[TwoFactorConfirmOut]:
    """Confirm 2FA setup (TOTP code required)."""
    codes = await service.confirm_setup(user_id=user.id, code=payload.code)
    return ApiResponse.success(data=TwoFactorConfirmOut(backup_codes=codes))


@router.post(
    "/2fa/disable",
    response_model=ResponseModel[None],
    dependencies=[rate_limit(*TWO_FACTOR_DISABLE_RATE_LIMIT)],
    summary="Disable 2FA (TOTP or backup code required)",
)
async def disable_two_factor(
    payload: TwoFactorDisableRequest,
    user: User = Depends(get_current_user),
    service: AuthTwoFactorService = Depends(_get_auth_two_factor_service),
) -> ResponseModel[None]:
    """Disable 2FA (TOTP or backup code required)."""
    await service.disable(user_id=user.id, code=payload.code, backup_code=payload.backup_code)
    return ApiResponse.success(message=t("auth", "TWO_FACTOR_DISABLED", default="2FA 已禁用"))


@router.post(
    "/2fa/backup-codes/regenerate",
    response_model=ResponseModel[TwoFactorRegenerateBackupCodesOut],
    dependencies=[rate_limit(*TWO_FACTOR_BACKUP_REGEN_RATE_LIMIT)],
    summary="Regenerate 2FA backup codes (TOTP or backup code required)",
)
async def regenerate_two_factor_backup_codes(
    payload: TwoFactorRegenerateBackupCodesRequest,
    user: User = Depends(get_current_user),
    service: AuthTwoFactorService = Depends(_get_auth_two_factor_service),
) -> ResponseModel[TwoFactorRegenerateBackupCodesOut]:
    """Regenerate 2FA backup codes (TOTP or backup code required)."""
    codes = await service.regenerate_backup_codes(user_id=user.id, code=payload.code, backup_code=payload.backup_code)
    return ApiResponse.success(data=TwoFactorRegenerateBackupCodesOut(backup_codes=codes))


@router.get(
    "/me",
    response_model=ResponseModel[UserProfile],
    summary="Get current user profile",
)
async def me(
    user: User = Depends(get_current_user),
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[UserProfile]:
    """Get current user profile."""
    profile = service.build_user_profile(user)
    return ApiResponse.success(data=profile)


@router.get(
    "/me/security-capabilities",
    response_model=ResponseModel[MySecurityCapabilityOut],
    summary="Get security capabilities for current user",
)
async def get_my_security_capabilities(
    user: User = Depends(get_current_user),
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[MySecurityCapabilityOut]:
    """Get security capabilities for current user."""
    out = await service.get_my_security_capabilities(user_id=user.id)
    return ApiResponse.success(data=out)


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
    """Update current user profile."""
    profile = await service.update_my_profile(user=user, payload=payload)
    return ApiResponse.success(message=t("auth", "PROFILE_UPDATED", default="资料已更新"), data=profile)


@router.post(
    "/me/avatar/uploads/init",
    response_model=ResponseModel[UploadInitOut],
    summary="Initialize avatar upload (current user)",
)
async def init_avatar_upload(
    payload: AvatarUploadInitRequest,
    user: User = Depends(get_current_user),
    service: UploadsService = Depends(_get_uploads_service),
) -> ResponseModel[UploadInitOut]:
    """Initialize avatar upload (current user)."""
    session = await service.init_upload(
        scope=_user_asset_scope(user),
        actor_user_id=user.id,
        purpose="avatar",
        filename=payload.filename,
        mime=payload.mime,
        size_bytes=payload.size_bytes,
        expected_sha256=payload.expected_sha256,
        requested_visibility=None,
        requested_indexable=None,
        target_folder_id=None,
    )
    return ApiResponse.success(
        data=UploadInitOut(
            upload_id=session.id,
            chunk_size=session.chunk_size,
            total_parts=session.total_parts,
            expires_at=session.expires_at,
            method=session.storage_provider if session.storage_provider != "s3" else "s3_multipart",
            reserved_asset_id=session.reserved_asset_id,
            object_key=session.object_key,
        )
    )


@router.get(
    "/me/avatar/uploads/{upload_id}",
    response_model=ResponseModel[UploadStatusOut],
    summary="Get avatar upload status (current user)",
)
async def get_avatar_upload_status(
    upload_id: PublicUUID,
    user: User = Depends(get_current_user),
    service: UploadsService = Depends(_get_uploads_service),
) -> ResponseModel[UploadStatusOut]:
    """Get avatar upload status (current user)."""
    session, missing = await service.get_status(upload_id=upload_id, scope=_user_asset_scope(user))
    return ApiResponse.success(
        data=UploadStatusOut(
            upload_id=session.id,
            status=str(session.status),
            missing_parts=missing,
            uploaded_parts=(int(session.total_parts) - len(missing)),
            total_parts=int(session.total_parts),
        )
    )


@router.put(
    "/me/avatar/uploads/{upload_id}/parts/{part_number}",
    response_model=ResponseModel[None],
    summary="Upload avatar part (current user)",
)
async def upload_avatar_part(
    request: Request,
    upload_id: PublicUUID,
    part_number: int,
    user: User = Depends(get_current_user),
    service: UploadsService = Depends(_get_uploads_service),
    content_length: int | None = Header(default=None, alias="Content-Length"),
) -> ResponseModel[None]:
    """Upload avatar part (current user)."""
    data = await request.body()
    if content_length is not None and content_length != len(data):
        raise BadRequest(
            message=t("errors", "UPLOAD_BODY_INVALID", default="上传内容不合法"), error="UPLOAD_BODY_INVALID"
        )

    await service.put_part(upload_id=upload_id, scope=_user_asset_scope(user), part_number=part_number, data=data)
    return ApiResponse.success(data=None)


@router.post(
    "/me/avatar/uploads/{upload_id}/complete",
    response_model=ResponseModel[UploadCompleteOut],
    summary="Complete avatar upload (current user)",
)
async def complete_avatar_upload(
    background_tasks: BackgroundTasks,
    upload_id: PublicUUID,
    user: User = Depends(get_current_user),
    service: UploadsService = Depends(_get_uploads_service),
) -> ResponseModel[UploadCompleteOut]:
    """Complete avatar upload (current user)."""
    asset_id = await service.complete(
        upload_id=upload_id, scope=_user_asset_scope(user), background_tasks=background_tasks
    )
    return ApiResponse.success(data=UploadCompleteOut(asset_id=asset_id))


@router.post(
    "/me/avatar/uploads/{upload_id}/abort",
    response_model=ResponseModel[UploadAbortOut],
    summary="Abort avatar upload (current user)",
)
async def abort_avatar_upload(
    upload_id: PublicUUID,
    user: User = Depends(get_current_user),
    service: UploadsService = Depends(_get_uploads_service),
) -> ResponseModel[UploadAbortOut]:
    """Abort avatar upload (current user)."""
    session = await service.abort(upload_id=upload_id, scope=_user_asset_scope(user))
    return ApiResponse.success(data=UploadAbortOut(upload_id=session.id, status=str(session.status)))


@router.post(
    "/me/avatar/uploads/{upload_id}/parts/{part_number}/presign",
    response_model=ResponseModel[UploadPartPresignOut],
    summary="Presign avatar upload part (current user)",
)
async def presign_avatar_upload_part(
    upload_id: PublicUUID,
    part_number: int,
    user: User = Depends(get_current_user),
    service: UploadsService = Depends(_get_uploads_service),
) -> ResponseModel[UploadPartPresignOut]:
    """Presign avatar upload part (current user)."""
    out = await service.presign_part(upload_id=upload_id, scope=_user_asset_scope(user), part_number=part_number)
    return ApiResponse.success(data=out)


@router.post(
    "/me/avatar/uploads/{upload_id}/parts/{part_number}/commit",
    response_model=ResponseModel[None],
    summary="Commit avatar upload part (current user)",
)
async def commit_avatar_upload_part(
    upload_id: PublicUUID,
    part_number: int,
    payload: UploadPartCommitRequest,
    user: User = Depends(get_current_user),
    service: UploadsService = Depends(_get_uploads_service),
) -> ResponseModel[None]:
    """Commit avatar upload part (current user)."""
    await service.commit_part(
        upload_id=upload_id,
        scope=_user_asset_scope(user),
        part_number=part_number,
        etag=payload.etag,
        size_bytes=payload.size_bytes,
    )
    return ApiResponse.success(data=None)


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
    """Request email change verification code."""
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
    return ApiResponse.success(
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
    """Confirm email change."""
    profile = await service.confirm_email_change(
        user=user,
        new_email=str(payload.new_email),
        code=payload.code,
        password=payload.password,
        two_factor_code=payload.two_factor_code,
        backup_code=payload.backup_code,
    )
    return ApiResponse.success(message=t("auth", "EMAIL_CHANGED", default="邮箱已更新"), data=profile)


@router.get(
    "/me/delete-capabilities",
    response_model=ResponseModel[DeleteMyAccountCapabilityOut],
    summary="Get delete-account capabilities for current user",
)
async def get_delete_my_account_capabilities(
    user: User = Depends(get_current_user),
    two_factor_service: AuthTwoFactorService = Depends(_get_auth_two_factor_service),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[DeleteMyAccountCapabilityOut]:
    """Get delete-account capabilities for current user."""
    service = AccountDeletionCapabilityService(settings)
    out = await service.get_capabilities(
        user=user,
        two_factor_enabled=await two_factor_service.is_enabled(user_id=user.id),
    )
    return ApiResponse.success(data=out)


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
    """Delete current account."""
    await service.delete_my_account(
        user=user,
        email=str(payload.email),
        password=payload.password,
        code=payload.code,
        backup_code=payload.backup_code,
    )
    return ApiResponse.success(message=t("auth", "ACCOUNT_DELETED", default="账号已删除"))


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
    return ApiResponse.success(data=page)


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
    """Accept invitation and create account."""
    tokens = await service.accept_invitation(payload=payload)
    return ApiResponse.success(message=t("auth", "INVITE_ACCEPTED", default="加入工作区成功"), data=tokens)


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
    """Preview invitation details."""
    out = await service.preview_invitation(token=token)
    return ApiResponse.success(data=out)


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
    """Accept invitation for existing account."""
    result = await service.accept_existing_invitation(payload=payload, user=user)
    return ApiResponse.success(
        message=t("auth", "INVITE_ACCEPTED", default="加入工作区成功"),
        data=result,
    )


# Social login / SSO extensions (provided by plugins).
router.include_router(auth_sso_router)
