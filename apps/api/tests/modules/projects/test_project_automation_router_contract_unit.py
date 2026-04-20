from __future__ import annotations

from fastapi import APIRouter
from fastapi.routing import APIRoute

from src.modules.projects.automation.router import router as project_automation_router
from src.modules.projects.router import router as projects_router


def _find_api_route(router: APIRouter, *, path: str, method: str) -> APIRoute:
    method_norm = method.upper()
    for route in router.routes:
        if isinstance(route, APIRoute) and route.path == path and method_norm in route.methods:
            return route
    raise AssertionError(f"Route not found: {method_norm} {path}")


def _route_dependency_call_names(router: APIRouter, *, path: str, method: str) -> set[str]:
    route = _find_api_route(router, path=path, method=method)
    names: set[str] = set()

    def _walk(dependant: object) -> None:
        call = getattr(dependant, "call", None)
        if callable(call):
            names.add(getattr(call, "__name__", str(call)))
        for dependency in getattr(dependant, "dependencies", []) or []:
            _walk(dependency)

    _walk(route.dependant)
    return names


def test_projects_router_mounts_project_automation_router() -> None:
    mounted_paths = {
        route.path
        for route in projects_router.routes
        if isinstance(route, APIRoute) and route.path.startswith("/projects/{project_id}/automation")
    }
    assert "/projects/{project_id}/automation/catalog" in mounted_paths
    assert "/projects/{project_id}/automation/flows" in mounted_paths
    assert "/projects/{project_id}/automation/runs" in mounted_paths


def test_project_automation_router_uses_project_context_dependencies() -> None:
    dependency_names = _route_dependency_call_names(
        project_automation_router,
        path="/projects/{project_id}/automation/flows",
        method="GET",
    )
    assert "get_project_context" in dependency_names
    assert "get_current_user_id" in dependency_names
    assert "get_project_automation_service" in dependency_names
