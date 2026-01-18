from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from apps.api.config import Settings, get_settings
from apps.api.core.database.valkey import get_valkey
from apps.api.core.response import Response, ResponseModel
from apps.api.models.user import User
from apps.api.routers.v1.auth.deps import get_current_user
from apps.api.routers.v1.auth.schema import (
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
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


@router.post("/login", response_model=ResponseModel[TokenPair])
async def login(
    payload: LoginRequest,
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[TokenPair]:
    tokens = await service.login(identifier=payload.identifier, password=payload.password)
    return Response.success(message="登录成功", data=tokens)


@router.post("/refresh", response_model=ResponseModel[TokenPair])
async def refresh(
    payload: RefreshRequest,
    service: AuthService = Depends(_get_auth_service),
) -> ResponseModel[TokenPair]:
    tokens = await service.refresh(refresh_token=payload.refresh_token)
    return Response.success(message="刷新成功", data=tokens)


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
        phone=user.phone,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
    )
    return Response.success(data=profile)
