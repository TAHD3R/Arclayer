from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query, status

from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.workspaces.authz.http.service import require_workspace_permission
from apps.api.src.modules.workspaces.content.route_tree.schema import (
    ContentRouteCreateIn,
    ContentRouteDeleteOut,
    ContentRouteOut,
    ContentRouteUpdateIn,
    ContentTreeNodeDeleteOut,
    ContentTreeNodeOut,
    ContentTreeNodeUpsertIn,
)
from apps.api.src.modules.workspaces.content.service import WorkspaceContentService
from apps.api.src.modules.workspaces.content.shared.router import _resolve_site_id, get_workspace_content_service
from apps.api.src.modules.workspaces.http.schema import WorkspaceContext
from apps.api.src.modules.workspaces.http.service import require_workspace_manage_access

route_tree_router = APIRouter()

routes_router = APIRouter(prefix="/routes")
tree_nodes_router = APIRouter(prefix="/tree-nodes")


@routes_router.get(
    "",
    response_model=ResponseModel[PageData[ContentRouteOut]],
    response_model_exclude_none=True,
    summary="List content route bindings (workspace RBAC protected)",
)
async def list_workspace_content_route_bindings(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
    params: PageParams = Depends(get_page_params),
    entry_id: Annotated[PublicUUID | None, Query(alias="entryId", description="Optional entry id filter.")] = None,
    locale: Annotated[str | None, Query(description="Optional locale filter.")] = None,
    is_active: Annotated[bool | None, Query(alias="isActive", description="Optional active filter.")] = None,
) -> ResponseModel[PageData[ContentRouteOut]]:
    data = await service.list_route_bindings_paginated(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        params=params,
        entry_id=entry_id,
        locale=locale,
        is_active=is_active,
    )
    return Response.success(data=data)


@routes_router.post(
    "",
    response_model=ResponseModel[ContentRouteOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a content route binding (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def create_workspace_content_route_binding(
    payload: Annotated[ContentRouteCreateIn, Body(description="Create content route binding payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentRouteOut]:
    data = await service.create_route_binding(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        payload=payload,
    )
    return Response.success(data=data)


@routes_router.patch(
    "/{route_id}",
    response_model=ResponseModel[ContentRouteOut],
    response_model_exclude_none=True,
    summary="Update a content route binding (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def update_workspace_content_route_binding(
    route_id: PublicUUID,
    payload: Annotated[ContentRouteUpdateIn, Body(description="Update content route binding payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentRouteOut]:
    data = await service.update_route_binding(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        route_id=route_id,
        payload=payload,
    )
    return Response.success(data=data)


@routes_router.delete(
    "/{route_id}",
    response_model=ResponseModel[ContentRouteDeleteOut],
    response_model_exclude_none=True,
    summary="Delete a content route binding (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def delete_workspace_content_route_binding(
    route_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentRouteDeleteOut]:
    data = await service.delete_route_binding(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        route_id=route_id,
    )
    return Response.success(data=data)


@tree_nodes_router.get(
    "",
    response_model=ResponseModel[PageData[ContentTreeNodeOut]],
    response_model_exclude_none=True,
    summary="List content tree nodes (workspace RBAC protected)",
)
async def list_workspace_content_tree_nodes(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
    params: PageParams = Depends(get_page_params),
    entry_id: Annotated[PublicUUID | None, Query(alias="entryId", description="Optional entry id filter.")] = None,
    parent_entry_id: Annotated[
        PublicUUID | None,
        Query(alias="parentEntryId", description="Optional parent entry id filter."),
    ] = None,
) -> ResponseModel[PageData[ContentTreeNodeOut]]:
    data = await service.list_tree_nodes_paginated(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        params=params,
        entry_id=entry_id,
        parent_entry_id=parent_entry_id,
    )
    return Response.success(data=data)


@tree_nodes_router.put(
    "/{entry_id}",
    response_model=ResponseModel[ContentTreeNodeOut],
    response_model_exclude_none=True,
    summary="Upsert a content tree node (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def upsert_workspace_content_tree_node(
    entry_id: PublicUUID,
    payload: Annotated[ContentTreeNodeUpsertIn, Body(description="Upsert content tree node payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentTreeNodeOut]:
    data = await service.upsert_tree_node(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        entry_id=entry_id,
        payload=payload,
    )
    return Response.success(data=data)


@tree_nodes_router.delete(
    "/{entry_id}",
    response_model=ResponseModel[ContentTreeNodeDeleteOut],
    response_model_exclude_none=True,
    summary="Delete a content tree node (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def delete_workspace_content_tree_node(
    entry_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentTreeNodeDeleteOut]:
    data = await service.delete_tree_node(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        entry_id=entry_id,
    )
    return Response.success(data=data)


route_tree_router.include_router(routes_router)
route_tree_router.include_router(tree_nodes_router)
