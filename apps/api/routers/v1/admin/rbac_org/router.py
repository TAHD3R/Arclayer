from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.core.authz import require_permission_strict
from apps.api.core.exceptions import ServiceUnavailable
from apps.api.core.i18n import t
from apps.api.http.pagination import PageData, PageParams, get_page_params
from apps.api.http.response import Response, ResponseModel
from apps.api.plugin.extension_points.admin_rbac_org import get_admin_rbac_org_provider
from apps.api.routers.v1.admin.rbac.schema import RoleOut
from apps.api.routers.v1.admin.rbac_org.schema import RoleCodeItem, RoleCodeSet

router = APIRouter(tags=["Services: RBAC ORG Service"])


def _require_provider():
    provider = get_admin_rbac_org_provider()
    if provider is None:
        raise ServiceUnavailable(
            message=t("errors", "ADMIN_RBAC_ORG_PROVIDER_UNAVAILABLE", default="RBAC 组织桥接服务不可用"),
            error="ADMIN_RBAC_ORG_PROVIDER_UNAVAILABLE",
        )
    return provider


@router.get(
    "/positions/{position_id}/roles",
    response_model=ResponseModel[PageData[RoleOut]],
    dependencies=[require_permission_strict("admin:rbac-org:positions:roles:read")],
)
async def list_position_roles(
    position_id: UUID,
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[RoleOut]]:
    provider = _require_provider()
    page = await provider.list_position_roles(position_id=position_id, params=params)
    return Response.success(data=PageData[RoleOut].model_validate(page))


@router.put(
    "/positions/{position_id}/roles",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:rbac-org:positions:roles:write")],
)
async def set_position_roles(
    position_id: UUID,
    body: RoleCodeSet,
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.set_position_roles(position_id=position_id, role_codes=body.role_codes)
    return Response.success()


@router.post(
    "/positions/{position_id}/roles",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:rbac-org:positions:roles:write")],
)
async def add_position_role(
    position_id: UUID,
    body: RoleCodeItem,
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.add_position_role(position_id=position_id, role_code=body.role_code)
    return Response.success()


@router.delete(
    "/positions/{position_id}/roles/{role_code}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:rbac-org:positions:roles:write")],
)
async def remove_position_role(
    position_id: UUID,
    role_code: str,
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.remove_position_role(position_id=position_id, role_code=role_code)
    return Response.success()


@router.get(
    "/departments/{department_id}/roles",
    response_model=ResponseModel[PageData[RoleOut]],
    dependencies=[require_permission_strict("admin:rbac-org:departments:roles:read")],
)
async def list_department_roles(
    department_id: UUID,
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[RoleOut]]:
    provider = _require_provider()
    page = await provider.list_department_roles(department_id=department_id, params=params)
    return Response.success(data=PageData[RoleOut].model_validate(page))


@router.put(
    "/departments/{department_id}/roles",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:rbac-org:departments:roles:write")],
)
async def set_department_roles(
    department_id: UUID,
    body: RoleCodeSet,
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.set_department_roles(department_id=department_id, role_codes=body.role_codes)
    return Response.success()


@router.post(
    "/departments/{department_id}/roles",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:rbac-org:departments:roles:write")],
)
async def add_department_role(
    department_id: UUID,
    body: RoleCodeItem,
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.add_department_role(department_id=department_id, role_code=body.role_code)
    return Response.success()


@router.delete(
    "/departments/{department_id}/roles/{role_code}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:rbac-org:departments:roles:write")],
)
async def remove_department_role(
    department_id: UUID,
    role_code: str,
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.remove_department_role(department_id=department_id, role_code=role_code)
    return Response.success()
