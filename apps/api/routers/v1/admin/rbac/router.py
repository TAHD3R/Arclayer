from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.config import Settings, get_settings
from apps.api.core.authz import require_permission_strict
from apps.api.core.rbac.service import RBACService
from apps.api.http.pagination import PageData, PageParams, get_page_params
from apps.api.http.response import Response, ResponseModel
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


def get_rbac_service(settings: Settings = Depends(get_settings)) -> RBACService:
    return RBACService(settings)


@router.get(
    "/roles",
    response_model=ResponseModel[PageData[RoleOut]],
    dependencies=[require_permission_strict("rbac:roles:read")],
)
async def list_roles(
    params: PageParams = Depends(get_page_params),
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[PageData[RoleOut]]:
    page = await service.list_roles_paginated(params=params, out_schema=RoleOut)
    return Response.success(data=PageData[RoleOut].model_validate(page))


@router.get(
    "/roles/{role_code}",
    response_model=ResponseModel[RoleOut],
    dependencies=[require_permission_strict("rbac:roles:read")],
)
async def get_role(
    role_code: str,
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[RoleOut]:
    role = await service.get_role(role_code=role_code)
    return Response.success(data=RoleOut.model_validate(role))


@router.post(
    "/roles",
    response_model=ResponseModel[RoleOut],
    dependencies=[require_permission_strict("rbac:roles:write")],
)
async def create_role(
    body: RoleCreateRequest,
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[RoleOut]:
    role = await service.create_role(**body.model_dump())
    return Response.success(data=RoleOut.model_validate(role))


@router.patch(
    "/roles/{role_code}",
    response_model=ResponseModel[RoleOut],
    dependencies=[require_permission_strict("rbac:roles:write")],
)
async def update_role(
    role_code: str,
    body: RoleUpdateRequest,
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[RoleOut]:
    role = await service.update_role(role_code=role_code, payload=body.model_dump(exclude_unset=True))
    return Response.success(data=RoleOut.model_validate(role))


@router.delete(
    "/roles/{role_code}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("rbac:roles:write")],
)
async def delete_role(
    role_code: str,
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[None]:
    await service.delete_role(role_code=role_code)
    return Response.success()


@router.get(
    "/permissions",
    response_model=ResponseModel[PageData[PermissionOut]],
    dependencies=[require_permission_strict("rbac:permissions:read")],
)
async def list_permissions(
    params: PageParams = Depends(get_page_params),
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[PageData[PermissionOut]]:
    page = await service.list_permissions_paginated(params=params, out_schema=PermissionOut)
    return Response.success(data=PageData[PermissionOut].model_validate(page))


@router.post(
    "/permissions/sync",
    response_model=ResponseModel[PermissionSyncResult],
    dependencies=[require_permission_strict("rbac:permissions:sync")],
)
async def sync_permissions(
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[PermissionSyncResult]:
    result = await service.sync_permissions()
    return Response.success(data=PermissionSyncResult.model_validate(result))


@router.get(
    "/roles/{role_code}/permissions",
    response_model=ResponseModel[PageData[PermissionOut]],
    dependencies=[require_permission_strict("rbac:roles:read")],
)
async def list_role_permissions(
    role_code: str,
    params: PageParams = Depends(get_page_params),
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[PageData[PermissionOut]]:
    page = await service.list_role_permissions_paginated(role_code=role_code, params=params, out_schema=PermissionOut)
    return Response.success(data=PageData[PermissionOut].model_validate(page))


@router.put(
    "/roles/{role_code}/permissions",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("rbac:roles:write")],
)
async def set_role_permissions(
    role_code: str,
    body: RolePermissionSetRequest,
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[None]:
    await service.set_role_permissions(role_code=role_code, permission_codes=body.permission_codes)
    return Response.success()


@router.get(
    "/users/{user_id}/roles",
    response_model=ResponseModel[PageData[RoleOut]],
    dependencies=[require_permission_strict("rbac:roles:read")],
)
async def list_user_roles(
    user_id: UUID,
    params: PageParams = Depends(get_page_params),
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[PageData[RoleOut]]:
    page = await service.list_user_roles_paginated(user_id=user_id, params=params, out_schema=RoleOut)
    return Response.success(data=PageData[RoleOut].model_validate(page))


@router.post(
    "/users/{user_id}/roles",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("rbac:users:assign")],
)
async def assign_user_role(
    user_id: UUID,
    body: UserRoleAssignRequest,
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[None]:
    await service.assign_role(user_id=user_id, role_code=body.role_code)
    return Response.success()


@router.delete(
    "/users/{user_id}/roles/{role_code}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("rbac:users:assign")],
)
async def revoke_user_role(
    user_id: UUID,
    role_code: str,
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[None]:
    await service.revoke_role(user_id=user_id, role_code=role_code)
    return Response.success()
