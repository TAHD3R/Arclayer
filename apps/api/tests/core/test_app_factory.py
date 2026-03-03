from apps.api.src.core.registry import create_app
from apps.api.tests.utils.asgi_client import asgi_client


async def test_create_app_docs_enabled_in_test_env(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "test")

    app = create_app()

    assert app.title == "Celestial Framework API"
    assert app.debug is False

    async with asgi_client(app) as client:
        assert (await client.get("/docs")).status_code == 200
        assert (await client.get("/openapi.json")).status_code == 200


async def test_create_app_docs_disabled_in_production(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("PUBLIC_ID__SECRET", "test-public-id-secret")

    app = create_app()

    async with asgi_client(app) as client:
        assert (await client.get("/docs")).status_code == 404
        assert (await client.get("/openapi.json")).status_code == 404
