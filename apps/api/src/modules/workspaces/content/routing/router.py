from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends

from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.workspaces.authz.http.service import require_workspace_permission
from apps.api.src.modules.workspaces.content.routing.schema import (
    HierarchyNodeOut,
    HierarchyNodeUpsertIn,
    RouteBindingOut,
    RouteBindingUpsertIn,
)
from apps.api.src.modules.workspaces.content.routing.service import WorkspaceContentRoutingService
from apps.api.src.modules.workspaces.content.shared.router import _resolve_site_id
from apps.api.src.modules.workspaces.http.schema import WorkspaceContext
from apps.api.src.modules.workspaces.http.service import require_workspace_manage_access

canonical_routing_router = APIRouter(
    prefix="/workspaces/{workspace_id}/content/routing",
    tags=["Workspace: Content"],
    dependencies=[require_workspace_permission("system:content:read")],
)


def get_workspace_content_routing_service() -> WorkspaceContentRoutingService:
    return WorkspaceContentRoutingService()


@canonical_routing_router.get(
    "/bindings",
    response_model=ResponseModel[list[RouteBindingOut]],
    response_model_exclude_none=True,
    summary="List rebuilt route bindings (workspace RBAC protected)",
)
async def list_workspace_content_route_bindings_canonical(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentRoutingService, Depends(get_workspace_content_routing_service)],
) -> ResponseModel[list[RouteBindingOut]]:
    data = await service.list_route_bindings(workspace_id=ctx.workspace_id, site_id=site_id)
    return Response.success(data=data)


@canonical_routing_router.put(
    "/bindings/{item_id}",
    response_model=ResponseModel[RouteBindingOut],
    response_model_exclude_none=True,
    summary="Upsert rebuilt route binding (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def upsert_workspace_content_route_binding_canonical(
    item_id: PublicUUID,
    payload: Annotated[RouteBindingUpsertIn, Body(description="Route binding upsert payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentRoutingService, Depends(get_workspace_content_routing_service)],
) -> ResponseModel[RouteBindingOut]:
    data = await service.upsert_route_binding(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        payload=payload,
    )
    return Response.success(data=data)


@canonical_routing_router.get(
    "/hierarchy",
    response_model=ResponseModel[list[HierarchyNodeOut]],
    response_model_exclude_none=True,
    summary="List rebuilt hierarchy nodes (workspace RBAC protected)",
)
async def list_workspace_content_hierarchy_nodes_canonical(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentRoutingService, Depends(get_workspace_content_routing_service)],
) -> ResponseModel[list[HierarchyNodeOut]]:
    data = await service.list_hierarchy_nodes(workspace_id=ctx.workspace_id, site_id=site_id)
    return Response.success(data=data)


@canonical_routing_router.put(
    "/hierarchy/{item_id}",
    response_model=ResponseModel[HierarchyNodeOut],
    response_model_exclude_none=True,
    summary="Upsert rebuilt hierarchy node (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def upsert_workspace_content_hierarchy_node_canonical(
    item_id: PublicUUID,
    payload: Annotated[HierarchyNodeUpsertIn, Body(description="Hierarchy node upsert payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentRoutingService, Depends(get_workspace_content_routing_service)],
) -> ResponseModel[HierarchyNodeOut]:
    data = await service.upsert_hierarchy_node(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        payload=payload,
    )
    return Response.success(data=data)
