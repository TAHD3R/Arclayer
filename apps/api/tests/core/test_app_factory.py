from src.core.extensions.middleware_dispatcher import TenantAwareExtensionMiddlewareDispatcher
from src.core.registries import PluginRegistry
from src.core.registry import create_app, create_platform_app
from tests.utils.asgi_client import asgi_client


async def test_create_app_openapi_enabled_but_docs_ui_disabled_in_test_env(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "test")

    app = create_app()

    assert app.title == "Arclayer API"
    assert app.debug is False

    async with asgi_client(app) as client:
        assert isinstance(app.state.plugin_registry, PluginRegistry)
        assert app.state.extension_manager is not None
        assert (await client.get("/docs")).status_code == 404
        assert (await client.get("/openapi.json")).status_code == 200


async def test_create_app_docs_disabled_in_production(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("PUBLIC_ID__SECRET", "test-public-id-secret")

    app = create_app()

    async with asgi_client(app) as client:
        assert (await client.get("/docs")).status_code == 404
        assert (await client.get("/openapi.json")).status_code == 404


async def test_create_platform_app_initializes_extension_inventory_without_product_middleware(
    monkeypatch,
) -> None:
    monkeypatch.setenv("APP_ENV", "test")
    app = create_platform_app()

    async with asgi_client(app):
        assert isinstance(app.state.plugin_registry, PluginRegistry)
        assert app.state.extension_manager is not None
        assert app.state.extension_manager.extension_names
        assert all(middleware.cls is not TenantAwareExtensionMiddlewareDispatcher for middleware in app.user_middleware)
