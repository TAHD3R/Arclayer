from fastapi.routing import APIRoute

from scripts.export_openapi import build_openapi_schema
from src.config import get_settings
from src.core.extensions.middleware_dispatcher import TenantAwareExtensionMiddlewareDispatcher
from src.core.extensions.workspace_context_middleware import WorkspaceContextMiddleware
from src.core.registry import create_app, create_platform_app
from tests.utils.asgi_client import asgi_client


def _route_paths(app) -> set[str]:
    return {route.path for route in app.routes if isinstance(route, APIRoute)}


def _middleware_classes(app) -> set[type]:
    return {middleware.cls for middleware in app.user_middleware}


def test_product_api_exposes_only_product_routes() -> None:
    app = create_app()
    paths = _route_paths(app)

    assert app.title == "Arclayer API"
    assert "/api/v1/projects" in paths
    assert "/api/v1/runtime" in paths
    assert "/api/v1/sites/{site_id}/settings" in paths
    assert "/api/v1/sites/{site_id}/preview-tokens" in paths
    assert "/api/v1/sites/{site_id}/patterns" not in paths
    assert "/api/v1/sites/{site_id}/patterns/{pattern_id}" not in paths
    assert "/api/v1/system/runtime" not in paths
    assert "/api/v1/system/settings" not in paths
    assert "/api/v1/system/commerce/plans" not in paths
    assert "/platform-api/v1/commerce/plans" not in paths
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
    assert "/platform-api/v1/communications/email/service" in paths
    assert "/platform-api/v1/communications/email/service/credentials" in paths
    assert "/platform-api/v1/extensions/installed" in paths
    assert "/platform-api/v1/extensions/connections" in paths
    assert "/platform-api/v1/extensions/catalog" in paths
    assert "/platform-api/v1/extensions/operations" in paths
    assert "/platform-api/v1/extensions/operations/{operation_id}" in paths
    assert "/platform-api/v1/commerce/plans" in paths
    assert "/api/v1/system/commerce/plans" not in paths
    assert "/platform-api/v1/feedback" not in paths
    assert "/platform-api/v1/notifications/campaigns" not in paths
    assert "/platform-api/v1/mail/providers" not in paths
    assert "/platform-api/v1/plugins" not in paths
    assert "/platform-api/v1/plugin-operations/{operation_id}" not in paths
    assert "/api/v1/runtime" not in paths
    assert "/api/v1/system/runtime" not in paths
    assert "/api/v1/system/commerce/plans" not in _route_paths(create_app())
    assert "/api/v1/projects" not in paths
    assert "/api/v1/workspaces" not in paths
    assert "/content-api/v1/runtimes/{runtime_id}/graphql" not in paths


def test_platform_api_does_not_install_product_tenant_middlewares() -> None:
    middleware_classes = _middleware_classes(create_platform_app())

    assert WorkspaceContextMiddleware not in middleware_classes
    assert TenantAwareExtensionMiddlewareDispatcher not in middleware_classes


async def test_platform_api_uses_only_its_own_cors_csrf_origin_and_cookie_policy(monkeypatch) -> None:
    monkeypatch.setenv("SECURITY__ENABLED", "1")
    monkeypatch.setenv("SECURITY__ENABLE_CORS", "1")
    monkeypatch.setenv("SECURITY__CORS_ALLOW_ORIGINS", '["https://product.example"]')
    monkeypatch.setenv("SECURITY__CSRF__ENABLED", "1")
    monkeypatch.setenv("SECURITY__CSRF__TRUSTED_ORIGINS", '["https://product.example"]')
    monkeypatch.setenv("PLATFORM_SECURITY__ENABLED", "1")
    monkeypatch.setenv("PLATFORM_SECURITY__ENABLE_CORS", "1")
    monkeypatch.setenv("PLATFORM_SECURITY__CORS_ALLOW_ORIGINS", '["https://platform.example"]')
    monkeypatch.setenv("PLATFORM_SECURITY__CORS_ALLOW_METHODS", '["GET", "POST", "OPTIONS"]')
    monkeypatch.setenv("PLATFORM_SECURITY__CORS_ALLOW_HEADERS", '["X-CSRF-Token"]')
    monkeypatch.setenv("PLATFORM_SECURITY__CORS_ALLOW_CREDENTIALS", "1")
    monkeypatch.setenv("PLATFORM_SECURITY__CSRF__ENABLED", "1")
    monkeypatch.setenv("PLATFORM_SECURITY__CSRF__COOKIE_NAME", "platform_boundary_csrf")
    monkeypatch.setenv("PLATFORM_SECURITY__CSRF__TRUSTED_ORIGINS", '["https://platform.example"]')
    get_settings.cache_clear()

    app = create_platform_app()

    @app.get("/platform-api/v1/_test/security-boundary")
    async def platform_security_get() -> dict[str, bool]:
        return {"ok": True}

    @app.post("/platform-api/v1/_test/security-boundary")
    async def platform_security_post() -> dict[str, bool]:
        return {"ok": True}

    async with asgi_client(app, base_url="https://platform-api.example") as client:
        preflight = await client.options(
            "/platform-api/v1/_test/security-boundary",
            headers={
                "Origin": "https://platform.example",
                "Access-Control-Request-Method": "POST",
            },
        )
        product_origin_rejected = await client.post(
            "/platform-api/v1/_test/security-boundary",
            headers={
                "Origin": "https://product.example",
                "Cookie": "platform_boundary_csrf=platform-csrf-token",
                "X-CSRF-Token": "platform-csrf-token",
            },
        )
        product_cookie_rejected = await client.post(
            "/platform-api/v1/_test/security-boundary",
            headers={
                "Origin": "https://platform.example",
                "Cookie": "csrf_token=product-csrf-token",
                "X-CSRF-Token": "product-csrf-token",
            },
        )
        platform_origin_accepted = await client.post(
            "/platform-api/v1/_test/security-boundary",
            headers={
                "Origin": "https://platform.example",
                "Cookie": "platform_boundary_csrf=platform-csrf-token",
                "X-CSRF-Token": "platform-csrf-token",
            },
        )

    assert preflight.status_code == 200
    assert preflight.headers.get("access-control-allow-origin") == "https://platform.example"
    assert preflight.headers.get("access-control-allow-credentials") == "true"
    assert product_origin_rejected.status_code == 403
    assert product_origin_rejected.json()["meta"]["reason"] == "origin_mismatch"
    assert product_cookie_rejected.status_code == 403
    assert product_cookie_rejected.json()["meta"]["reason"] == "token_mismatch"
    assert platform_origin_accepted.status_code == 200


def test_generated_openapi_documents_are_disjoint() -> None:
    product_schema = build_openapi_schema(composition="product")
    platform_schema = build_openapi_schema(composition="platform")
    product_paths = set(product_schema["paths"])
    platform_paths = set(platform_schema["paths"])

    assert product_paths
    assert platform_paths
    assert product_paths.isdisjoint(platform_paths)
    assert all(not path.startswith("/platform-api/") for path in product_paths)
    assert "/platform-api/v1/commerce/plans" in platform_paths
    assert "/api/v1/system/commerce/plans" not in platform_paths
    assert all(path.startswith("/platform-api/") for path in platform_paths)
