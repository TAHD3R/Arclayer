from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.core.admin_org_tools import get_admin_org_tools_provider
from apps.api.core.authz import require_permission_strict
from apps.api.core.exceptions import ServiceUnavailable
from apps.api.core.i18n import t
from apps.api.core.response import Response, ResponseModel
from apps.api.routers.v1.admin.org.tools_schema import (
    DepartmentMergeRequest,
    DepartmentMoveRequest,
    DepartmentReorderRequest,
    OrgRepairResult,
    OrgValidateReport,
)
from apps.api.routers.v1.auth.deps import get_current_user_id

router = APIRouter(tags=["Admin Org Tools - 组织工具服务模块"])


def _require_provider():
    provider = get_admin_org_tools_provider()
    if provider is None:
        raise ServiceUnavailable(
            message=t("errors", "ADMIN_ORG_TOOLS_PROVIDER_UNAVAILABLE", default="组织工具服务不可用"),
            error="ADMIN_ORG_TOOLS_PROVIDER_UNAVAILABLE",
        )
    return provider


@router.post(
    "/validate",
    response_model=ResponseModel[OrgValidateReport],
    dependencies=[require_permission_strict("admin:org:tools:validate")],
)
async def validate_org() -> ResponseModel[OrgValidateReport]:
    provider = _require_provider()
    report = await provider.validate()
    return Response.success(data=OrgValidateReport.model_validate(report))


@router.post(
    "/repair/directory",
    response_model=ResponseModel[OrgRepairResult],
    dependencies=[require_permission_strict("admin:org:tools:repair")],
)
async def repair_directory(
    actor_user_id: UUID = Depends(get_current_user_id),
) -> ResponseModel[OrgRepairResult]:
    provider = _require_provider()
    result = await provider.repair_directory(actor_user_id=actor_user_id)
    return Response.success(data=OrgRepairResult.model_validate(result))


@router.post(
    "/repair/primary-department",
    response_model=ResponseModel[OrgRepairResult],
    dependencies=[require_permission_strict("admin:org:tools:repair")],
)
async def repair_primary_department(
    actor_user_id: UUID = Depends(get_current_user_id),
) -> ResponseModel[OrgRepairResult]:
    provider = _require_provider()
    result = await provider.repair_primary_department(actor_user_id=actor_user_id)
    return Response.success(data=OrgRepairResult.model_validate(result))


@router.post(
    "/departments/{department_id}/move",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:org:tools:move")],
)
async def move_department(
    department_id: UUID,
    body: DepartmentMoveRequest,
    actor_user_id: UUID = Depends(get_current_user_id),
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.move_department(department_id=department_id, payload=body, actor_user_id=actor_user_id)
    return Response.success()


@router.post(
    "/departments/{department_id}/merge",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:org:tools:merge")],
)
async def merge_department(
    department_id: UUID,
    body: DepartmentMergeRequest,
    actor_user_id: UUID = Depends(get_current_user_id),
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.merge_department(department_id=department_id, payload=body, actor_user_id=actor_user_id)
    return Response.success()


@router.post(
    "/departments/reorder",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("admin:org:tools:reorder")],
)
async def reorder_departments(
    body: DepartmentReorderRequest,
    actor_user_id: UUID = Depends(get_current_user_id),
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.reorder_departments(payload=body, actor_user_id=actor_user_id)
    return Response.success()
