from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.src.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.workspaces.content.contracts.schema import ContentModelOut
from apps.api.src.modules.workspaces.content.service import WorkspaceContentService
from apps.api.src.modules.workspaces.content.shared.router import _resolve_site_id, get_workspace_content_service
from apps.api.src.modules.workspaces.http.schema import WorkspaceContext
from apps.api.src.modules.workspaces.http.service import require_workspace_manage_access

models_router = APIRouter(prefix="/models")


@models_router.get(
    "",
    response_model=ResponseModel[PageData[ContentModelOut]],
    response_model_exclude_none=True,
    summary="List content models (workspace RBAC protected)",
)
async def list_workspace_content_models(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[ContentModelOut]]:
    data = await service.list_models_paginated(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        params=params,
    )
    return Response.success(data=data)
