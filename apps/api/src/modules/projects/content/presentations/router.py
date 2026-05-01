from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.projects.content.presentations.router_helpers import (
    ContentPresentationListOut,
    ProjectContentCanonicalItemReadService,
    get_project_content_presentations_service,
)
from src.modules.projects.content.shared.router import (
    ProjectContentRouteContext,
    require_project_content_read_context,
)

router = APIRouter(
    prefix="/projects/{project_id}/content",
    tags=["domain.projects.content"],
)


@router.get(
    "/items/{item_id}/versions/{version_number}/presentations",
    response_model=ResponseModel[ContentPresentationListOut],
    response_model_exclude_none=True,
    summary="List rebuilt content presentations for a version (project RBAC protected)",
)
async def list_project_content_presentations(
    item_id: PublicUUID,
    version_number: int,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_read_context)],
    service: Annotated[
        ProjectContentCanonicalItemReadService,
        Depends(get_project_content_presentations_service),
    ],
) -> ResponseModel[ContentPresentationListOut]:
    items = await service.list_presentations(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
        item_id=item_id,
        version_number=version_number,
    )
    return ApiResponse.success(data=ContentPresentationListOut(items=items))
