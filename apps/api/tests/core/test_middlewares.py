import warnings
from pathlib import Path

from src.config import get_settings
from src.core.middleware.guard_decorators import guard_rate_limit
from src.core.registry import create_app
from tests.utils.asgi_client import asgi_client


def _configure_logging_env(monkeypatch, log_dir: Path) -> None:
    # These unit tests must be hermetic: no external DB/Valkey connectivity and no reliance
    # on developer env files like `.env.development`.
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("LOGGING__LOG_DIR", str(log_dir))
    monkeypatch.setenv("LOGGING__ASYNC_ENABLED", "0")
    # Make middleware unit tests hermetic: they should not depend on DB or cache connectivity.
    monkeypatch.setenv("DATABASE__ENABLED", "0")
    monkeypatch.setenv("TEST_DATABASE__ENABLED", "0")
    monkeypatch.setenv("VALKEY__ENABLED", "0")
    monkeypatch.setenv("TEST_VALKEY__ENABLED", "0")
    monkeypatch.setenv("SECURITY__ENABLE_RATE_LIMITING", "0")
    monkeypatch.setenv("SECURITY__ENABLE_REDIS", "0")
    monkeypatch.setenv("TASKIQ__ENABLED", "0")
    get_settings.cache_clear()


async def test_cors_preflight(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    monkeypatch.setenv("SECURITY__ENABLED", "1")
    monkeypatch.setenv("SECURITY__ENABLE_CORS", "1")
    monkeypatch.setenv("SECURITY__CORS_ALLOW_ORIGINS", '["https://example.com"]')
    monkeypatch.setenv("SECURITY__CORS_ALLOW_METHODS", '["GET","POST","OPTIONS"]')
    monkeypatch.setenv("SECURITY__CORS_ALLOW_HEADERS", '["*"]')

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
    monkeypatch.setenv("MIDDLEWARE__GZIP_ENABLED", "1")
    monkeypatch.setenv("MIDDLEWARE__GZIP_MINIMUM_SIZE", "10")

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
    monkeypatch.setenv("MIDDLEWARE__TRUSTED_HOST_ENABLED", "1")
    monkeypatch.setenv("MIDDLEWARE__TRUSTED_HOSTS", '["example.com"]')

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
    monkeypatch.setenv("MIDDLEWARE__HTTPS_REDIRECT_ENABLED", "1")

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
    monkeypatch.setenv("SECURITY__ENABLED", "1")
    monkeypatch.setenv("SECURITY__CSRF__ENABLED", "1")
    monkeypatch.setenv("APP_ENV", "development")
    get_settings.cache_clear()

    app = create_app()

    @app.get("/api/v1/csrf")
    async def csrf_get() -> dict[str, str]:
        return {"ok": "1"}

    @app.post("/api/v1/csrf")
    async def csrf_post() -> dict[str, str]:
        return {"ok": "1"}

    async with asgi_client(app) as client:
        response = await client.get("/api/v1/csrf")

        assert response.status_code == 200
        assert "csrf_token=" in response.headers.get("set-cookie", "")

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            bad_post = await client.post("/api/v1/csrf")
        assert bad_post.status_code == 403
        assert bad_post.json().get("message") == "CSRF 校验失败"
        assert not any("ORJSONResponse is deprecated" in str(item.message) for item in caught)

        token = client.cookies.get("csrf_token")
        assert token is not None
        ok_post = await client.post(
            "/api/v1/csrf",
            headers={
                "Origin": "http://testserver",
                "X-CSRF-Token": token,
            },
        )
        assert ok_post.status_code == 200


async def test_csrf_rejects_invalid_token_and_cross_origin(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    monkeypatch.setenv("SECURITY__ENABLED", "1")
    monkeypatch.setenv("SECURITY__CSRF__ENABLED", "1")
    get_settings.cache_clear()

    app = create_app()

    @app.get("/api/v1/csrf")
    async def csrf_get() -> dict[str, str]:
        return {"ok": "1"}

    @app.post("/api/v1/csrf")
    async def csrf_post() -> dict[str, str]:
        return {"ok": "1"}

    async with asgi_client(app) as client:
        await client.get("/api/v1/csrf")
        token = client.cookies.get("csrf_token")
        assert token is not None

        invalid = await client.post(
            "/api/v1/csrf",
            headers={
                "Origin": "http://testserver",
                "X-CSRF-Token": "invalid",
            },
        )
        assert invalid.status_code == 403
        assert invalid.json().get("meta", {}).get("reason") == "token_mismatch"

        cross_origin = await client.post(
            "/api/v1/csrf",
            headers={
                "Origin": "https://evil.example",
                "X-CSRF-Token": token,
            },
        )
        assert cross_origin.status_code == 403
        assert cross_origin.json().get("meta", {}).get("reason") == "origin_mismatch"


async def test_csrf_exempts_content_api_token_routes(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    monkeypatch.setenv("SECURITY__ENABLED", "1")
    monkeypatch.setenv("SECURITY__CSRF__ENABLED", "1")
    get_settings.cache_clear()

    app = create_app()

    @app.post("/content-api/v1/csrf-exempt")
    async def content_api_post() -> dict[str, str]:
        return {"ok": "1"}

    async with asgi_client(app) as client:
        response = await client.post(
            "/content-api/v1/csrf-exempt",
            headers={"Origin": "https://external.example", "x-api-key": "ark_deliv_test.secret"},
        )

    assert response.status_code == 200
    assert response.json() == {"ok": "1"}


async def test_csrf_rotates_token_after_valid_mutation(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    monkeypatch.setenv("SECURITY__ENABLED", "1")
    monkeypatch.setenv("SECURITY__CSRF__ENABLED", "1")
    get_settings.cache_clear()

    app = create_app()

    @app.get("/api/v1/csrf")
    async def csrf_get() -> dict[str, str]:
        return {"ok": "1"}

    @app.post("/api/v1/csrf")
    async def csrf_post() -> dict[str, str]:
        return {"ok": "1"}

    async with asgi_client(app) as client:
        await client.get("/api/v1/csrf")
        original = client.cookies.get("csrf_token")
        assert original is not None

        response = await client.post(
            "/api/v1/csrf",
            headers={
                "Origin": "http://testserver",
                "X-CSRF-Token": original,
            },
        )

    assert response.status_code == 200
    assert response.cookies.get("csrf_token") not in {None, original}


async def test_guard_security_headers(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    monkeypatch.setenv("SECURITY__ENABLED", "1")
    monkeypatch.setenv(
        "SECURITY__SECURITY_HEADERS",
        '{"enabled": true, "frame_options": "DENY", "content_type_options": "nosniff", "referrer_policy": "same-origin"}',
    )
    get_settings.cache_clear()

    app = create_app()

    @app.get("/headers")
    async def headers() -> dict[str, str]:
        return {"ok": "1"}

    async with asgi_client(app) as client:
        response = await client.get("/headers")

    assert response.status_code == 200
    assert response.headers.get("x-frame-options") == "DENY"
    assert response.headers.get("x-content-type-options") == "nosniff"
    assert response.headers.get("referrer-policy") == "same-origin"


async def test_guard_route_specific_rate_limit(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    monkeypatch.setenv("SECURITY__ENABLED", "1")
    monkeypatch.setenv("SECURITY__ENABLE_RATE_LIMITING", "1")
    monkeypatch.setenv("SECURITY__RATE_LIMIT", "100")
    monkeypatch.setenv("SECURITY__RATE_LIMIT_WINDOW", "60")
    get_settings.cache_clear()

    app = create_app()

    @guard_rate_limit(1, 60)
    @app.get("/guard-rate-limit")
    async def guard_rate_limit_route() -> dict[str, str]:
        return {"ok": "1"}

    async with asgi_client(app) as client:
        first = await client.get("/guard-rate-limit")
        second = await client.get("/guard-rate-limit")

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.text == "Too many requests"


async def test_guard_custom_penetration_pattern(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    monkeypatch.setenv("SECURITY__ENABLED", "1")
    monkeypatch.setenv("SECURITY__ENABLE_PENETRATION_DETECTION", "1")
    monkeypatch.setenv("SECURITY__ENABLE_IP_BANNING", "0")
    monkeypatch.setenv("SECURITY__CUSTOM_PENETRATION_PATTERNS", '["dangerous_probe"]')
    get_settings.cache_clear()

    app = create_app()

    @app.get("/probe")
    async def probe() -> dict[str, str]:
        return {"ok": "1"}

    async with asgi_client(app) as client:
        response = await client.get("/probe", params={"term": "dangerous_probe"})

    assert response.status_code == 400
    assert "Suspicious activity detected" in response.text


async def test_guard_auto_ip_ban(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    monkeypatch.setenv("SECURITY__ENABLED", "1")
    monkeypatch.setenv("SECURITY__ENABLE_PENETRATION_DETECTION", "1")
    monkeypatch.setenv("SECURITY__ENABLE_IP_BANNING", "1")
    monkeypatch.setenv("SECURITY__AUTO_BAN_THRESHOLD", "1")
    monkeypatch.setenv("SECURITY__CUSTOM_PENETRATION_PATTERNS", '["dangerous_probe"]')
    get_settings.cache_clear()

    app = create_app()

    @app.get("/ban")
    async def banned() -> dict[str, str]:
        return {"ok": "1"}

    async with asgi_client(app) as client:
        suspicious = await client.get("/ban", params={"term": "dangerous_probe"})
        banned_response = await client.get("/ban", params={"term": "safe"})

    assert suspicious.status_code == 403
    assert "IP has been banned" in suspicious.text
    assert banned_response.status_code == 403
