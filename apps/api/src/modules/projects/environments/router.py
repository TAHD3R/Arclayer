from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.projects.environments.schema import (
    ProjectEnvironmentListOut,
    ProjectEnvironmentOut,
    ProjectEnvironmentPatchIn,
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
    service: Annotated[ProjectEnvironmentsService, Depends(get_project_environments_service)],
) -> ResponseModel[ProjectEnvironmentOut]:
    return ApiResponse.success(
        data=await service.patch_environment_out(
            project_id=ctx.project_id,
            environment_id=environment_id,
            payload=payload,
        )
    )
