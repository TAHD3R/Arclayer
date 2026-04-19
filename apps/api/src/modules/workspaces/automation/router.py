from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.automation.schema import (
    AutomationCatalogOut,
    AutomationFlowCreateIn,
    AutomationFlowListOut,
    AutomationFlowOut,
    AutomationFlowPatchIn,
    AutomationRunListOut,
    AutomationRunOut,
)
from src.modules.workspaces.automation.service import WorkspaceAutomationService
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access

router = APIRouter(
    prefix="/workspaces/{workspace_id}/automation",
    tags=["domain.workspaces.automation"],
    dependencies=[require_workspace_permission("system:automation:read")],
)


def get_workspace_automation_service(settings: Settings = Depends(get_settings)) -> WorkspaceAutomationService:
    return WorkspaceAutomationService(settings)


@router.get(
    "/catalog",
    response_model=ResponseModel[AutomationCatalogOut],
    response_model_exclude_none=True,
    summary="List automation triggers and operation kinds",
)
async def get_workspace_automation_catalog(
    service: Annotated[WorkspaceAutomationService, Depends(get_workspace_automation_service)],
) -> ResponseModel[AutomationCatalogOut]:
    return ApiResponse.success(data=await service.get_catalog_out())


@router.get(
    "/flows",
    response_model=ResponseModel[AutomationFlowListOut],
    response_model_exclude_none=True,
    summary="List workspace automation flows",
)
async def list_workspace_automation_flows(
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceAutomationService, Depends(get_workspace_automation_service)],
) -> ResponseModel[AutomationFlowListOut]:
    return ApiResponse.success(data=await service.list_flows_out(workspace_id=ctx.workspace_id))


@router.post(
    "/flows",
    response_model=ResponseModel[AutomationFlowOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a workspace automation flow",
    dependencies=[require_workspace_permission("system:automation:manage")],
)
async def create_workspace_automation_flow(
    payload: AutomationFlowCreateIn,
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[PublicUUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceAutomationService, Depends(get_workspace_automation_service)],
) -> ResponseModel[AutomationFlowOut]:
    return ApiResponse.success(
        data=await service.create_flow_out(
            workspace_id=ctx.workspace_id,
            actor_user_id=actor_user_id,
            payload=payload,
        )
    )


@router.patch(
    "/flows/{flow_id}",
    response_model=ResponseModel[AutomationFlowOut],
    response_model_exclude_none=True,
    summary="Update a workspace automation flow",
    dependencies=[require_workspace_permission("system:automation:manage")],
)
async def update_workspace_automation_flow(
    flow_id: PublicUUID,
    payload: AutomationFlowPatchIn,
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[PublicUUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceAutomationService, Depends(get_workspace_automation_service)],
) -> ResponseModel[AutomationFlowOut]:
    return ApiResponse.success(
        data=await service.update_flow_out(
            workspace_id=ctx.workspace_id,
            flow_id=flow_id,
            actor_user_id=actor_user_id,
            payload=payload,
        )
    )


@router.delete(
    "/flows/{flow_id}",
    response_model=ResponseModel[None],
    summary="Delete a workspace automation flow",
    dependencies=[require_workspace_permission("system:automation:manage")],
)
async def delete_workspace_automation_flow(
    flow_id: PublicUUID,
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceAutomationService, Depends(get_workspace_automation_service)],
) -> ResponseModel[None]:
    await service.delete_flow(workspace_id=ctx.workspace_id, flow_id=flow_id)
    return ApiResponse.success()


@router.get(
    "/runs",
    response_model=ResponseModel[AutomationRunListOut],
    response_model_exclude_none=True,
    summary="List workspace automation runs",
)
async def list_workspace_automation_runs(
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceAutomationService, Depends(get_workspace_automation_service)],
    limit: int = Query(default=50, ge=1, le=100),
) -> ResponseModel[AutomationRunListOut]:
    return ApiResponse.success(data=await service.list_runs_out(workspace_id=ctx.workspace_id, limit=limit))


@router.get(
    "/runs/{run_id}",
    response_model=ResponseModel[AutomationRunOut],
    response_model_exclude_none=True,
    summary="Get a workspace automation run with logs",
)
async def get_workspace_automation_run(
    run_id: PublicUUID,
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceAutomationService, Depends(get_workspace_automation_service)],
) -> ResponseModel[AutomationRunOut]:
    return ApiResponse.success(data=await service.get_run_out(workspace_id=ctx.workspace_id, run_id=run_id))
