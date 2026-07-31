from fastapi.routing import APIRoute

from scripts.export_openapi import build_openapi_schema
from src.core.extensions.middleware_dispatcher import TenantAwareExtensionMiddlewareDispatcher
from src.core.extensions.workspace_context_middleware import WorkspaceContextMiddleware
from src.core.registry import create_app, create_platform_app


def _route_paths(app) -> set[str]:
    return {route.path for route in app.routes if isinstance(route, APIRoute)}


def _middleware_classes(app) -> set[type]:
    return {middleware.cls for middleware in app.user_middleware}


def test_product_api_exposes_only_product_routes() -> None:
    app = create_app()
    paths = _route_paths(app)

    assert app.title == "Arclayer API"
    assert "/api/v1/projects" in paths
    assert "/api/v1/system/runtime" in paths
    assert "/api/v1/system/settings" not in paths
    assert "/platform-api/v1/settings" not in paths


def test_platform_api_exposes_only_platform_routes() -> None:
    app = create_platform_app()
    paths = _route_paths(app)

    assert app.title == "Arclayer Platform API"
    assert "/platform-api/v1/settings" not in paths
    assert "/platform-api/v1/rbac/permissions" not in paths
    assert "/platform-api/v1/setup/bootstrap" in paths
    assert "/platform-api/v1/setup/state" in paths
    assert "/platform-api/v1/communications/feedback" in paths
    assert "/platform-api/v1/communications/campaigns" in paths
    assert "/platform-api/v1/communications/email/providers" in paths
    assert "/platform-api/v1/extensions" in paths
    assert "/platform-api/v1/extensions/catalog" in paths
    assert "/platform-api/v1/extensions/operations/{operation_id}" in paths
    assert "/platform-api/v1/feedback" not in paths
    assert "/platform-api/v1/notifications/campaigns" not in paths
    assert "/platform-api/v1/mail/providers" not in paths
    assert "/platform-api/v1/plugins" not in paths
    assert "/platform-api/v1/plugin-operations/{operation_id}" not in paths
    assert "/api/v1/system/runtime" not in paths
    assert "/api/v1/projects" not in paths
    assert "/api/v1/workspaces" not in paths
    assert "/content-api/v1/runtimes/{runtime_id}/graphql" not in paths


def test_platform_api_does_not_install_product_tenant_middlewares() -> None:
    middleware_classes = _middleware_classes(create_platform_app())

    assert WorkspaceContextMiddleware not in middleware_classes
    assert TenantAwareExtensionMiddlewareDispatcher not in middleware_classes


def test_generated_openapi_documents_are_disjoint() -> None:
    product_schema = build_openapi_schema(composition="product")
    platform_schema = build_openapi_schema(composition="platform")
    product_paths = set(product_schema["paths"])
    platform_paths = set(platform_schema["paths"])

    assert product_paths
    assert platform_paths
    assert product_paths.isdisjoint(platform_paths)
    assert all(not path.startswith("/platform-api/") for path in product_paths)
    assert all(path.startswith("/platform-api/") for path in platform_paths)
