from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Request

from apps.api.config import Settings, get_settings
from apps.api.core.database.valkey import get_valkey
from apps.api.core.limiter import rate_limit
from apps.api.core.response import Response, ResponseModel
from apps.api.models.user import User
from apps.api.routers.v1.auth.constants import (
    FORGOT_PASSWORD_RATE_LIMIT,
    LOGIN_RATE_LIMIT,
    REFRESH_RATE_LIMIT,
    REGISTER_RATE_LIMIT,
    RESET_PASSWORD_RATE_LIMIT,
)
from apps.api.routers.v1.auth.deps import get_current_user
from apps.api.routers.v1.auth.schema import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    ResetTokenPayload,
    TokenPair,
    UserProfile,
)
from apps.api.routers.v1.auth.services import AuthService

router = APIRouter(tags=["auth"])


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
    return Response.success(message="登录成功", data=tokens)


@router.post(
    "/register",
    response_model=ResponseModel[UserProfile],
    dependencies=[rate_limit(*REGISTER_RATE_LIMIT)],
)
async def register(
    payload: RegisterRequest,
    background_tasks: BackgroundTasks,
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[UserProfile]:
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
        background_tasks.add_task(
            service.send_welcome_email,
            recipient=user.email,
            username=user.username,
            user_id=user.id,
        )
    return Response.success(message="注册成功", data=profile)


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
    return Response.success(message="刷新成功", data=tokens)


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
        background_tasks.add_task(
            service.send_reset_email,
            recipient=recipient,
            reset_token=token,
            expires_in=ttl,
            user_id=user_id,
        )
    return Response.success(message="如账号存在则将发送重置码至指定邮箱", data=token_payload)


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
    return Response.success(message="密码重置成功")


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
    return Response.success(message="密码修改成功")


@router.post("/logout", response_model=ResponseModel[None])
async def logout(
    payload: LogoutRequest,
    user: User = Depends(get_current_user),
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[None]:
    await service.logout(user_id=user.id, refresh_token=payload.refresh_token)
    return Response.success(message="退出成功")


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
