from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.core.authz import require_permission_strict
from apps.api.core.exceptions import ServiceUnavailable
from apps.api.core.i18n import t
from apps.api.http.pagination import PageData, PageParams, get_page_params
from apps.api.http.response import Response, ResponseModel
from apps.api.plugin.extension_points.admin_rbac import get_admin_rbac_provider
from apps.api.routers.v1.admin.rbac.schema import (
    PermissionOut,
    PermissionSyncResult,
    RoleCreateRequest,
    RoleOut,
    RolePermissionSetRequest,
    RoleUpdateRequest,
    UserRoleAssignRequest,
)

router = APIRouter(tags=["Services: RBAC Core Service"])


def _require_provider():
    provider = get_admin_rbac_provider()
    if provider is None:
        raise ServiceUnavailable(
            message=t("errors", "ADMIN_RBAC_PROVIDER_UNAVAILABLE", default="RBAC 服务不可用"),
            error="ADMIN_RBAC_PROVIDER_UNAVAILABLE",
        )
    return provider


@router.get(
    "/roles",
    response_model=ResponseModel[PageData[RoleOut]],
    dependencies=[require_permission_strict("rbac:roles:read")],
)
async def list_roles(
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[RoleOut]]:
    provider = _require_provider()
    page = await provider.list_roles(params=params)
    return Response.success(data=PageData[RoleOut].model_validate(page))


@router.get(
    "/roles/{role_code}",
    response_model=ResponseModel[RoleOut],
    dependencies=[require_permission_strict("rbac:roles:read")],
)
async def get_role(
    role_code: str,
) -> ResponseModel[RoleOut]:
    provider = _require_provider()
    role = await provider.get_role(role_code=role_code)
    return Response.success(data=RoleOut.model_validate(role))


@router.post(
    "/roles",
    response_model=ResponseModel[RoleOut],
    dependencies=[require_permission_strict("rbac:roles:write")],
)
async def create_role(
    body: RoleCreateRequest,
) -> ResponseModel[RoleOut]:
    provider = _require_provider()
    role = await provider.create_role(payload=body)
    return Response.success(data=RoleOut.model_validate(role))


@router.patch(
    "/roles/{role_code}",
    response_model=ResponseModel[RoleOut],
    dependencies=[require_permission_strict("rbac:roles:write")],
)
async def update_role(
    role_code: str,
    body: RoleUpdateRequest,
) -> ResponseModel[RoleOut]:
    provider = _require_provider()
    role = await provider.update_role(role_code=role_code, payload=body)
    return Response.success(data=RoleOut.model_validate(role))


@router.delete(
    "/roles/{role_code}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("rbac:roles:write")],
)
async def delete_role(
    role_code: str,
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.delete_role(role_code=role_code)
    return Response.success()


@router.get(
    "/permissions",
    response_model=ResponseModel[PageData[PermissionOut]],
    dependencies=[require_permission_strict("rbac:permissions:read")],
)
async def list_permissions(
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[PermissionOut]]:
    provider = _require_provider()
    page = await provider.list_permissions(params=params)
    return Response.success(data=PageData[PermissionOut].model_validate(page))


@router.post(
    "/permissions/sync",
    response_model=ResponseModel[PermissionSyncResult],
    dependencies=[require_permission_strict("rbac:permissions:sync")],
)
async def sync_permissions() -> ResponseModel[PermissionSyncResult]:
    provider = _require_provider()
    result = await provider.sync_permissions()
    return Response.success(data=PermissionSyncResult.model_validate(result))


@router.get(
    "/roles/{role_code}/permissions",
    response_model=ResponseModel[PageData[PermissionOut]],
    dependencies=[require_permission_strict("rbac:roles:read")],
)
async def list_role_permissions(
    role_code: str,
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[PermissionOut]]:
    provider = _require_provider()
    page = await provider.list_role_permissions(role_code=role_code, params=params)
    return Response.success(data=PageData[PermissionOut].model_validate(page))


@router.put(
    "/roles/{role_code}/permissions",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("rbac:roles:write")],
)
async def set_role_permissions(
    role_code: str,
    body: RolePermissionSetRequest,
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.set_role_permissions(role_code=role_code, permission_codes=body.permission_codes)
    return Response.success()


@router.get(
    "/users/{user_id}/roles",
    response_model=ResponseModel[PageData[RoleOut]],
    dependencies=[require_permission_strict("rbac:roles:read")],
)
async def list_user_roles(
    user_id: UUID,
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[RoleOut]]:
    provider = _require_provider()
    page = await provider.list_user_roles(user_id=user_id, params=params)
    return Response.success(data=PageData[RoleOut].model_validate(page))


@router.post(
    "/users/{user_id}/roles",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("rbac:users:assign")],
)
async def assign_user_role(
    user_id: UUID,
    body: UserRoleAssignRequest,
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.assign_user_role(user_id=user_id, role_code=body.role_code)
    return Response.success()


@router.delete(
    "/users/{user_id}/roles/{role_code}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("rbac:users:assign")],
)
async def revoke_user_role(
    user_id: UUID,
    role_code: str,
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.revoke_user_role(user_id=user_id, role_code=role_code)
    return Response.success()
