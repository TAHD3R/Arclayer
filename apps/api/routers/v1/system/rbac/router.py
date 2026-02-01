from __future__ import annotations

from fastapi import APIRouter, Depends

from apps.api.config import Settings, get_settings
from apps.api.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.core.http.response import Response, ResponseModel
from apps.api.core.org.deps import require_org_owner
from apps.api.core.rbac.service import RBACService
from apps.api.routers.v1.system.rbac.schema import (
    PermissionOut,
    PermissionSyncResult,
    RoleCreateRequest,
    RoleOut,
    RolePermissionSetRequest,
    RoleUpdateRequest,
)

router = APIRouter(tags=["System: RBAC"], dependencies=[Depends(require_org_owner)])


def get_rbac_service(settings: Settings = Depends(get_settings)) -> RBACService:
    return RBACService(settings)


@router.get(
    "/roles",
    response_model=ResponseModel[PageData[RoleOut]],
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
)
async def sync_permissions(
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[PermissionSyncResult]:
    result = await service.sync_permissions()
    return Response.success(data=PermissionSyncResult.model_validate(result))


@router.get(
    "/roles/{role_code}/permissions",
    response_model=ResponseModel[PageData[PermissionOut]],
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
)
async def set_role_permissions(
    role_code: str,
    body: RolePermissionSetRequest,
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[None]:
    await service.set_role_permissions(role_code=role_code, permission_codes=body.permission_codes)
    return Response.success()
