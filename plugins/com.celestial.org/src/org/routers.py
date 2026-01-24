from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.core.authz import require_permission_strict
from apps.api.core.response import Response, ResponseModel
from apps.api.http.pagination import PageData, PageParams, get_page_params
from org.deps import get_org_service
from org.schema import (
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
    PositionCreate,
    PositionOut,
    PositionUpdate,
    UserDepartmentOut,
    UserPositionOut,
)
from org.services import OrgService

admin_router = APIRouter(tags=["Plugin: Organization"])


@admin_router.get(
    "/departments",
    response_model=ResponseModel[PageData[DepartmentOut]],
    dependencies=[require_permission_strict("admin:org:departments:read")],
)
async def list_departments(
    params: PageParams = Depends(get_page_params),
    service: OrgService = Depends(get_org_service),
) -> ResponseModel[PageData[DepartmentOut]]:
    page = await service.list_departments_paginated(params=params)
    return Response.success(data=page)


@admin_router.post(
    "/departments",
    response_model=ResponseModel[DepartmentOut],
    dependencies=[require_permission_strict("admin:org:departments:write")],
)
async def create_department(
    body: DepartmentCreate,
    service: OrgService = Depends(get_org_service),
) -> ResponseModel[DepartmentOut]:
    item = await service.create_department(body.model_dump())
    return Response.success(data=DepartmentOut.model_validate(item))


@admin_router.patch(
    "/departments/{department_id}",
    response_model=ResponseModel[DepartmentOut],
    dependencies=[require_permission_strict("admin:org:departments:write")],
)
async def update_department(
    department_id: UUID,
    body: DepartmentUpdate,
    service: OrgService = Depends(get_org_service),
) -> ResponseModel[DepartmentOut]:
    item = await service.update_department(department_id=department_id, payload=body.model_dump(exclude_unset=True))
    return Response.success(data=DepartmentOut.model_validate(item))


@admin_router.delete(
    "/departments/{department_id}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:org:departments:write")],
)
async def delete_department(
    department_id: UUID,
    service: OrgService = Depends(get_org_service),
) -> ResponseModel[None]:
    await service.delete_department(department_id=department_id)
    return Response.success()


@admin_router.post(
    "/departments/{department_id}/restore",
    response_model=ResponseModel[DepartmentOut],
    dependencies=[require_permission_strict("admin:org:departments:write")],
)
async def restore_department(
    department_id: UUID,
    service: OrgService = Depends(get_org_service),
) -> ResponseModel[DepartmentOut]:
    item = await service.restore_department(department_id=department_id)
    return Response.success(data=item)


@admin_router.get(
    "/positions",
    response_model=ResponseModel[PageData[PositionOut]],
    dependencies=[require_permission_strict("admin:org:positions:read")],
)
async def list_positions(
    params: PageParams = Depends(get_page_params),
    service: OrgService = Depends(get_org_service),
) -> ResponseModel[PageData[PositionOut]]:
    page = await service.list_positions_paginated(params=params)
    return Response.success(data=page)


@admin_router.post(
    "/positions",
    response_model=ResponseModel[PositionOut],
    dependencies=[require_permission_strict("admin:org:positions:write")],
)
async def create_position(
    body: PositionCreate,
    service: OrgService = Depends(get_org_service),
) -> ResponseModel[PositionOut]:
    item = await service.create_position(body.model_dump())
    return Response.success(data=PositionOut.model_validate(item))


@admin_router.patch(
    "/positions/{position_id}",
    response_model=ResponseModel[PositionOut],
    dependencies=[require_permission_strict("admin:org:positions:write")],
)
async def update_position(
    position_id: UUID,
    body: PositionUpdate,
    service: OrgService = Depends(get_org_service),
) -> ResponseModel[PositionOut]:
    item = await service.update_position(position_id=position_id, payload=body.model_dump(exclude_unset=True))
    return Response.success(data=PositionOut.model_validate(item))


@admin_router.delete(
    "/positions/{position_id}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:org:positions:write")],
)
async def delete_position(
    position_id: UUID,
    service: OrgService = Depends(get_org_service),
) -> ResponseModel[None]:
    await service.delete_position(position_id=position_id)
    return Response.success()


@admin_router.get(
    "/users/{user_id}/departments",
    response_model=ResponseModel[PageData[UserDepartmentOut]],
    dependencies=[require_permission_strict("admin:org:users:assign")],
)
async def list_user_departments(
    user_id: UUID,
    params: PageParams = Depends(get_page_params),
    service: OrgService = Depends(get_org_service),
) -> ResponseModel[PageData[UserDepartmentOut]]:
    page = await service.list_user_departments_paginated(user_id=user_id, params=params)
    return Response.success(data=page)


@admin_router.post(
    "/users/{user_id}/departments/{department_id}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:org:users:assign")],
)
async def assign_user_department(
    user_id: UUID,
    department_id: UUID,
    primary: bool = False,
    service: OrgService = Depends(get_org_service),
) -> ResponseModel[None]:
    await service.assign_user_department(user_id=user_id, department_id=department_id, primary=primary)
    return Response.success()


@admin_router.post(
    "/users/{user_id}/departments/{department_id}/primary",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:org:users:assign")],
)
async def set_user_primary_department(
    user_id: UUID,
    department_id: UUID,
    service: OrgService = Depends(get_org_service),
) -> ResponseModel[None]:
    await service.set_primary_department(user_id=user_id, department_id=department_id)
    return Response.success()


@admin_router.delete(
    "/users/{user_id}/departments/{department_id}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:org:users:assign")],
)
async def revoke_user_department(
    user_id: UUID,
    department_id: UUID,
    service: OrgService = Depends(get_org_service),
) -> ResponseModel[None]:
    await service.revoke_user_department(user_id=user_id, department_id=department_id)
    return Response.success()


@admin_router.get(
    "/users/{user_id}/positions",
    response_model=ResponseModel[PageData[UserPositionOut]],
    dependencies=[require_permission_strict("admin:org:users:assign")],
)
async def list_user_positions(
    user_id: UUID,
    params: PageParams = Depends(get_page_params),
    service: OrgService = Depends(get_org_service),
) -> ResponseModel[PageData[UserPositionOut]]:
    page = await service.list_user_positions_paginated(user_id=user_id, params=params)
    return Response.success(data=page)


@admin_router.post(
    "/users/{user_id}/positions/{position_id}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:org:users:assign")],
)
async def assign_user_position(
    user_id: UUID,
    position_id: UUID,
    service: OrgService = Depends(get_org_service),
) -> ResponseModel[None]:
    await service.assign_user_position(user_id=user_id, position_id=position_id)
    return Response.success()


@admin_router.delete(
    "/users/{user_id}/positions/{position_id}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:org:users:assign")],
)
async def revoke_user_position(
    user_id: UUID,
    position_id: UUID,
    service: OrgService = Depends(get_org_service),
) -> ResponseModel[None]:
    await service.revoke_user_position(user_id=user_id, position_id=position_id)
    return Response.success()
