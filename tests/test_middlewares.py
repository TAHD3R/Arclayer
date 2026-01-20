from pathlib import Path

from fastapi.testclient import TestClient

from apps.api.config import get_settings
from apps.api.core.registry import create_app


def _configure_logging_env(monkeypatch, log_dir: Path) -> None:
    monkeypatch.setenv("LOG_DIR", str(log_dir))
    monkeypatch.setenv("LOG_ASYNC", "0")


def test_cors_preflight(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    monkeypatch.setenv("APP_CORS_ENABLED", "1")
    monkeypatch.setenv("APP_CORS_ALLOW_ORIGINS", '["https://example.com"]')
    monkeypatch.setenv("APP_CORS_ALLOW_METHODS", '["GET","POST","OPTIONS"]')
    monkeypatch.setenv("APP_CORS_ALLOW_HEADERS", '["*"]')

    app = create_app()

    @app.get("/cors")
    def cors() -> dict[str, str]:
        return {"ok": "1"}

    client = TestClient(app)
    response = client.options(
        "/cors",
        headers={
            "Origin": "https://example.com",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "https://example.com"
    assert "POST" in response.headers.get("access-control-allow-methods", "")


def test_gzip_enabled(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    monkeypatch.setenv("APP_GZIP_ENABLED", "1")
    monkeypatch.setenv("APP_GZIP_MINIMUM_SIZE", "10")

    app = create_app()

    @app.get("/gzip")
    def gzip() -> str:
        return "x" * 200

    client = TestClient(app)
    response = client.get("/gzip", headers={"Accept-Encoding": "gzip"})

    assert response.status_code == 200
    assert response.headers.get("content-encoding") == "gzip"


def test_trusted_host(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    monkeypatch.setenv("APP_TRUSTED_HOST_ENABLED", "1")
    monkeypatch.setenv("APP_TRUSTED_HOSTS", '["example.com"]')

    app = create_app()

    @app.get("/host")
    def host() -> dict[str, str]:
        return {"ok": "1"}

    bad_client = TestClient(app, base_url="http://evil.com")
    bad_response = bad_client.get("/host")
    assert bad_response.status_code == 400

    ok_client = TestClient(app, base_url="http://example.com")
    ok_response = ok_client.get("/host")
    assert ok_response.status_code == 200


def test_https_redirect_only_production(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    monkeypatch.setenv("APP_HTTPS_REDIRECT_ENABLED", "1")

    monkeypatch.setenv("APP_ENV", "development")
    app_dev = create_app()

    @app_dev.get("/secure")
    def secure_dev() -> dict[str, str]:
        return {"ok": "1"}

    client_dev = TestClient(app_dev, base_url="http://example.com")
    response_dev = client_dev.get("/secure", follow_redirects=False)
    assert response_dev.status_code == 200

    monkeypatch.setenv("APP_ENV", "production")
    get_settings.cache_clear()
    app_prod = create_app()

    @app_prod.get("/secure")
    def secure_prod() -> dict[str, str]:
        return {"ok": "1"}

    client_prod = TestClient(app_prod, base_url="http://example.com")
    response_prod = client_prod.get("/secure", follow_redirects=False)
    assert response_prod.status_code in {307, 308}
    assert response_prod.headers.get("location", "").startswith("https://")


def test_csrf_middleware(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    monkeypatch.setenv("APP_CSRF_ENABLED", "1")
    monkeypatch.setenv("APP_ENV", "development")

    app = create_app()

    @app.get("/csrf")
    def csrf_get() -> dict[str, str]:
        return {"ok": "1"}

    @app.post("/csrf")
    def csrf_post() -> dict[str, str]:
        return {"ok": "1"}

    client = TestClient(app)
    response = client.get("/csrf")

    assert response.status_code == 200
    assert "csrf_token=" in response.headers.get("set-cookie", "")

    bad_post = client.post("/csrf")
    assert bad_post.status_code == 403
    assert bad_post.json().get("message") == "CSRF 校验失败"

    token = client.cookies.get("csrf_token")
    ok_post = client.post("/csrf", headers={"X-CSRF-Token": token})
    assert ok_post.status_code == 200
