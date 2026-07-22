from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.jobs.workspace_schema import (
    WorkspaceJobCancelRequest,
    WorkspaceJobListQuery,
    WorkspaceJobOut,
)
from src.modules.jobs.workspace_service import WorkspaceJobService
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access

router = APIRouter(
    prefix="/workspaces/{workspace_id}/jobs",
    tags=["domain.workspaces.jobs"],
    dependencies=[require_workspace_permission("system:jobs:read")],
)


def get_workspace_job_service(settings: Settings = Depends(get_settings)) -> WorkspaceJobService:
    return WorkspaceJobService(settings)


@router.get(
    "",
    response_model=ResponseModel[PageData[WorkspaceJobOut]],
    response_model_exclude_none=True,
    summary="List authorized workspace background jobs",
)
async def list_workspace_jobs(
    filters: Annotated[WorkspaceJobListQuery, Depends()],
    params: Annotated[PageParams, Depends(get_page_params)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceJobService, Depends(get_workspace_job_service)],
) -> ResponseModel[PageData[WorkspaceJobOut]]:
    """List the caller-visible Job projection after row-level visibility filtering."""

    page = await service.list_jobs(
        workspace_id=ctx.workspace_id,
        actor_user_id=user_id,
        params=params,
        filters=filters,
    )
    return ApiResponse.success(data=page)


@router.get(
    "/{job_id}",
    response_model=ResponseModel[WorkspaceJobOut],
    response_model_exclude_none=True,
    summary="Get an authorized workspace background job",
)
async def get_workspace_job(
    job_id: PublicUUID,
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceJobService, Depends(get_workspace_job_service)],
) -> ResponseModel[WorkspaceJobOut]:
    """Read one safe Job projection without transport, lease, or raw provider data."""

    job = await service.get_job(
        workspace_id=ctx.workspace_id,
        job_id=job_id,
        actor_user_id=user_id,
    )
    return ApiResponse.success(data=job)


@router.post(
    "/{job_id}/cancel",
    response_model=ResponseModel[WorkspaceJobOut],
    response_model_exclude_none=True,
    summary="Request cancellation of a workspace background job",
)
async def cancel_workspace_job(
    job_id: PublicUUID,
    payload: WorkspaceJobCancelRequest,
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceJobService, Depends(get_workspace_job_service)],
) -> ResponseModel[WorkspaceJobOut]:
    """Record a cooperative cancellation request without claiming terminal cancellation."""

    job = await service.request_cancellation(
        ctx=ctx,
        job_id=job_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiResponse.success(data=job)
