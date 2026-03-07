from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.workspaces.content.contracts.schema import ContentItemOut, ContentVersionOut
from apps.api.src.modules.workspaces.content.service import WorkspaceContentService
from apps.api.src.modules.workspaces.content.shared.router import _resolve_site_id, get_workspace_content_service
from apps.api.src.modules.workspaces.http.schema import WorkspaceContext
from apps.api.src.modules.workspaces.http.service import require_workspace_manage_access

items_router = APIRouter(prefix="/items")


@items_router.get(
    "",
    response_model=ResponseModel[PageData[ContentItemOut]],
    response_model_exclude_none=True,
    summary="List content items (workspace RBAC protected)",
)
async def list_workspace_content_items(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
    params: PageParams = Depends(get_page_params),
    model_key: Annotated[str | None, Query(alias="modelKey", description="Optional content model key filter.")] = None,
) -> ResponseModel[PageData[ContentItemOut]]:
    data = await service.list_items_paginated(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        params=params,
        model_key=model_key,
    )
    return Response.success(data=data)


@items_router.get(
    "/{item_id}",
    response_model=ResponseModel[ContentItemOut],
    response_model_exclude_none=True,
    summary="Get content item detail (workspace RBAC protected)",
)
async def get_workspace_content_item(
    item_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentItemOut]:
    data = await service.get_item(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
    )
    return Response.success(data=data)


@items_router.get(
    "/{item_id}/versions/{state}",
    response_model=ResponseModel[ContentVersionOut],
    response_model_exclude_none=True,
    summary="Get content item version snapshot (workspace RBAC protected)",
)
async def get_workspace_content_item_version(
    item_id: PublicUUID,
    state: Literal["draft", "published"],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentVersionOut]:
    data = await service.get_item_version(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        state=state,
    )
    return Response.success(data=data)
