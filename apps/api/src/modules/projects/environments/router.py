from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.environments.schema import (
    ProjectEnvironmentAliasOut,
    ProjectEnvironmentAliasSwitchIn,
    ProjectEnvironmentCloneIn,
    ProjectEnvironmentCopyOut,
    ProjectEnvironmentListOut,
    ProjectEnvironmentOut,
    ProjectEnvironmentPatchIn,
    ProjectEnvironmentPromoteIn,
)
from src.modules.projects.environments.service import ProjectEnvironmentsService
from src.modules.projects.http.router_helpers import require_project_permission
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context

router = APIRouter(prefix="/projects/{project_id}/environments", tags=["domain.projects.environments"])


def get_project_environments_service() -> ProjectEnvironmentsService:
    return ProjectEnvironmentsService()


@router.get(
    "",
    response_model=ResponseModel[ProjectEnvironmentListOut],
    response_model_exclude_none=True,
    summary="List project environments",
    dependencies=[require_project_permission("project:settings:read")],
)
async def list_project_environments(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    service: Annotated[ProjectEnvironmentsService, Depends(get_project_environments_service)],
) -> ResponseModel[ProjectEnvironmentListOut]:
    """List project environments and aliases."""
    return ApiResponse.success(data=await service.list_environments_out(project_id=ctx.project_id))


@router.patch(
    "/{environment_id}",
    response_model=ResponseModel[ProjectEnvironmentOut],
    response_model_exclude_none=True,
    summary="Update project environment",
    dependencies=[require_project_permission("project:settings:manage")],
)
async def patch_project_environment(
    environment_id: PublicUUID,
    payload: ProjectEnvironmentPatchIn,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ProjectEnvironmentsService, Depends(get_project_environments_service)],
) -> ResponseModel[ProjectEnvironmentOut]:
    """Update project environment settings."""
    return ApiResponse.success(
        data=await service.patch_environment_out(
            project_id=ctx.project_id,
            environment_id=environment_id,
            payload=payload,
            actor_user_id=actor_user_id,
            workspace_id=ctx.workspace_id,
        )
    )


@router.patch(
    "/aliases/{alias_key}",
    response_model=ResponseModel[ProjectEnvironmentAliasOut],
    response_model_exclude_none=True,
    summary="Switch project environment alias",
    dependencies=[require_project_permission("project:settings:manage")],
)
async def switch_project_environment_alias(
    alias_key: str,
    payload: ProjectEnvironmentAliasSwitchIn,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID | None, Depends(get_current_user_id)],
    service: Annotated[ProjectEnvironmentsService, Depends(get_project_environments_service)],
) -> ResponseModel[ProjectEnvironmentAliasOut]:
    """Switch an environment alias target."""
    return ApiResponse.success(
        data=await service.switch_alias_out(
            project_id=ctx.project_id,
            alias_key=alias_key,
            payload=payload,
            actor_user_id=actor_user_id,
        )
    )


@router.post(
    "/clone",
    response_model=ResponseModel[ProjectEnvironmentCopyOut],
    response_model_exclude_none=True,
    summary="Clone project content environment",
    dependencies=[require_project_permission("project:settings:manage")],
)
async def clone_project_environment(
    payload: ProjectEnvironmentCloneIn,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    service: Annotated[ProjectEnvironmentsService, Depends(get_project_environments_service)],
) -> ResponseModel[ProjectEnvironmentCopyOut]:
    """Clone content schema and content into an empty environment."""
    return ApiResponse.success(data=await service.clone_environment_out(project_id=ctx.project_id, payload=payload))


@router.post(
    "/promote",
    response_model=ResponseModel[ProjectEnvironmentCopyOut],
    response_model_exclude_none=True,
    summary="Promote project content environment",
    dependencies=[require_project_permission("project:settings:manage")],
)
async def promote_project_environment(
    payload: ProjectEnvironmentPromoteIn,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    service: Annotated[ProjectEnvironmentsService, Depends(get_project_environments_service)],
) -> ResponseModel[ProjectEnvironmentCopyOut]:
    """Replace a target environment with promoted source content."""
    return ApiResponse.success(data=await service.promote_environment_out(project_id=ctx.project_id, payload=payload))
