from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, status

from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.content.shared.router import (
    ProjectContentRouteContext,
    require_project_content_manage_context,
    require_project_content_read_context,
)
from src.modules.workspaces.content.views.router import (
    ContentLibraryViewCreateIn,
    ContentLibraryViewMoveIn,
    ContentLibraryViewPatchIn,
    ContentLibraryViewsService,
    ContentLibraryViewsStateOut,
    _resolve_can_manage_workspace_views,
    get_content_library_views_service,
)

router = APIRouter(
    prefix="/projects/{project_id}/content/library",
    tags=["domain.projects.content"],
)


@router.get(
    "/views",
    response_model=ResponseModel[ContentLibraryViewsStateOut],
    summary="List content library views visible to the current user",
)
async def list_project_content_library_views(
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_read_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ContentLibraryViewsService, Depends(get_content_library_views_service)],
) -> ResponseModel[ContentLibraryViewsStateOut]:
    return ApiResponse.success(data=await service.list_views(workspace_id=ctx.workspace_id, user_id=user_id))


@router.post(
    "/views",
    response_model=ResponseModel[ContentLibraryViewsStateOut],
    status_code=status.HTTP_201_CREATED,
    summary="Create a private or shared content library view",
)
async def create_project_content_library_view(
    payload: Annotated[ContentLibraryViewCreateIn, Body(description="Create content library view payload.")],
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ContentLibraryViewsService, Depends(get_content_library_views_service)],
) -> ResponseModel[ContentLibraryViewsStateOut]:
    can_manage = await _resolve_can_manage_workspace_views(user_id=user_id, ctx=ctx.workspace_ctx)
    return ApiResponse.success(
        data=await service.create_view(
            workspace_id=ctx.workspace_id,
            user_id=user_id,
            payload=payload,
            can_manage_workspace_views=can_manage,
        )
    )


@router.patch(
    "/views/{view_id}",
    response_model=ResponseModel[ContentLibraryViewsStateOut],
    summary="Update a content library view definition, visibility, pin state, or default state",
)
async def patch_project_content_library_view(
    view_id: str,
    payload: Annotated[ContentLibraryViewPatchIn, Body(description="Patch content library view payload.")],
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ContentLibraryViewsService, Depends(get_content_library_views_service)],
) -> ResponseModel[ContentLibraryViewsStateOut]:
    can_manage = await _resolve_can_manage_workspace_views(user_id=user_id, ctx=ctx.workspace_ctx)
    return ApiResponse.success(
        data=await service.update_view(
            workspace_id=ctx.workspace_id,
            user_id=user_id,
            view_id=view_id,
            payload=payload,
            can_manage_workspace_views=can_manage,
        )
    )


@router.post(
    "/views/{view_id}/move",
    response_model=ResponseModel[ContentLibraryViewsStateOut],
    summary="Reorder a content library view within its scope",
)
async def move_project_content_library_view(
    view_id: str,
    payload: Annotated[ContentLibraryViewMoveIn, Body(description="Move content library view payload.")],
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ContentLibraryViewsService, Depends(get_content_library_views_service)],
) -> ResponseModel[ContentLibraryViewsStateOut]:
    can_manage = await _resolve_can_manage_workspace_views(user_id=user_id, ctx=ctx.workspace_ctx)
    return ApiResponse.success(
        data=await service.move_view(
            workspace_id=ctx.workspace_id,
            user_id=user_id,
            view_id=view_id,
            direction=payload.direction,
            can_manage_workspace_views=can_manage,
        )
    )


@router.delete(
    "/views/{view_id}",
    response_model=ResponseModel[ContentLibraryViewsStateOut],
    summary="Delete a content library view",
)
async def delete_project_content_library_view(
    view_id: str,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ContentLibraryViewsService, Depends(get_content_library_views_service)],
) -> ResponseModel[ContentLibraryViewsStateOut]:
    can_manage = await _resolve_can_manage_workspace_views(user_id=user_id, ctx=ctx.workspace_ctx)
    return ApiResponse.success(
        data=await service.delete_view(
            workspace_id=ctx.workspace_id,
            user_id=user_id,
            view_id=view_id,
            can_manage_workspace_views=can_manage,
        )
    )
