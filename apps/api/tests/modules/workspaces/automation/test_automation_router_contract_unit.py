from __future__ import annotations

from fastapi import APIRouter
from fastapi.params import Depends
from fastapi.routing import APIRoute

from src.modules.workspaces.automation.router import router as automation_router
from src.modules.workspaces.permissions import get_permission_action_registry
from src.modules.workspaces.router import router as workspaces_router


def _find_api_route(router: APIRouter, *, path: str, method: str) -> APIRoute:
    method_norm = method.upper()
    for route in router.routes:
        if isinstance(route, APIRoute) and route.path == path and method_norm in route.methods:
            return route
    raise AssertionError(f"Route not found: {method_norm} {path}")


def _route_permissions(router: APIRouter, *, path: str, method: str) -> set[str]:
    route = _find_api_route(router, path=path, method=method)
    permissions: set[str] = set()
    for depends in route.dependencies:
        if not isinstance(depends, Depends):
            continue
        fn = getattr(depends, "dependency", None)
        if not callable(fn):
            continue
        for cell in getattr(fn, "__closure__", None) or ():
            value = cell.cell_contents
            if isinstance(value, str) and ":" in value:
                permissions.add(value)
    return permissions


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


def test_workspace_router_mounts_automation_router() -> None:
    mounted_paths = {
        route.path
        for route in workspaces_router.routes
        if isinstance(route, APIRoute) and route.path.startswith("/workspaces/{workspace_id}/automation")
    }
    assert "/workspaces/{workspace_id}/automation/catalog" in mounted_paths
    assert "/workspaces/{workspace_id}/automation/flows" in mounted_paths
    assert "/workspaces/{workspace_id}/automation/runs" in mounted_paths


def test_automation_router_uses_granular_permissions() -> None:
    list_catalog = _route_permissions(
        automation_router,
        path="/workspaces/{workspace_id}/automation/catalog",
        method="GET",
    )
    list_flows = _route_permissions(
        automation_router,
        path="/workspaces/{workspace_id}/automation/flows",
        method="GET",
    )
    create_flow = _route_permissions(
        automation_router,
        path="/workspaces/{workspace_id}/automation/flows",
        method="POST",
    )
    get_run = _route_permissions(
        automation_router,
        path="/workspaces/{workspace_id}/automation/runs/{run_id}",
        method="GET",
    )

    assert list_catalog == {"system:automation:read"}
    assert list_flows == {"system:automation:read"}
    assert create_flow == {"system:automation:read", "system:automation:manage"}
    assert get_run == {"system:automation:read"}


def test_automation_router_requires_workspace_manage_context() -> None:
    dependency_names = _route_dependency_call_names(
        automation_router,
        path="/workspaces/{workspace_id}/automation/flows",
        method="GET",
    )
    assert "require_workspace_manage_access" in dependency_names


def test_automation_permission_actions_are_registered() -> None:
    registry = get_permission_action_registry()

    assert registry["automation:read"].permission_codes == ("system:automation:read",)
    assert registry["automation:manage"].permission_codes == ("system:automation:manage",)
    assert registry["automation:read"].subject_kinds == (
        "workspace_member",
        "personal_api_key",
        "workspace_api_key",
    )
