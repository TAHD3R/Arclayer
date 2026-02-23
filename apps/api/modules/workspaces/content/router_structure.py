from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, status

from apps.api.common.types.public_uuid import PublicUUID
from apps.api.core.http.pagination import PageData, PageParams, get_page_params, paginate_items
from apps.api.core.http.response import Response, ResponseModel
from apps.api.modules.sites.schema import (
    SiteRouteTemplateCreateIn as ContentRouteCreateIn,
)
from apps.api.modules.sites.schema import (
    SiteRouteTemplateDeleteOut as ContentRouteDeleteOut,
)
from apps.api.modules.sites.schema import (
    SiteRouteTemplateOut as ContentRouteOut,
)
from apps.api.modules.sites.schema import (
    SiteRouteTemplateUpdateIn as ContentRouteUpdateIn,
)
from apps.api.modules.workspaces.content.router_shared import _resolve_site_id, get_workspace_content_service
from apps.api.modules.workspaces.content.schema import (
    ContentGlobalSlotOut,
    ContentGlobalSlotsOut,
    ContentGlobalSlotUpsertIn,
    ContentMenuCreateIn,
    ContentMenuDeleteOut,
    ContentMenuItemCreateIn,
    ContentMenuItemDeleteOut,
    ContentMenuItemsReorderIn,
    ContentMenuItemUpdateIn,
    ContentMenuOut,
    ContentMenuUpdateIn,
)
from apps.api.modules.workspaces.content.service import WorkspaceContentService
from apps.api.modules.workspaces.deps import WorkspaceContext, require_workspace_manage_access

structure_router = APIRouter(prefix="/structure")


@structure_router.get(
    "/routes",
    response_model=ResponseModel[PageData[ContentRouteOut]],
    response_model_exclude_none=True,
    summary="List content routes (workspace RBAC protected)",
)
async def list_workspace_content_routes(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[ContentRouteOut]]:
    data = await service.list_routes_paginated(site_id=site_id, params=params)
    return Response.success(data=data)


