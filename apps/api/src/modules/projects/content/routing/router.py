from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Depends

from src.common.types.public_uuid import PublicUUID
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.projects.content.routing.router_helpers import (
    HierarchyNodeOut,
    HierarchyNodeUpsertIn,
    ProjectContentRoutingService,
    RouteBindingOut,
    RouteBindingUpsertIn,
    get_project_content_routing_service,
)
from src.modules.projects.content.shared.router import (
    ProjectContentRouteContext,
    require_project_content_manage_context,
    require_project_content_read_context,
)

router = APIRouter(
    prefix="/projects/{project_id}/content/routing",
    tags=["domain.projects.content"],
)


@router.get(
    "/bindings",
    response_model=ResponseModel[list[RouteBindingOut]],
    response_model_exclude_none=True,
    summary="List rebuilt route bindings (project RBAC protected)",
)
async def list_project_content_route_bindings(
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_read_context)],
    service: Annotated[ProjectContentRoutingService, Depends(get_project_content_routing_service)],
) -> ResponseModel[list[RouteBindingOut]]:
    data = await service.list_route_bindings(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
    )
    return ApiResponse.success(data=data)


@router.put(
    "/bindings/{item_id}",
    response_model=ResponseModel[RouteBindingOut],
    response_model_exclude_none=True,
    summary="Upsert rebuilt route binding (project RBAC protected)",
)
async def upsert_project_content_route_binding(
    item_id: PublicUUID,
    payload: Annotated[RouteBindingUpsertIn, Body(description="Route binding upsert payload.")],
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    service: Annotated[ProjectContentRoutingService, Depends(get_project_content_routing_service)],
) -> ResponseModel[RouteBindingOut]:
    data = await service.upsert_route_binding(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
        item_id=item_id,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/hierarchy",
    response_model=ResponseModel[list[HierarchyNodeOut]],
    response_model_exclude_none=True,
    summary="List rebuilt hierarchy nodes (project RBAC protected)",
)
async def list_project_content_hierarchy_nodes(
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_read_context)],
    service: Annotated[ProjectContentRoutingService, Depends(get_project_content_routing_service)],
) -> ResponseModel[list[HierarchyNodeOut]]:
    data = await service.list_hierarchy_nodes(workspace_id=ctx.workspace_id, site_id=ctx.site_id)
    return ApiResponse.success(data=data)


@router.put(
    "/hierarchy/{item_id}",
    response_model=ResponseModel[HierarchyNodeOut],
    response_model_exclude_none=True,
    summary="Upsert rebuilt hierarchy node (project RBAC protected)",
)
async def upsert_project_content_hierarchy_node(
    item_id: PublicUUID,
    payload: Annotated[HierarchyNodeUpsertIn, Body(description="Hierarchy node upsert payload.")],
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    service: Annotated[ProjectContentRoutingService, Depends(get_project_content_routing_service)],
) -> ResponseModel[HierarchyNodeOut]:
    data = await service.upsert_hierarchy_node(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        item_id=item_id,
        payload=payload,
    )
    return ApiResponse.success(data=data)
