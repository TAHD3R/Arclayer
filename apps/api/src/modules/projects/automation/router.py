from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.authz.router_helpers import ensure_project_permission_granted
from src.modules.projects.automation.schema import (
    AutomationCatalogOut,
    AutomationFlowCreateIn,
    AutomationFlowListOut,
    AutomationFlowOut,
    AutomationFlowPatchIn,
    AutomationRunListOut,
    AutomationRunOut,
)
from src.modules.projects.automation.service import ProjectAutomationService
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context

router = APIRouter(prefix="/projects/{project_id}/automation", tags=["domain.projects.automation"])


async def _require_project_automation_permission(
    permission: str,
    *,
    ctx: ProjectRequestContext,
    user_id: UUID,
) -> None:
    await ensure_project_permission_granted(
        permission,
        user_id=user_id,
        ctx=ctx,
        error_code="PERMISSION_DENIED",
    )


def get_project_automation_service(settings: Settings = Depends(get_settings)) -> ProjectAutomationService:
    return ProjectAutomationService(settings)


@router.get(
    "/catalog",
    response_model=ResponseModel[AutomationCatalogOut],
    response_model_exclude_none=True,
    summary="List project automation triggers and operation kinds",
)
async def list_project_automation_catalog(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ProjectAutomationService, Depends(get_project_automation_service)],
) -> ResponseModel[AutomationCatalogOut]:
    await _require_project_automation_permission("system:automation:read", ctx=ctx, user_id=user_id)
    return ApiResponse.success(data=await service.get_project_catalog_out())


@router.get(
    "/flows",
    response_model=ResponseModel[AutomationFlowListOut],
    response_model_exclude_none=True,
    summary="List project automation flows",
)
async def list_project_automation_flows(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ProjectAutomationService, Depends(get_project_automation_service)],
) -> ResponseModel[AutomationFlowListOut]:
    await _require_project_automation_permission("system:automation:read", ctx=ctx, user_id=user_id)
    data = await service.list_project_flows_out(workspace_id=ctx.workspace_id, project_id=ctx.project_id)
    return ApiResponse.success(data=data)


@router.post(
    "/flows",
    response_model=ResponseModel[AutomationFlowOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a project automation flow",
)
async def create_project_automation_flow(
    payload: AutomationFlowCreateIn,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ProjectAutomationService, Depends(get_project_automation_service)],
) -> ResponseModel[AutomationFlowOut]:
    await _require_project_automation_permission(
        "system:automation:manage",
        ctx=ctx,
        user_id=actor_user_id,
    )
    data = await service.create_project_flow_out(
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.patch(
    "/flows/{flow_id}",
    response_model=ResponseModel[AutomationFlowOut],
    response_model_exclude_none=True,
    summary="Update a project automation flow",
)
async def update_project_automation_flow(
    flow_id: PublicUUID,
    payload: AutomationFlowPatchIn,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ProjectAutomationService, Depends(get_project_automation_service)],
) -> ResponseModel[AutomationFlowOut]:
    await _require_project_automation_permission(
        "system:automation:manage",
        ctx=ctx,
        user_id=actor_user_id,
    )
    data = await service.update_project_flow_out(
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        flow_id=UUID(str(flow_id)),
        actor_user_id=actor_user_id,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.delete(
    "/flows/{flow_id}",
    response_model=ResponseModel[None],
    summary="Delete a project automation flow",
)
async def delete_project_automation_flow(
    flow_id: PublicUUID,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ProjectAutomationService, Depends(get_project_automation_service)],
) -> ResponseModel[None]:
    await _require_project_automation_permission(
        "system:automation:manage",
        ctx=ctx,
        user_id=actor_user_id,
    )
    await service.delete_project_flow(
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        flow_id=UUID(str(flow_id)),
    )
    return ApiResponse.success()


@router.get(
    "/runs",
    response_model=ResponseModel[AutomationRunListOut],
    response_model_exclude_none=True,
    summary="List project automation runs",
)
async def list_project_automation_runs(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ProjectAutomationService, Depends(get_project_automation_service)],
    limit: int = Query(default=50, ge=1, le=100),
) -> ResponseModel[AutomationRunListOut]:
    await _require_project_automation_permission("system:automation:read", ctx=ctx, user_id=user_id)
    data = await service.list_project_runs_out(
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        limit=limit,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/runs/{run_id}",
    response_model=ResponseModel[AutomationRunOut],
    response_model_exclude_none=True,
    summary="Get a project automation run with logs",
)
async def get_project_automation_run(
    run_id: PublicUUID,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ProjectAutomationService, Depends(get_project_automation_service)],
) -> ResponseModel[AutomationRunOut]:
    await _require_project_automation_permission("system:automation:read", ctx=ctx, user_id=user_id)
    data = await service.get_project_run_out(
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        run_id=UUID(str(run_id)),
    )
    return ApiResponse.success(data=data)
