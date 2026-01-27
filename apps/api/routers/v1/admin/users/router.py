from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.common.schemas import AuthzSnapshot
from apps.api.config import Settings, get_settings
from apps.api.core.authz import require_permission_strict
from apps.api.http.pagination import PageData, PageParams, get_page_params
from apps.api.http.response import Response, ResponseModel
from apps.api.routers.v1.admin.users.schema import (
    AdminResetPasswordRequest,
    AdminUserCreateRequest,
    AdminUserDetailOut,
    AdminUserListQuery,
    AdminUserSummaryOut,
    AdminUserUpdateRequest,
)
from apps.api.routers.v1.admin.users.service import AdminUsersService

router = APIRouter(tags=["Services: User Service"])


def get_users_service(settings: Settings = Depends(get_settings)) -> AdminUsersService:
    return AdminUsersService(settings)


@router.get(
    "",
    response_model=ResponseModel[PageData[AdminUserSummaryOut]],
    dependencies=[require_permission_strict("admin:users:read")],
)
async def list_users(
    params: PageParams = Depends(get_page_params),
    filters: AdminUserListQuery = Depends(),
    service: AdminUsersService = Depends(get_users_service),
) -> ResponseModel[PageData[AdminUserSummaryOut]]:
    page = await service.list_users(params=params, filters=filters)
    return Response.success(data=page)


@router.get(
    "/{user_id}",
    response_model=ResponseModel[AdminUserDetailOut],
    dependencies=[require_permission_strict("admin:users:read")],
)
async def get_user(
    user_id: UUID,
    service: AdminUsersService = Depends(get_users_service),
) -> ResponseModel[AdminUserDetailOut]:
    user = await service.get_user(user_id=user_id)
    return Response.success(data=user)


@router.post(
    "",
    response_model=ResponseModel[AdminUserDetailOut],
    dependencies=[require_permission_strict("admin:users:write")],
)
async def create_user(
    body: AdminUserCreateRequest,
    service: AdminUsersService = Depends(get_users_service),
) -> ResponseModel[AdminUserDetailOut]:
    user = await service.create_user(payload=body)
    return Response.success(data=user)


@router.patch(
    "/{user_id}",
    response_model=ResponseModel[AdminUserDetailOut],
    dependencies=[require_permission_strict("admin:users:write")],
)
async def update_user(
    user_id: UUID,
    body: AdminUserUpdateRequest,
    service: AdminUsersService = Depends(get_users_service),
) -> ResponseModel[AdminUserDetailOut]:
    user = await service.update_user(user_id=user_id, payload=body)
    return Response.success(data=user)


@router.post(
    "/{user_id}/enable",
    response_model=ResponseModel[AdminUserDetailOut],
    dependencies=[require_permission_strict("admin:users:write")],
)
async def enable_user(
    user_id: UUID,
    service: AdminUsersService = Depends(get_users_service),
) -> ResponseModel[AdminUserDetailOut]:
    user = await service.set_user_status(user_id=user_id, enabled=True)
    return Response.success(data=user)


@router.post(
    "/{user_id}/disable",
    response_model=ResponseModel[AdminUserDetailOut],
    dependencies=[require_permission_strict("admin:users:write")],
)
async def disable_user(
    user_id: UUID,
    service: AdminUsersService = Depends(get_users_service),
) -> ResponseModel[AdminUserDetailOut]:
    user = await service.set_user_status(user_id=user_id, enabled=False)
    return Response.success(data=user)


@router.post(
    "/{user_id}/reset-password",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:users:reset-password")],
)
async def reset_password(
    user_id: UUID,
    body: AdminResetPasswordRequest,
    service: AdminUsersService = Depends(get_users_service),
) -> ResponseModel[None]:
    await service.reset_password(user_id=user_id, new_password=body.new_password)
    return Response.success()


@router.get(
    "/{user_id}/authz",
    response_model=ResponseModel[AuthzSnapshot],
    dependencies=[require_permission_strict("admin:users:read")],
)
async def get_user_authz(
    user_id: UUID,
    service: AdminUsersService = Depends(get_users_service),
) -> ResponseModel[AuthzSnapshot]:
    snap = await service.get_user_authz(user_id=user_id)
    return Response.success(data=snap)
