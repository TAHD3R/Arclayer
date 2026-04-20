from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.projects.content.bindings.router_helpers import (
    ContentComponentBindingListOut,
    ProjectContentCanonicalItemReadService,
    get_project_content_bindings_service,
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
    "/items/{item_id}/versions/{version_number}/bindings",
    response_model=ResponseModel[ContentComponentBindingListOut],
    response_model_exclude_none=True,
    summary="List rebuilt component bindings for a version (project RBAC protected)",
)
async def list_project_content_bindings(
    item_id: PublicUUID,
    version_number: int,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_read_context)],
    service: Annotated[
        ProjectContentCanonicalItemReadService,
        Depends(get_project_content_bindings_service),
    ],
) -> ResponseModel[ContentComponentBindingListOut]:
    items = await service.list_component_bindings(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        item_id=item_id,
        version_number=version_number,
    )
    return ApiResponse.success(data=ContentComponentBindingListOut(items=items))
