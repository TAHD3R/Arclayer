from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, status

from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.core.http.pagination import PageData, PageParams, get_page_params, paginate_items
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.workspaces.content.router_shared import _resolve_site_id, get_workspace_content_service
from apps.api.src.modules.workspaces.content.schema import (
    ContentBlockCreateIn,
    ContentBlockDeleteOut,
    ContentBlockOut,
    ContentBlockUpdateIn,
    ContentBlockUsagesOut,
)
from apps.api.src.modules.workspaces.content.service import WorkspaceContentService
from apps.api.src.modules.workspaces.deps import WorkspaceContext, require_workspace_manage_access

blocks_router = APIRouter(prefix="/blocks")


@blocks_router.get(
    "",
    response_model=ResponseModel[PageData[ContentBlockOut]],
    response_model_exclude_none=True,
    summary="List content blocks (workspace RBAC protected)",
)
async def list_workspace_content_blocks(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[ContentBlockOut]]:
    rows = await service.list_blocks(site_id=site_id)
    data = paginate_items(rows, params=params)
    return Response.success(data=data)


@blocks_router.post(
    "",
    response_model=ResponseModel[ContentBlockOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a content block (workspace RBAC protected)",
)
async def create_workspace_content_block(
    payload: Annotated[ContentBlockCreateIn, Body(description="Create content block payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentBlockOut]:
    data = await service.create_block(site_id=site_id, payload=payload)
    return Response.success(data=data)


@blocks_router.patch(
    "/{block_id}",
    response_model=ResponseModel[ContentBlockOut],
    response_model_exclude_none=True,
    summary="Update a content block (workspace RBAC protected)",
)
async def update_workspace_content_block(
    block_id: PublicUUID,
    payload: Annotated[ContentBlockUpdateIn, Body(description="Update content block payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentBlockOut]:
    data = await service.update_block(site_id=site_id, block_id=block_id, payload=payload)
    return Response.success(data=data)


@blocks_router.delete(
    "/{block_id}",
    response_model=ResponseModel[ContentBlockDeleteOut],
    response_model_exclude_none=True,
    summary="Delete a content block (workspace RBAC protected)",
)
async def delete_workspace_content_block(
    block_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentBlockDeleteOut]:
    data = await service.delete_block(site_id=site_id, block_id=block_id)
    return Response.success(data=data)


@blocks_router.get(
    "/{block_id}/usages",
    response_model=ResponseModel[ContentBlockUsagesOut],
    response_model_exclude_none=True,
    summary="List content block usages (workspace RBAC protected)",
)
async def list_workspace_content_block_usages(
    block_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentBlockUsagesOut]:
    data = await service.get_block_usages(workspace_id=ctx.workspace_id, site_id=site_id, block_id=block_id)
    return Response.success(data=data)
