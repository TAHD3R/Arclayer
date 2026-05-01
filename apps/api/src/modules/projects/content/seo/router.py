from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.projects.content.seo.router_helpers import (
    ContentSeoProfileOut,
    ProjectContentCanonicalItemReadService,
    get_project_content_seo_service,
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
    "/items/{item_id}/versions/{version_number}/seo",
    response_model=ResponseModel[ContentSeoProfileOut],
    response_model_exclude_none=True,
    summary="Get rebuilt content SEO profile for a version (project RBAC protected)",
)
async def get_project_content_seo_profile(
    item_id: PublicUUID,
    version_number: int,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_read_context)],
    service: Annotated[
        ProjectContentCanonicalItemReadService,
        Depends(get_project_content_seo_service),
    ],
) -> ResponseModel[ContentSeoProfileOut]:
    data = await service.get_seo_profile(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
        item_id=item_id,
        version_number=version_number,
    )
    return ApiResponse.success(data=data)
