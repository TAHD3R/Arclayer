from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query

from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.workspaces.content.router_shared import _resolve_site_id, get_workspace_content_service
from apps.api.src.modules.workspaces.content.schema import (
    ContentActiveThemeOut,
    ContentActiveThemeSetIn,
    ContentEffectiveStyleOut,
    ContentStyleSetIn,
    ContentStyleValueOut,
)
from apps.api.src.modules.workspaces.content.service import WorkspaceContentService
from apps.api.src.modules.workspaces.deps import WorkspaceContext, require_workspace_manage_access

appearance_router = APIRouter(prefix="/appearance")


@appearance_router.get(
    "/themes/active",
    response_model=ResponseModel[ContentActiveThemeOut],
    response_model_exclude_none=True,
    summary="Get active content theme binding (workspace RBAC protected)",
)
async def get_workspace_content_active_theme(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentActiveThemeOut]:
    data = await service.get_active_theme(site_id=site_id)
    return Response.success(data=data)


@appearance_router.put(
    "/themes/active",
    response_model=ResponseModel[ContentActiveThemeOut],
    response_model_exclude_none=True,
    summary="Set active content theme binding (workspace RBAC protected)",
)
async def set_workspace_content_active_theme(
    payload: Annotated[ContentActiveThemeSetIn, Body(description="Set active content theme payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentActiveThemeOut]:
    data = await service.set_active_theme(site_id=site_id, payload=payload)
    return Response.success(data=data)


@appearance_router.get(
    "/styles/global",
    response_model=ResponseModel[ContentStyleValueOut],
    response_model_exclude_none=True,
    summary="Get global content style payload (workspace RBAC protected)",
)
async def get_workspace_content_global_style(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentStyleValueOut]:
    data = await service.get_global_style(site_id=site_id)
    return Response.success(data=data)


@appearance_router.put(
    "/styles/global",
    response_model=ResponseModel[ContentStyleValueOut],
    response_model_exclude_none=True,
    summary="Set global content style payload (workspace RBAC protected)",
)
async def set_workspace_content_global_style(
    payload: Annotated[ContentStyleSetIn, Body(description="Set global content style payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentStyleValueOut]:
    data = await service.set_global_style(site_id=site_id, payload=payload)
    return Response.success(data=data)


@appearance_router.put(
    "/styles/types/{type_code}",
    response_model=ResponseModel[ContentStyleValueOut],
    response_model_exclude_none=True,
    summary="Set content type style payload (workspace RBAC protected)",
)
async def set_workspace_content_type_style(
    type_code: str,
    payload: Annotated[ContentStyleSetIn, Body(description="Set content type style payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentStyleValueOut]:
    data = await service.set_type_style(site_id=site_id, type_code=type_code, payload=payload)
    return Response.success(data=data)


@appearance_router.put(
    "/styles/entries/{entry_id}",
    response_model=ResponseModel[ContentStyleValueOut],
    response_model_exclude_none=True,
    summary="Set content entry style payload (workspace RBAC protected)",
)
async def set_workspace_content_entry_style(
    entry_id: PublicUUID,
    payload: Annotated[ContentStyleSetIn, Body(description="Set content entry style payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentStyleValueOut]:
    data = await service.set_entry_style(site_id=site_id, entry_id=entry_id, payload=payload)
    return Response.success(data=data)


@appearance_router.get(
    "/styles/effective",
    response_model=ResponseModel[ContentEffectiveStyleOut],
    response_model_exclude_none=True,
    summary="Get effective content style payload (workspace RBAC protected)",
)
async def get_workspace_content_effective_style(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
    type_code: Annotated[str | None, Query(alias="typeCode", description="Optional content type code.")] = None,
    entry_id: Annotated[PublicUUID | None, Query(alias="entryId", description="Optional content entry id.")] = None,
) -> ResponseModel[ContentEffectiveStyleOut]:
    data = await service.get_effective_style(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        type_code=type_code,
        entry_id=entry_id,
    )
    return Response.success(data=data)
