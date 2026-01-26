from pathlib import Path

from fastapi import HTTPException
from fastapi.testclient import TestClient

from apps.api.core.exceptions import APIError
from apps.api.core.registry import create_app


def _configure_logging_env(monkeypatch, log_dir: Path) -> None:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("LOG_DIR", str(log_dir))
    monkeypatch.setenv("LOG_ASYNC", "0")
    # Keep exception handler tests isolated from external infra.
    monkeypatch.setenv("DATABASE__ENABLED", "0")
    monkeypatch.setenv("VALKEY__ENABLED", "0")
    monkeypatch.setenv("PLUGIN__ENABLED", "0")


def test_api_error_handler(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    app = create_app()

    @app.get("/boom")
    def boom() -> None:
        raise APIError("请求失败", error="BAD_REQUEST", status_code=400, details={"reason": "bad"})

    client = TestClient(app)
    response = client.get("/boom")

    assert response.status_code == 400
    payload = response.json()

    assert payload["message"] == "请求失败"
    assert payload["error"] == "BAD_REQUEST"


def test_http_exception_handler(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    app = create_app()

    @app.get("/missing")
    def missing() -> None:
        raise HTTPException(status_code=404, detail="资源不存在")

    client = TestClient(app)
    response = client.get("/missing")

    assert response.status_code == 404
    payload = response.json()
    assert payload["message"] == "资源不存在"
    assert payload["error"] == "NOT_FOUND"


def test_request_validation_handler(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    app = create_app()

    @app.get("/query")
    def query(q: int) -> None:
        return None

    client = TestClient(app)
    response = client.get("/query", params={"q": "abc"})

    assert response.status_code == 422
    payload = response.json()
    assert payload["message"] == "参数校验失败"
    assert payload["error"] == "VALIDATION_ERROR"
    assert payload["meta"] is not None
    assert isinstance(payload["meta"].get("details"), list)


def test_unhandled_error_handler(monkeypatch, tmp_path: Path) -> None:
    _configure_logging_env(monkeypatch, tmp_path)
    app = create_app()

    @app.get("/unhandled")
    def unhandled() -> None:
        raise RuntimeError("boom")

    client = TestClient(app)
    response = client.get("/unhandled")

    assert response.status_code == 500
    payload = response.json()
    assert payload["message"] == "服务器内部错误"
    assert payload["error"] == "INTERNAL_ERROR"
    # Never leak stack traces in API responses.
    assert "Traceback" not in response.text
