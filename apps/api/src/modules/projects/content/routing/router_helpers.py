from __future__ import annotations

from fastapi import Depends

from src.modules.projects.content.routing.schema import (
    HierarchyNodeOut,
    HierarchyNodeUpsertIn,
    RouteBindingOut,
    RouteBindingUpsertIn,
)
from src.modules.projects.content.routing.service import ProjectContentRoutingService
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.tenancy.router_helpers import resolve_project_tenant_context


def get_project_content_routing_service(
    ctx: ProjectRequestContext = Depends(get_project_context),
) -> ProjectContentRoutingService:
    return ProjectContentRoutingService(
        resolve_project_tenant_context(project_id=ctx.project_id, runtime_id=ctx.runtime_id)
    )


__all__ = [
    "HierarchyNodeOut",
    "HierarchyNodeUpsertIn",
    "ProjectContentRoutingService",
    "RouteBindingOut",
    "RouteBindingUpsertIn",
    "get_project_content_routing_service",
]
