from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from rbac.schema import AuthzSnapshot

from apps.api.core.admin_users import get_admin_users_provider
from apps.api.core.authz import require_permission_strict
from apps.api.core.exceptions import ServiceUnavailable
from apps.api.core.i18n import t
from apps.api.core.response import Response, ResponseModel
from apps.api.http.pagination import PageData, PageParams, get_page_params
from apps.api.routers.v1.admin.users.schema import (
    AdminResetPasswordRequest,
    AdminUserCreateRequest,
    AdminUserDetailOut,
    AdminUserListQuery,
    AdminUserSummaryOut,
    AdminUserUpdateRequest,
)

router = APIRouter(tags=["Admin Users - 用户管理模块"])


def _require_provider():
    provider = get_admin_users_provider()
    if provider is None:
        raise ServiceUnavailable(
            message=t("errors", "ADMIN_USERS_PROVIDER_UNAVAILABLE", default="用户管理服务不可用"),
            error="ADMIN_USERS_PROVIDER_UNAVAILABLE",
        )
    return provider


@router.get(
    "",
    response_model=ResponseModel[PageData[AdminUserSummaryOut]],
    dependencies=[require_permission_strict("admin:users:read")],
)
async def list_users(
    params: PageParams = Depends(get_page_params),
    filters: AdminUserListQuery = Depends(),
) -> ResponseModel[PageData[AdminUserSummaryOut]]:
    provider = _require_provider()
    page = await provider.list_users(params=params, filters=filters)
    return Response.success(data=page)


@router.get(
    "/{user_id}",
    response_model=ResponseModel[AdminUserDetailOut],
    dependencies=[require_permission_strict("admin:users:read")],
)
async def get_user(
    user_id: UUID,
) -> ResponseModel[AdminUserDetailOut]:
    provider = _require_provider()
    user = await provider.get_user(user_id=user_id)
    return Response.success(data=user)


@router.post(
    "",
    response_model=ResponseModel[AdminUserDetailOut],
    dependencies=[require_permission_strict("admin:users:write")],
)
async def create_user(
    body: AdminUserCreateRequest,
) -> ResponseModel[AdminUserDetailOut]:
    provider = _require_provider()
    user = await provider.create_user(payload=body)
    return Response.success(data=user)


@router.patch(
    "/{user_id}",
    response_model=ResponseModel[AdminUserDetailOut],
    dependencies=[require_permission_strict("admin:users:write")],
)
async def update_user(
    user_id: UUID,
    body: AdminUserUpdateRequest,
) -> ResponseModel[AdminUserDetailOut]:
    provider = _require_provider()
    user = await provider.update_user(user_id=user_id, payload=body)
    return Response.success(data=user)


@router.post(
    "/{user_id}/enable",
    response_model=ResponseModel[AdminUserDetailOut],
    dependencies=[require_permission_strict("admin:users:write")],
)
async def enable_user(
    user_id: UUID,
) -> ResponseModel[AdminUserDetailOut]:
    provider = _require_provider()
    user = await provider.set_user_status(user_id=user_id, enabled=True)
    return Response.success(data=user)


@router.post(
    "/{user_id}/disable",
    response_model=ResponseModel[AdminUserDetailOut],
    dependencies=[require_permission_strict("admin:users:write")],
)
async def disable_user(
    user_id: UUID,
) -> ResponseModel[AdminUserDetailOut]:
    provider = _require_provider()
    user = await provider.set_user_status(user_id=user_id, enabled=False)
    return Response.success(data=user)


@router.post(
    "/{user_id}/reset-password",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:users:reset-password")],
)
async def reset_password(
    user_id: UUID,
    body: AdminResetPasswordRequest,
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.reset_password(user_id=user_id, new_password=body.new_password)
    return Response.success()


@router.get(
    "/{user_id}/authz",
    response_model=ResponseModel[AuthzSnapshot],
    dependencies=[require_permission_strict("admin:users:read")],
)
async def get_user_authz(
    user_id: UUID,
) -> ResponseModel[AuthzSnapshot]:
    provider = _require_provider()
    snap = await provider.get_user_authz(user_id=user_id)
    return Response.success(data=snap)
