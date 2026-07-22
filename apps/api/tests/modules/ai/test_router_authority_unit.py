from __future__ import annotations

from fastapi.routing import APIRoute

from src.modules.ai.router import router


def _route_methods() -> set[tuple[str, str]]:
    return {(route.path, method) for route in router.routes if isinstance(route, APIRoute) for method in route.methods}


def test_ai_router_exposes_only_catalog_and_workspace_action_legacy_routes() -> None:
    routes = _route_methods()

    assert ("/models", "GET") in routes
    assert ("/workspace-actions", "POST") in routes
    assert ("", "POST") not in routes
    assert not any(path.startswith("/conversations") for path, _method in routes)
