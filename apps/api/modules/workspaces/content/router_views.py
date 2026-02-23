from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, status

from apps.api.common.types.public_uuid import PublicUUID
from apps.api.core.http.pagination import PageData, PageParams, get_page_params, paginate_items
from apps.api.core.http.response import Response, ResponseModel
from apps.api.modules.workspaces.content.router_shared import _resolve_site_id, get_workspace_content_service
from apps.api.modules.workspaces.content.schema import (
    ContentViewCreateIn,
    ContentViewDeleteOut,
    ContentViewOut,
    ContentViewPreviewIn,
    ContentViewPreviewOut,
    ContentViewUpdateIn,
)
from apps.api.modules.workspaces.content.service import WorkspaceContentService
from apps.api.modules.workspaces.deps import WorkspaceContext, require_workspace_manage_access

views_router = APIRouter(prefix="/views")


@views_router.get(
    "",
    response_model=ResponseModel[PageData[ContentViewOut]],
    response_model_exclude_none=True,
    summary="List content views (workspace RBAC protected)",
)
async def list_workspace_content_views(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[ContentViewOut]]:
    rows = await service.list_views(site_id=site_id)
    data = paginate_items(rows, params=params)
    return Response.success(data=data)


@views_router.post(
    "",
    response_model=ResponseModel[ContentViewOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a content view (workspace RBAC protected)",
)
async def create_workspace_content_view(
    payload: Annotated[ContentViewCreateIn, Body(description="Create content view payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentViewOut]:
    data = await service.create_view(workspace_id=ctx.workspace_id, site_id=site_id, payload=payload)
    return Response.success(data=data)


@views_router.patch(
    "/{view_id}",
    response_model=ResponseModel[ContentViewOut],
    response_model_exclude_none=True,
    summary="Update a content view (workspace RBAC protected)",
)
async def update_workspace_content_view(
    view_id: PublicUUID,
    payload: Annotated[ContentViewUpdateIn, Body(description="Update content view payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentViewOut]:
    data = await service.update_view(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        view_id=view_id,
        payload=payload,
    )
    return Response.success(data=data)


@views_router.delete(
    "/{view_id}",
    response_model=ResponseModel[ContentViewDeleteOut],
    response_model_exclude_none=True,
    summary="Delete a content view (workspace RBAC protected)",
)
async def delete_workspace_content_view(
    view_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentViewDeleteOut]:
    data = await service.delete_view(site_id=site_id, view_id=view_id)
    return Response.success(data=data)


@views_router.post(
    "/{view_id}/preview",
    response_model=ResponseModel[ContentViewPreviewOut],
    response_model_exclude_none=True,
    summary="Preview content view execution (workspace RBAC protected)",
)
async def preview_workspace_content_view(
    view_id: PublicUUID,
    payload: Annotated[ContentViewPreviewIn, Body(description="Preview content view payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentViewPreviewOut]:
    data = await service.preview_view(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        view_id=view_id,
        payload=payload,
    )
    return Response.success(data=data)
