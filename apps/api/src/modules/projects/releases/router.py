from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.http.router_helpers import (
    get_project_runtime_context,
    get_project_runtime_service,
    require_project_permission,
)
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.projects.releases.router_helpers import get_project_releases_service
from src.modules.projects.releases.schema import (
    ReleaseCancelScheduledOut,
    ReleaseDryRunOut,
    ReleaseListOut,
    ReleaseOut,
    ReleasePublishIn,
    ReleasePublishOut,
    ReleaseRollbackOut,
)
from src.modules.projects.releases.service import ProjectReleasesService
from src.modules.projects.runtime.service import ProjectRuntimeService

router = APIRouter(prefix="/projects/{project_id}/releases", tags=["domain.projects.releases"])


@router.get(
    "",
    response_model=ResponseModel[ReleaseListOut],
    response_model_exclude_none=True,
    summary="List project releases",
    dependencies=[require_project_permission("project:release:read")],
)
async def list_project_releases(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    service: Annotated[ProjectReleasesService, Depends(get_project_releases_service)],
) -> ResponseModel[ReleaseListOut]:
    runtime_context = await get_project_runtime_context(
        ctx=ctx,
        actor_user_id=actor_user_id,
        runtime_service=runtime_service,
    )
    data = await service.list_releases_out(workspace_id=runtime_context.workspace_id, site_id=runtime_context.site_id)
    return ApiResponse.success(data=data)


@router.get(
    "/dry-run",
    response_model=ResponseModel[ReleaseDryRunOut],
    response_model_exclude_none=True,
    summary="Preview project release readiness and diagnostics",
    dependencies=[require_project_permission("project:release:read")],
)
async def get_project_release_dry_run(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    service: Annotated[ProjectReleasesService, Depends(get_project_releases_service)],
) -> ResponseModel[ReleaseDryRunOut]:
    runtime_context = await get_project_runtime_context(
        ctx=ctx,
        actor_user_id=actor_user_id,
        runtime_service=runtime_service,
    )
    data = await service.get_release_dry_run_out(
        workspace_id=runtime_context.workspace_id,
        site_id=runtime_context.site_id,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/{release_id}",
    response_model=ResponseModel[ReleaseOut],
    response_model_exclude_none=True,
    summary="Get project release",
    dependencies=[require_project_permission("project:release:read")],
)
async def get_project_release(
    release_id: PublicUUID,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    service: Annotated[ProjectReleasesService, Depends(get_project_releases_service)],
) -> ResponseModel[ReleaseOut]:
    runtime_context = await get_project_runtime_context(
        ctx=ctx,
        actor_user_id=actor_user_id,
        runtime_service=runtime_service,
    )
    data = await service.get_release_out(
        workspace_id=runtime_context.workspace_id,
        site_id=runtime_context.site_id,
        release_id=release_id,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/publish",
    response_model=ResponseModel[ReleasePublishOut],
    response_model_exclude_none=True,
    summary="Publish a new project release",
    dependencies=[require_project_permission("project:release:publish")],
)
async def publish_project_release(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    service: Annotated[ProjectReleasesService, Depends(get_project_releases_service)],
    payload: ReleasePublishIn | None = None,
) -> ResponseModel[ReleasePublishOut]:
    runtime_context = await get_project_runtime_context(
        ctx=ctx,
        actor_user_id=actor_user_id,
        runtime_service=runtime_service,
    )
    data = await service.publish_release_out(
        workspace_id=runtime_context.workspace_id,
        site_id=runtime_context.site_id,
        actor_user_id=actor_user_id,
        scheduled_at=payload.scheduled_at if payload is not None else None,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/{release_id}/cancel-schedule",
    response_model=ResponseModel[ReleaseCancelScheduledOut],
    response_model_exclude_none=True,
    summary="Cancel a scheduled project release",
    dependencies=[require_project_permission("project:release:publish")],
)
async def cancel_scheduled_project_release(
    release_id: PublicUUID,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    service: Annotated[ProjectReleasesService, Depends(get_project_releases_service)],
) -> ResponseModel[ReleaseCancelScheduledOut]:
    runtime_context = await get_project_runtime_context(
        ctx=ctx,
        actor_user_id=actor_user_id,
        runtime_service=runtime_service,
    )
    data = await service.cancel_scheduled_publish_out(
        workspace_id=runtime_context.workspace_id,
        site_id=runtime_context.site_id,
        release_id=release_id,
        actor_user_id=actor_user_id,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/{release_id}/rollback",
    response_model=ResponseModel[ReleaseRollbackOut],
    response_model_exclude_none=True,
    summary="Rollback a project release",
    dependencies=[require_project_permission("project:release:rollback")],
)
async def rollback_project_release(
    release_id: PublicUUID,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    service: Annotated[ProjectReleasesService, Depends(get_project_releases_service)],
) -> ResponseModel[ReleaseRollbackOut]:
    runtime_context = await get_project_runtime_context(
        ctx=ctx,
        actor_user_id=actor_user_id,
        runtime_service=runtime_service,
    )
    data = await service.rollback_release_out(
        workspace_id=runtime_context.workspace_id,
        site_id=runtime_context.site_id,
        release_id=release_id,
        actor_user_id=actor_user_id,
    )
    return ApiResponse.success(data=data)
