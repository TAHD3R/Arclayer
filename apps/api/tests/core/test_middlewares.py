from pathlib import Path

from apps.api.config import get_settings
from apps.api.core.registry import create_app
from apps.api.tests.utils.asgi_client import asgi_client


def _configure_logging_env(monkeypatch, log_dir: Path) -> None:
    # These unit tests must be hermetic: no external DB/Valkey connectivity and no reliance
    # on developer env files like `.env.development`.
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("LOG_DIR", str(log_dir))
    monkeypatch.setenv("LOG_ASYNC", "0")
    # Make middleware unit tests hermetic: they should not depend on SaaS mode or DB connectivity.
    monkeypatch.setenv("DEPLOYMENT_MODE", "self_host")
    monkeypatch.setenv("DATABASE__ENABLED", "0")
    monkeypatch.setenv("TEST_DATABASE__ENABLED", "0")
    monkeypatch.setenv("VALKEY__ENABLED", "0")
    monkeypatch.setenv("TEST_VALKEY__ENABLED", "0")
    monkeypatch.setenv("VALKEY__LIMITER_ENABLED", "0")
    monkeypatch.setenv("TASKIQ__ENABLED", "0")
    get_settings.cache_clear()


async def test_cors_preflight(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    monkeypatch.setenv("APP_CORS_ENABLED", "1")
    monkeypatch.setenv("APP_CORS_ALLOW_ORIGINS", '["https://example.com"]')
    # Ensure we don't override allow_origins via SaaS base domain inference.
    monkeypatch.setenv("APP_CORS_ALLOW_ORIGIN_DYNAMIC", "0")
    monkeypatch.setenv("APP_CORS_ALLOW_METHODS", '["GET","POST","OPTIONS"]')
    monkeypatch.setenv("APP_CORS_ALLOW_HEADERS", '["*"]')

    app = create_app()

    @app.get("/cors")
    async def cors() -> dict[str, str]:
        return {"ok": "1"}

    async with asgi_client(app) as client:
        response = await client.options(
            "/cors",
            headers={
                "Origin": "https://example.com",
                "Access-Control-Request-Method": "POST",
            },
        )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "https://example.com"
    assert "POST" in response.headers.get("access-control-allow-methods", "")


async def test_gzip_enabled(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    monkeypatch.setenv("APP_GZIP_ENABLED", "1")
    monkeypatch.setenv("APP_GZIP_MINIMUM_SIZE", "10")

    app = create_app()

    @app.get("/gzip")
    async def gzip() -> str:
        return "x" * 200

    async with asgi_client(app) as client:
        response = await client.get("/gzip", headers={"Accept-Encoding": "gzip"})

    assert response.status_code == 200
    assert response.headers.get("content-encoding") == "gzip"


async def test_trusted_host(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    monkeypatch.setenv("APP_TRUSTED_HOST_ENABLED", "1")
    monkeypatch.setenv("APP_TRUSTED_HOSTS", '["example.com"]')

    app = create_app()

    @app.get("/host")
    async def host() -> dict[str, str]:
        return {"ok": "1"}

    async with asgi_client(app, base_url="http://evil.com") as bad_client:
        bad_response = await bad_client.get("/host")
        assert bad_response.status_code == 400

    async with asgi_client(app, base_url="http://example.com") as ok_client:
        ok_response = await ok_client.get("/host")
        assert ok_response.status_code == 200


async def test_https_redirect_only_production(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    monkeypatch.setenv("APP_HTTPS_REDIRECT_ENABLED", "1")

    monkeypatch.setenv("APP_ENV", "development")
    get_settings.cache_clear()
    app_dev = create_app()

    @app_dev.get("/secure")
    async def secure_dev() -> dict[str, str]:
        return {"ok": "1"}

    async with asgi_client(app_dev, base_url="http://example.com") as client_dev:
        response_dev = await client_dev.get("/secure", follow_redirects=False)
        assert response_dev.status_code == 200

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("PUBLIC_ID__SECRET", "test-public-id-secret")
    get_settings.cache_clear()
    app_prod = create_app()

    @app_prod.get("/secure")
    async def secure_prod() -> dict[str, str]:
        return {"ok": "1"}

    async with asgi_client(app_prod, base_url="http://example.com") as client_prod:
        response_prod = await client_prod.get("/secure", follow_redirects=False)
        assert response_prod.status_code in {307, 308}
        assert response_prod.headers.get("location", "").startswith("https://")


async def test_csrf_middleware(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    monkeypatch.setenv("APP_CSRF_ENABLED", "1")
    monkeypatch.setenv("APP_ENV", "development")
    get_settings.cache_clear()

    app = create_app()

    @app.get("/csrf")
    async def csrf_get() -> dict[str, str]:
        return {"ok": "1"}

    @app.post("/csrf")
    async def csrf_post() -> dict[str, str]:
        return {"ok": "1"}

    async with asgi_client(app) as client:
        response = await client.get("/csrf")

        assert response.status_code == 200
        assert "csrf_token=" in response.headers.get("set-cookie", "")

        bad_post = await client.post("/csrf")
        assert bad_post.status_code == 403
        assert bad_post.json().get("message") == "CSRF 校验失败"

        token = client.cookies.get("csrf_token")
        assert token is not None
        ok_post = await client.post("/csrf", headers={"X-CSRF-Token": token})
        assert ok_post.status_code == 200