@structure_router.post(
    "/routes",
    response_model=ResponseModel[ContentRouteOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a content route (workspace RBAC protected)",
)
async def create_workspace_content_route(
    payload: Annotated[ContentRouteCreateIn, Body(description="Create content route payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentRouteOut]:
    data = await service.create_route(workspace_id=ctx.workspace_id, site_id=site_id, payload=payload)
    return Response.success(data=data)


@structure_router.patch(
    "/routes/{route_id}",
    response_model=ResponseModel[ContentRouteOut],
    response_model_exclude_none=True,
    summary="Update a content route (workspace RBAC protected)",
)
async def update_workspace_content_route(
    route_id: PublicUUID,
    payload: Annotated[ContentRouteUpdateIn, Body(description="Update content route payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentRouteOut]:
    data = await service.update_route(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        route_id=route_id,
        payload=payload,
    )
    return Response.success(data=data)


@structure_router.delete(
    "/routes/{route_id}",
    response_model=ResponseModel[ContentRouteDeleteOut],
    response_model_exclude_none=True,
    summary="Delete a content route (workspace RBAC protected)",
)
async def delete_workspace_content_route(
    route_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentRouteDeleteOut]:
    data = await service.delete_route(site_id=site_id, route_id=route_id)
    return Response.success(data=data)


@structure_router.get(
    "/global-slots",
    response_model=ResponseModel[ContentGlobalSlotsOut],
    response_model_exclude_none=True,
    summary="List content global slots (workspace RBAC protected)",
)
async def list_workspace_content_global_slots(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentGlobalSlotsOut]:
    data = await service.list_global_slots(site_id=site_id)
    return Response.success(data=data)


@structure_router.put(
    "/global-slots/{slot_key}",
    response_model=ResponseModel[ContentGlobalSlotOut],
    response_model_exclude_none=True,
    summary="Upsert a content global slot (workspace RBAC protected)",
)
async def upsert_workspace_content_global_slot(
    slot_key: str,
    payload: Annotated[ContentGlobalSlotUpsertIn, Body(description="Upsert content global slot payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentGlobalSlotOut]:
    data = await service.upsert_global_slot(site_id=site_id, slot_key=slot_key, payload=payload)
    return Response.success(data=data)


@structure_router.get(
    "/menus",
    response_model=ResponseModel[PageData[ContentMenuOut]],
    response_model_exclude_none=True,
    summary="List content menus (workspace RBAC protected)",
)
async def list_workspace_content_menus(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[ContentMenuOut]]:
    rows = await service.list_menus(site_id=site_id)
    data = paginate_items(rows, params=params)
    return Response.success(data=data)


@structure_router.post(
    "/menus",
    response_model=ResponseModel[ContentMenuOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a content menu (workspace RBAC protected)",
)
async def create_workspace_content_menu(
    payload: Annotated[ContentMenuCreateIn, Body(description="Create content menu payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentMenuOut]:
    data = await service.create_menu(site_id=site_id, payload=payload)
    return Response.success(data=data)


@structure_router.patch(
    "/menus/{menu_id}",
    response_model=ResponseModel[ContentMenuOut],
    response_model_exclude_none=True,
    summary="Update a content menu (workspace RBAC protected)",
)
async def update_workspace_content_menu(
    menu_id: PublicUUID,
    payload: Annotated[ContentMenuUpdateIn, Body(description="Update content menu payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentMenuOut]:
    data = await service.update_menu(site_id=site_id, menu_id=menu_id, payload=payload)
    return Response.success(data=data)


@structure_router.delete(
    "/menus/{menu_id}",
    response_model=ResponseModel[ContentMenuDeleteOut],
    response_model_exclude_none=True,
    summary="Delete a content menu (workspace RBAC protected)",
)
async def delete_workspace_content_menu(
    menu_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentMenuDeleteOut]:
    data = await service.delete_menu(site_id=site_id, menu_id=menu_id)
    return Response.success(data=data)


@structure_router.post(
    "/menus/{menu_id}/items",
    response_model=ResponseModel[ContentMenuOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a content menu item (workspace RBAC protected)",
)
async def create_workspace_content_menu_item(
    menu_id: PublicUUID,
    payload: Annotated[ContentMenuItemCreateIn, Body(description="Create content menu item payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentMenuOut]:
    data = await service.create_menu_item(site_id=site_id, menu_id=menu_id, payload=payload)
    return Response.success(data=data)


@structure_router.patch(
    "/menus/{menu_id}/items/{item_id}",
    response_model=ResponseModel[ContentMenuOut],
    response_model_exclude_none=True,
    summary="Update a content menu item (workspace RBAC protected)",
)
async def update_workspace_content_menu_item(
    menu_id: PublicUUID,
    item_id: PublicUUID,
    payload: Annotated[ContentMenuItemUpdateIn, Body(description="Update content menu item payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentMenuOut]:
    data = await service.update_menu_item(site_id=site_id, menu_id=menu_id, item_id=item_id, payload=payload)
    return Response.success(data=data)


@structure_router.delete(
    "/menus/{menu_id}/items/{item_id}",
    response_model=ResponseModel[ContentMenuItemDeleteOut],
    response_model_exclude_none=True,
    summary="Delete a content menu item (workspace RBAC protected)",
)
async def delete_workspace_content_menu_item(
    menu_id: PublicUUID,
    item_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentMenuItemDeleteOut]:
    data = await service.delete_menu_item(site_id=site_id, menu_id=menu_id, item_id=item_id)
    return Response.success(data=data)


@structure_router.post(
    "/menus/{menu_id}/items/reorder",
    response_model=ResponseModel[ContentMenuOut],
    response_model_exclude_none=True,
    summary="Reorder content menu items (workspace RBAC protected)",
)
async def reorder_workspace_content_menu_items(
    menu_id: PublicUUID,
    payload: Annotated[ContentMenuItemsReorderIn, Body(description="Reorder content menu items payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentMenuOut]:
    data = await service.reorder_menu_items(site_id=site_id, menu_id=menu_id, payload=payload)
    return Response.success(data=data)
