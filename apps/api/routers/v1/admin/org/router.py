from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.core.authz import require_permission_strict
from apps.api.core.exceptions import ServiceUnavailable
from apps.api.core.i18n import t
from apps.api.http.pagination import PageData, PageParams, get_page_params
from apps.api.http.response import Response, ResponseModel
from apps.api.plugin.extension_points.admin_org import get_admin_org_provider
from apps.api.routers.v1.admin.org.schema import (
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
    PositionCreate,
    PositionOut,
    PositionUpdate,
    UserDepartmentOut,
    UserPositionOut,
)

router = APIRouter(tags=["Admin Org - 组织服务模块"])


def _require_provider():
    provider = get_admin_org_provider()
    if provider is None:
        raise ServiceUnavailable(
            message=t("errors", "ADMIN_ORG_PROVIDER_UNAVAILABLE", default="组织服务不可用"),
            error="ADMIN_ORG_PROVIDER_UNAVAILABLE",
        )
    return provider


@router.get(
    "/departments",
    response_model=ResponseModel[PageData[DepartmentOut]],
    dependencies=[require_permission_strict("admin:org:departments:read")],
)
async def list_departments(
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[DepartmentOut]]:
    provider = _require_provider()
    page = await provider.list_departments(params=params)
    return Response.success(data=PageData[DepartmentOut].model_validate(page))


@router.post(
    "/departments",
    response_model=ResponseModel[DepartmentOut],
    dependencies=[require_permission_strict("admin:org:departments:write")],
)
async def create_department(
    body: DepartmentCreate,
) -> ResponseModel[DepartmentOut]:
    provider = _require_provider()
    item = await provider.create_department(payload=body)
    return Response.success(data=DepartmentOut.model_validate(item))


@router.patch(
    "/departments/{department_id}",
    response_model=ResponseModel[DepartmentOut],
    dependencies=[require_permission_strict("admin:org:departments:write")],
)
async def update_department(
    department_id: UUID,
    body: DepartmentUpdate,
) -> ResponseModel[DepartmentOut]:
    provider = _require_provider()
    item = await provider.update_department(department_id=department_id, payload=body)
    return Response.success(data=DepartmentOut.model_validate(item))


@router.delete(
    "/departments/{department_id}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:org:departments:write")],
)
async def delete_department(
    department_id: UUID,
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.delete_department(department_id=department_id)
    return Response.success()


@router.post(
    "/departments/{department_id}/restore",
    response_model=ResponseModel[DepartmentOut],
    dependencies=[require_permission_strict("admin:org:departments:write")],
)
async def restore_department(
    department_id: UUID,
) -> ResponseModel[DepartmentOut]:
    provider = _require_provider()
    item = await provider.restore_department(department_id=department_id)
    return Response.success(data=DepartmentOut.model_validate(item))


@router.get(
    "/positions",
    response_model=ResponseModel[PageData[PositionOut]],
    dependencies=[require_permission_strict("admin:org:positions:read")],
)
async def list_positions(
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[PositionOut]]:
    provider = _require_provider()
    page = await provider.list_positions(params=params)
    return Response.success(data=PageData[PositionOut].model_validate(page))


@router.post(
    "/positions",
    response_model=ResponseModel[PositionOut],
    dependencies=[require_permission_strict("admin:org:positions:write")],
)
async def create_position(
    body: PositionCreate,
) -> ResponseModel[PositionOut]:
    provider = _require_provider()
    item = await provider.create_position(payload=body)
    return Response.success(data=PositionOut.model_validate(item))


@router.patch(
    "/positions/{position_id}",
    response_model=ResponseModel[PositionOut],
    dependencies=[require_permission_strict("admin:org:positions:write")],
)
async def update_position(
    position_id: UUID,
    body: PositionUpdate,
) -> ResponseModel[PositionOut]:
    provider = _require_provider()
    item = await provider.update_position(position_id=position_id, payload=body)
    return Response.success(data=PositionOut.model_validate(item))


@router.delete(
    "/positions/{position_id}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:org:positions:write")],
)
async def delete_position(
    position_id: UUID,
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.delete_position(position_id=position_id)
    return Response.success()


@router.get(
    "/users/{user_id}/departments",
    response_model=ResponseModel[PageData[UserDepartmentOut]],
    dependencies=[require_permission_strict("admin:org:users:assign")],
)
async def list_user_departments(
    user_id: UUID,
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[UserDepartmentOut]]:
    provider = _require_provider()
    page = await provider.list_user_departments(user_id=user_id, params=params)
    return Response.success(data=PageData[UserDepartmentOut].model_validate(page))


@router.post(
    "/users/{user_id}/departments/{department_id}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:org:users:assign")],
)
async def assign_user_department(
    user_id: UUID,
    department_id: UUID,
    primary: bool = False,
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.assign_user_department(user_id=user_id, department_id=department_id, primary=primary)
    return Response.success()


@router.post(
    "/users/{user_id}/departments/{department_id}/primary",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:org:users:assign")],
)
async def set_primary_department(
    user_id: UUID,
    department_id: UUID,
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.set_primary_department(user_id=user_id, department_id=department_id)
    return Response.success()


@router.delete(
    "/users/{user_id}/departments/{department_id}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:org:users:assign")],
)
async def revoke_user_department(
    user_id: UUID,
    department_id: UUID,
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.revoke_user_department(user_id=user_id, department_id=department_id)
    return Response.success()


@router.get(
    "/users/{user_id}/positions",
    response_model=ResponseModel[PageData[UserPositionOut]],
    dependencies=[require_permission_strict("admin:org:users:assign")],
)
async def list_user_positions(
    user_id: UUID,
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[UserPositionOut]]:
    provider = _require_provider()
    page = await provider.list_user_positions(user_id=user_id, params=params)
    return Response.success(data=PageData[UserPositionOut].model_validate(page))


@router.post(
    "/users/{user_id}/positions/{position_id}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:org:users:assign")],
)
async def assign_user_position(
    user_id: UUID,
    position_id: UUID,
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.assign_user_position(user_id=user_id, position_id=position_id)
    return Response.success()


@router.delete(
    "/users/{user_id}/positions/{position_id}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:org:users:assign")],
)
async def revoke_user_position(
    user_id: UUID,
    position_id: UUID,
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.revoke_user_position(user_id=user_id, position_id=position_id)
    return Response.success()
