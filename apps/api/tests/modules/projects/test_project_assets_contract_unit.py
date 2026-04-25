from __future__ import annotations

from fastapi import APIRouter
from fastapi.params import Depends
from fastapi.routing import APIRoute

from src.modules.projects.permissions.service import get_project_action_catalog


def _find_api_route(router: APIRouter, *, path: str, method: str) -> APIRoute:
    method_norm = method.upper()
    for route in router.routes:
        if isinstance(route, APIRoute) and route.path == path and method_norm in route.methods:
            return route
    raise AssertionError(f"Route missing: {method_norm} {path}")


def _route_permissions(router: APIRouter, *, path: str, method: str) -> set[str]:
    route = _find_api_route(router, path=path, method=method)
    return _extract_permissions(route.dependencies)


def _extract_permissions(depends_list: list[Depends]) -> set[str]:
    permissions: set[str] = set()
    for depends in depends_list:
        fn = getattr(depends, "dependency", None)
        if callable(fn):
            for cell in getattr(fn, "__closure__", None) or ():
                value = cell.cell_contents
                if isinstance(value, str) and ":" in value:
                    permissions.add(value)
    return permissions


def test_project_assets_router_exposes_project_native_asset_surface() -> None:
    from src.modules.projects.assets.router import router

    paths = {route.path for route in router.routes if isinstance(route, APIRoute)}

    assert "/projects/{project_id}/assets" in paths
    assert "/projects/{project_id}/assets/{asset_id}" in paths
    assert "/projects/{project_id}/assets/{asset_id}/content" in paths
    assert "/projects/{project_id}/asset-folders" in paths
    assert "/projects/{project_id}/asset-folders/{folder_id}" in paths
    assert "/projects/{project_id}/asset-folders/{folder_id}/delete" in paths
    assert "/projects/{project_id}/asset-tags" in paths
    assert "/projects/{project_id}/assets/bulk/move" in paths
    assert "/projects/{project_id}/assets/bulk/delete" in paths
    assert "/projects/{project_id}/assets/bulk/update" in paths
    assert "/projects/{project_id}/uploads/init" in paths
    assert "/projects/{project_id}/asset-usages" in paths


def test_project_assets_router_uses_project_permissions() -> None:
    from src.modules.projects.assets.router import router

    assert _route_permissions(router, path="/projects/{project_id}/assets", method="GET") == {"project:assets:read"}
    assert _route_permissions(router, path="/projects/{project_id}/asset-tags", method="POST") == {
        "project:assets:manage"
    }
    assert _route_permissions(router, path="/projects/{project_id}/uploads/init", method="POST") == {
        "project:assets:manage"
    }
    assert _route_permissions(router, path="/projects/{project_id}/asset-usages", method="PUT") == {
        "project:assets:manage"
    }


def test_project_permission_catalog_exposes_asset_actions() -> None:
    catalog = get_project_action_catalog()

    assert catalog["project:assets:read"].permission_codes == ("system:assets:read",)
    assert catalog["project:assets:manage"].permission_codes == ("system:assets:manage",)
    assert "project_member" in catalog["project:assets:manage"].subject_kinds


def test_workspace_router_excludes_asset_management_routes() -> None:
    from src.modules.workspaces.router import router

    paths = {route.path for route in router.routes if isinstance(route, APIRoute)}

    assert "/workspaces/{workspace_id}/assets" not in paths
    assert "/workspaces/{workspace_id}/asset-folders" not in paths
    assert "/workspaces/{workspace_id}/asset-tags" not in paths
    assert "/workspaces/{workspace_id}/uploads/init" not in paths
    assert "/workspaces/{workspace_id}/asset-usages" not in paths
