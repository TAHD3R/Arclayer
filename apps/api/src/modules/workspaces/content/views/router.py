from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, status

from src.config import Settings, get_settings
from src.core.http.response import Response, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.workspaces.authz.http.service import (
    ensure_workspace_permission_granted,
    require_workspace_permission,
)
from src.modules.workspaces.content.views.schema import (
    ContentLibraryViewCreateIn,
    ContentLibraryViewMoveIn,
    ContentLibraryViewPatchIn,
    ContentLibraryViewsStateOut,
)
from src.modules.workspaces.content.views.service import ContentLibraryViewsService
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access

content_library_views_router = APIRouter(
    prefix="/workspaces/{workspace_id}/content/library",
    tags=["Workspace: Content"],
    dependencies=[require_workspace_permission("system:content:read")],
)


def get_content_library_views_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> ContentLibraryViewsService:
    return ContentLibraryViewsService(settings)


async def _resolve_can_manage_workspace_views(*, user_id: UUID, ctx: WorkspaceContext) -> bool:
    try:
        await ensure_workspace_permission_granted(
            "system:content:manage",
            user_id=user_id,
            ctx=ctx,
        )
    except Exception as exc:
        if exc.__class__.__name__ != "Forbidden":
            raise
        return False
    return True


@content_library_views_router.get(
    "/views",
    response_model=ResponseModel[ContentLibraryViewsStateOut],
    summary="List content library views visible to the current user",
)
async def list_content_library_views(
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ContentLibraryViewsService, Depends(get_content_library_views_service)],
) -> ResponseModel[ContentLibraryViewsStateOut]:
    return Response.success(data=await service.list_views(workspace_id=ctx.workspace_id, user_id=user_id))


@content_library_views_router.post(
    "/views",
    response_model=ResponseModel[ContentLibraryViewsStateOut],
    status_code=status.HTTP_201_CREATED,
    summary="Create a private or shared content library view",
)
async def create_content_library_view(
    payload: Annotated[ContentLibraryViewCreateIn, Body(description="Create content library view payload.")],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ContentLibraryViewsService, Depends(get_content_library_views_service)],
) -> ResponseModel[ContentLibraryViewsStateOut]:
    can_manage = await _resolve_can_manage_workspace_views(user_id=user_id, ctx=ctx)
    return Response.success(
        data=await service.create_view(
            workspace_id=ctx.workspace_id,
            user_id=user_id,
            payload=payload,
            can_manage_workspace_views=can_manage,
        )
    )


@content_library_views_router.patch(
    "/views/{view_id}",
    response_model=ResponseModel[ContentLibraryViewsStateOut],
    summary="Update a content library view definition, visibility, pin state, or default state",
)
async def patch_content_library_view(
    view_id: str,
    payload: Annotated[ContentLibraryViewPatchIn, Body(description="Patch content library view payload.")],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ContentLibraryViewsService, Depends(get_content_library_views_service)],
) -> ResponseModel[ContentLibraryViewsStateOut]:
    can_manage = await _resolve_can_manage_workspace_views(user_id=user_id, ctx=ctx)
    return Response.success(
        data=await service.update_view(
            workspace_id=ctx.workspace_id,
            user_id=user_id,
            view_id=view_id,
            payload=payload,
            can_manage_workspace_views=can_manage,
        )
    )


@content_library_views_router.post(
    "/views/{view_id}/move",
    response_model=ResponseModel[ContentLibraryViewsStateOut],
    summary="Reorder a content library view within its scope",
)
async def move_content_library_view(
    view_id: str,
    payload: Annotated[ContentLibraryViewMoveIn, Body(description="Move content library view payload.")],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ContentLibraryViewsService, Depends(get_content_library_views_service)],
) -> ResponseModel[ContentLibraryViewsStateOut]:
    can_manage = await _resolve_can_manage_workspace_views(user_id=user_id, ctx=ctx)
    return Response.success(
        data=await service.move_view(
            workspace_id=ctx.workspace_id,
            user_id=user_id,
            view_id=view_id,
            direction=payload.direction,
            can_manage_workspace_views=can_manage,
        )
    )


@content_library_views_router.delete(
    "/views/{view_id}",
    response_model=ResponseModel[ContentLibraryViewsStateOut],
    summary="Delete a content library view",
)
async def delete_content_library_view(
    view_id: str,
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ContentLibraryViewsService, Depends(get_content_library_views_service)],
) -> ResponseModel[ContentLibraryViewsStateOut]:
    can_manage = await _resolve_can_manage_workspace_views(user_id=user_id, ctx=ctx)
    return Response.success(
        data=await service.delete_view(
            workspace_id=ctx.workspace_id,
            user_id=user_id,
            view_id=view_id,
            can_manage_workspace_views=can_manage,
        )
    )
