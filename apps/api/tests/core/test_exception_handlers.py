import warnings
from pathlib import Path

from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from src.config import get_settings
from src.core.exceptions import APIError
from src.core.registry import create_app


def _configure_logging_env(monkeypatch, log_dir: Path) -> None:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("LOGGING__LOG_DIR", str(log_dir))
    monkeypatch.setenv("LOGGING__ASYNC_ENABLED", "0")
    # Keep exception handler tests isolated from external infra.
    monkeypatch.setenv("DATABASE__ENABLED", "0")
    monkeypatch.setenv("VALKEY__ENABLED", "0")
    # `get_settings()` is cached; tests that mutate env must reset it to avoid leaking
    # configuration across the test suite.
    get_settings.cache_clear()


def _configure_debug_logging_env(monkeypatch, log_dir: Path) -> None:
    _configure_logging_env(monkeypatch, log_dir)
    monkeypatch.setenv("APP_ENV", "development")
    get_settings.cache_clear()


async def test_api_error_handler(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    app = create_app()

    @app.get("/boom")
    def boom() -> None:
        raise APIError("Failed", error="BAD_REQUEST", status_code=400, details={"reason": "bad"})

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            with warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter("always")
                response = await client.get("/boom", headers={"X-Locale": "en-US"})

    assert response.status_code == 400
    payload = response.json()

    assert payload["message"] == "Bad request"
    assert payload["error"] == "BAD_REQUEST"
    assert not any("ORJSONResponse is deprecated" in str(item.message) for item in caught)


async def test_http_exception_handler(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    app = create_app()

    @app.get("/missing")
    def missing() -> None:
        raise HTTPException(status_code=404, detail="Not found")

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/missing", headers={"X-Locale": "en-US"})

    assert response.status_code == 404
    payload = response.json()
    assert payload["message"] == "Resource not found"
    assert payload["error"] == "NOT_FOUND"


async def test_http_exception_handler_normalizes_nested_error_detail(
    monkeypatch,
    tmp_path: Path,
) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    app = create_app()

    @app.get("/nested-error")
    def nested_error() -> None:
        raise HTTPException(
            status_code=403,
            detail={
                "message": "User is not a member of any active workspace",
                "error": {
                    "code": "AUTH_NOT_WORKSPACE_MEMBER",
                    "message": "User is not a member of any active workspace",
                },
            },
        )

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/nested-error", headers={"X-Locale": "en-US"})

    assert response.status_code == 403
    payload = response.json()
    assert payload["message"] == "User is not a member of any active workspace"
    assert payload["error"] == "AUTH_NOT_WORKSPACE_MEMBER"
    assert "unhashable type" not in response.text


async def test_http_exception_handler_falls_back_for_non_scalar_error(
    monkeypatch,
    tmp_path: Path,
) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    app = create_app()

    @app.get("/bad-shape")
    def bad_shape() -> None:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Bad shape",
                "error": {"message": "Nested only"},
            },
        )

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/bad-shape", headers={"X-Locale": "en-US"})

    assert response.status_code == 400
    payload = response.json()
    assert payload["message"] == "Bad request"
    assert payload["error"] == "BAD_REQUEST"
    assert "unhashable type" not in response.text


async def test_request_validation_handler(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    app = create_app()

    @app.get("/query")
    def query(q: int) -> None:
        return None

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/query", params={"q": "abc"}, headers={"X-Locale": "en-US"})

    assert response.status_code == 422
    payload = response.json()
    assert payload["message"] == "Validation failed"
    assert payload["error"] == "VALIDATION_ERROR"
    assert payload["meta"] is not None
    assert isinstance(payload["meta"].get("details"), list)


async def test_unhandled_error_handler(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    app = create_app()

    @app.get("/unhandled")
    def unhandled() -> None:
        raise RuntimeError("boom")

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/unhandled", headers={"X-Locale": "en-US"})

    assert response.status_code == 500
    payload = response.json()
    assert payload["message"] == "Internal server error"
    assert payload["error"] == "INTERNAL_ERROR"
    # Never leak stack traces in API responses.
    assert "Traceback" not in response.text


async def test_debug_app_still_uses_sanitized_internal_error_envelope(
    monkeypatch,
    tmp_path: Path,
) -> None:
    _configure_debug_logging_env(monkeypatch, tmp_path)
    app = create_app()

    @app.get("/debug-unhandled")
    def debug_unhandled() -> None:
        raise RuntimeError("debug boom")

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/debug-unhandled", headers={"X-Locale": "en-US"})

    assert response.status_code == 500
    assert response.headers["content-type"].startswith("application/json")
    payload = response.json()
    assert payload["message"] == "Internal server error"
    assert payload["error"] == "INTERNAL_ERROR"
    assert payload["meta"] is not None
    assert payload["meta"]["path"] == "/debug-unhandled"
    assert "details" not in payload["meta"]
    assert "debug boom" not in response.text
    assert "Traceback" not in response.text
