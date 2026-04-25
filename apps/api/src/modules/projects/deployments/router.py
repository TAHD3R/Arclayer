from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from src.common.types.public_uuid import PublicUUID
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.deployments.schema import (
    ProjectDeploymentActionOut,
    ProjectDeploymentListOut,
    ProjectDeploymentOut,
    ProjectDeploymentPromoteIn,
    ProjectDeploymentRollbackIn,
)
from src.modules.projects.deployments.service import ProjectDeploymentsService
from src.modules.projects.http.router_helpers import require_project_permission
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context

router = APIRouter(prefix="/projects/{project_id}/deployments", tags=["domain.projects.deployments"])


def get_project_deployments_service() -> ProjectDeploymentsService:
    return ProjectDeploymentsService()


@router.get(
    "",
    response_model=ResponseModel[ProjectDeploymentListOut],
    response_model_exclude_none=True,
    summary="List project deployments",
    dependencies=[require_project_permission("project:deployments:read")],
)
async def list_project_deployments(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    service: Annotated[ProjectDeploymentsService, Depends(get_project_deployments_service)],
    environment_id: PublicUUID | None = Query(default=None, alias="environmentId"),
    status: str | None = Query(default=None),
) -> ResponseModel[ProjectDeploymentListOut]:
    return ApiResponse.success(
        data=await service.list_deployments_out(
            project_id=ctx.project_id,
            environment_id=UUID(str(environment_id)) if environment_id is not None else None,
            status=status,
        )
    )


@router.get(
    "/{deployment_id}",
    response_model=ResponseModel[ProjectDeploymentOut],
    response_model_exclude_none=True,
    summary="Get project deployment",
    dependencies=[require_project_permission("project:deployments:read")],
)
async def get_project_deployment(
    deployment_id: PublicUUID,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    service: Annotated[ProjectDeploymentsService, Depends(get_project_deployments_service)],
) -> ResponseModel[ProjectDeploymentOut]:
    return ApiResponse.success(
        data=await service.get_deployment_out(project_id=ctx.project_id, deployment_id=deployment_id)
    )


@router.post(
    "/{deployment_id}/promote",
    response_model=ResponseModel[ProjectDeploymentActionOut],
    response_model_exclude_none=True,
    summary="Promote project deployment",
    dependencies=[require_project_permission("project:deployments:promote")],
)
async def promote_project_deployment(
    deployment_id: PublicUUID,
    payload: ProjectDeploymentPromoteIn,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ProjectDeploymentsService, Depends(get_project_deployments_service)],
) -> ResponseModel[ProjectDeploymentActionOut]:
    return ApiResponse.success(
        data=await service.promote_deployment_out(
            project_id=ctx.project_id,
            deployment_id=deployment_id,
            environment_id=payload.environment_id,
            actor_user_id=actor_user_id,
        )
    )


@router.post(
    "/{deployment_id}/rollback",
    response_model=ResponseModel[ProjectDeploymentActionOut],
    response_model_exclude_none=True,
    summary="Rollback project deployment",
    dependencies=[require_project_permission("project:deployments:rollback")],
)
async def rollback_project_deployment(
    deployment_id: PublicUUID,
    payload: ProjectDeploymentRollbackIn,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ProjectDeploymentsService, Depends(get_project_deployments_service)],
) -> ResponseModel[ProjectDeploymentActionOut]:
    return ApiResponse.success(
        data=await service.rollback_deployment_out(
            project_id=ctx.project_id,
            deployment_id=deployment_id,
            environment_id=payload.environment_id,
            actor_user_id=actor_user_id,
        )
    )


@router.post(
    "/{deployment_id}/cancel",
    response_model=ResponseModel[ProjectDeploymentActionOut],
    response_model_exclude_none=True,
    summary="Cancel project deployment",
    dependencies=[require_project_permission("project:deployments:manage")],
)
async def cancel_project_deployment(
    deployment_id: PublicUUID,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    service: Annotated[ProjectDeploymentsService, Depends(get_project_deployments_service)],
) -> ResponseModel[ProjectDeploymentActionOut]:
    return ApiResponse.success(
        data=await service.cancel_deployment_out(project_id=ctx.project_id, deployment_id=deployment_id)
    )
