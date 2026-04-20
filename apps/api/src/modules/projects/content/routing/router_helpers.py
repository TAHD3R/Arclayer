from __future__ import annotations

from src.modules.projects.content.routing.schema import (
    HierarchyNodeOut,
    HierarchyNodeUpsertIn,
    RouteBindingOut,
    RouteBindingUpsertIn,
)
from src.modules.projects.content.routing.service import ProjectContentRoutingService


def get_project_content_routing_service() -> ProjectContentRoutingService:
    return ProjectContentRoutingService()


__all__ = [
    "HierarchyNodeOut",
    "HierarchyNodeUpsertIn",
    "ProjectContentRoutingService",
    "RouteBindingOut",
    "RouteBindingUpsertIn",
    "get_project_content_routing_service",
]
