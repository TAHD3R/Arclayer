from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.http.router_helpers import (
    get_project_runtime_context,
    get_project_runtime_service,
    require_project_permission,
)
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.projects.publish.preview_service import ProjectPublishPreviewService
from src.modules.projects.publish.router_helpers import (
    get_project_publish_preview_service,
    get_project_publish_service,
)
from src.modules.projects.publish.schema import PublishExportContractOut, PublishReadinessOut
from src.modules.projects.publish.service import ProjectPublishService
from src.modules.projects.runtime.service import ProjectRuntimeService

router = APIRouter(prefix="/projects/{project_id}/publish", tags=["domain.projects.publish"])


@router.get(
    "/impact",
    response_model=ResponseModel[PublishReadinessOut],
    response_model_exclude_none=True,
    summary="Preview project publish impact",
    dependencies=[require_project_permission("project:release:read")],
)
async def get_project_publish_impact(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    service: Annotated[ProjectPublishService, Depends(get_project_publish_service)],
) -> ResponseModel[PublishReadinessOut]:
    runtime_context = await get_project_runtime_context(
        ctx=ctx,
        actor_user_id=actor_user_id,
        runtime_service=runtime_service,
    )
    data = await service.preview_impact(workspace_id=runtime_context.workspace_id, site_id=runtime_context.site_id)
    return ApiResponse.success(data=data)


@router.get(
    "/preview-contract",
    response_model=ResponseModel[PublishExportContractOut],
    response_model_exclude_none=True,
    summary="Read preview contract from project publish artifacts",
    dependencies=[require_project_permission("project:release:read")],
)
async def get_project_publish_preview_contract(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    service: Annotated[ProjectPublishPreviewService, Depends(get_project_publish_preview_service)],
) -> ResponseModel[PublishExportContractOut]:
    runtime_context = await get_project_runtime_context(
        ctx=ctx,
        actor_user_id=actor_user_id,
        runtime_service=runtime_service,
    )
    data = await service.build_preview_contract(
        workspace_id=runtime_context.workspace_id,
        site_id=runtime_context.site_id,
    )
    return ApiResponse.success(data=data)
