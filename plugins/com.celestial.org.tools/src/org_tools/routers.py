from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.core.authz import require_permission_strict
from apps.api.http.response import Response, ResponseModel
from apps.api.routers.v1.auth.deps import get_current_user_id
from org_tools.deps import get_org_tools_service
from org_tools.schema import (
    DepartmentMergeRequest,
    DepartmentMoveRequest,
    DepartmentReorderRequest,
    OrgRepairResult,
    OrgValidateReport,
)
from org_tools.services import OrgToolsService

admin_router = APIRouter(tags=["Plugin: Organization Tools"])


@admin_router.post(
    "/validate",
    response_model=ResponseModel[OrgValidateReport],
    dependencies=[require_permission_strict("admin:org:tools:validate")],
)
async def validate_org(
    service: OrgToolsService = Depends(get_org_tools_service),
) -> ResponseModel[OrgValidateReport]:
    report = await service.validate()
    return Response.success(data=report)


@admin_router.post(
    "/repair/directory",
    response_model=ResponseModel[OrgRepairResult],
    dependencies=[require_permission_strict("admin:org:tools:repair")],
)
async def repair_directory(
    actor_user_id: UUID = Depends(get_current_user_id),
    service: OrgToolsService = Depends(get_org_tools_service),
) -> ResponseModel[OrgRepairResult]:
    result = await service.repair_directory(actor_user_id=actor_user_id)
    return Response.success(data=result)


@admin_router.post(
    "/repair/primary-department",
    response_model=ResponseModel[OrgRepairResult],
    dependencies=[require_permission_strict("admin:org:tools:repair")],
)
async def repair_primary_department(
    actor_user_id: UUID = Depends(get_current_user_id),
    service: OrgToolsService = Depends(get_org_tools_service),
) -> ResponseModel[OrgRepairResult]:
    result = await service.repair_primary_departments(actor_user_id=actor_user_id)
    return Response.success(data=result)


@admin_router.post(
    "/departments/{department_id}/move",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:org:tools:move")],
)
async def move_department(
    department_id: UUID,
    body: DepartmentMoveRequest,
    actor_user_id: UUID = Depends(get_current_user_id),
    service: OrgToolsService = Depends(get_org_tools_service),
) -> ResponseModel[None]:
    await service.move_department(department_id=department_id, payload=body, actor_user_id=actor_user_id)
    return Response.success()


@admin_router.post(
    "/departments/{department_id}/merge",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:org:tools:merge")],
)
async def merge_departments(
    department_id: UUID,
    body: DepartmentMergeRequest,
    actor_user_id: UUID = Depends(get_current_user_id),
    service: OrgToolsService = Depends(get_org_tools_service),
) -> ResponseModel[None]:
    await service.merge_departments(source_department_id=department_id, payload=body, actor_user_id=actor_user_id)
    return Response.success()


@admin_router.post(
    "/departments/reorder",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:org:tools:reorder")],
)
async def reorder_departments(
    body: DepartmentReorderRequest,
    actor_user_id: UUID = Depends(get_current_user_id),
    service: OrgToolsService = Depends(get_org_tools_service),
) -> ResponseModel[None]:
    await service.reorder_departments(payload=body, actor_user_id=actor_user_id)
    return Response.success()
