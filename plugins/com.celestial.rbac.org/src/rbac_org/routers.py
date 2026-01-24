from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from rbac.schema import RoleOut

from apps.api.core.authz import require_permission_strict
from apps.api.core.response import Response, ResponseModel
from apps.api.http.pagination import PageData, PageParams, get_page_params
from rbac_org.deps import get_rbac_org_service
from rbac_org.schema import RoleCodeItem, RoleCodeSet
from rbac_org.services import RBACOrgService

admin_router = APIRouter(tags=["Plugin: RBAC Org Bridge"])


@admin_router.get(
    "/positions/{position_id}/roles",
    response_model=ResponseModel[PageData[RoleOut]],
    dependencies=[require_permission_strict("admin:rbac-org:positions:roles:read")],
)
async def list_position_roles(
    position_id: UUID,
    params: PageParams = Depends(get_page_params),
    service: RBACOrgService = Depends(get_rbac_org_service),
) -> ResponseModel[PageData[RoleOut]]:
    page = await service.list_position_roles_paginated(position_id=position_id, params=params)
    return Response.success(data=page)


@admin_router.put(
    "/positions/{position_id}/roles",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:rbac-org:positions:roles:write")],
)
async def set_position_roles(
    position_id: UUID,
    body: RoleCodeSet,
    service: RBACOrgService = Depends(get_rbac_org_service),
) -> ResponseModel[None]:
    await service.set_position_roles(position_id=position_id, role_codes=body.role_codes)
    return Response.success()


@admin_router.post(
    "/positions/{position_id}/roles",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:rbac-org:positions:roles:write")],
)
async def add_position_role(
    position_id: UUID,
    body: RoleCodeItem,
    service: RBACOrgService = Depends(get_rbac_org_service),
) -> ResponseModel[None]:
    await service.add_position_role(position_id=position_id, role_code=body.role_code)
    return Response.success()


@admin_router.delete(
    "/positions/{position_id}/roles/{role_code}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:rbac-org:positions:roles:write")],
)
async def remove_position_role(
    position_id: UUID,
    role_code: str,
    service: RBACOrgService = Depends(get_rbac_org_service),
) -> ResponseModel[None]:
    await service.remove_position_role(position_id=position_id, role_code=role_code)
    return Response.success()


@admin_router.get(
    "/departments/{department_id}/roles",
    response_model=ResponseModel[PageData[RoleOut]],
    dependencies=[require_permission_strict("admin:rbac-org:departments:roles:read")],
)
async def list_department_roles(
    department_id: UUID,
    params: PageParams = Depends(get_page_params),
    service: RBACOrgService = Depends(get_rbac_org_service),
) -> ResponseModel[PageData[RoleOut]]:
    page = await service.list_department_roles_paginated(department_id=department_id, params=params)
    return Response.success(data=page)


@admin_router.put(
    "/departments/{department_id}/roles",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:rbac-org:departments:roles:write")],
)
async def set_department_roles(
    department_id: UUID,
    body: RoleCodeSet,
    service: RBACOrgService = Depends(get_rbac_org_service),
) -> ResponseModel[None]:
    await service.set_department_roles(department_id=department_id, role_codes=body.role_codes)
    return Response.success()


@admin_router.post(
    "/departments/{department_id}/roles",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:rbac-org:departments:roles:write")],
)
async def add_department_role(
    department_id: UUID,
    body: RoleCodeItem,
    service: RBACOrgService = Depends(get_rbac_org_service),
) -> ResponseModel[None]:
    await service.add_department_role(department_id=department_id, role_code=body.role_code)
    return Response.success()


@admin_router.delete(
    "/departments/{department_id}/roles/{role_code}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:rbac-org:departments:roles:write")],
)
async def remove_department_role(
    department_id: UUID,
    role_code: str,
    service: RBACOrgService = Depends(get_rbac_org_service),
) -> ResponseModel[None]:
    await service.remove_department_role(department_id=department_id, role_code=role_code)
    return Response.success()
