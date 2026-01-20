from pathlib import Path

from fastapi import HTTPException
from fastapi.testclient import TestClient

from apps.api.core.exceptions import APIError
from apps.api.core.registry import create_app


def _configure_logging_env(monkeypatch, log_dir: Path) -> None:
    monkeypatch.setenv("LOG_DIR", str(log_dir))
    monkeypatch.setenv("LOG_ASYNC", "0")


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
    assert "error" not in payload
    assert payload["message"] == "请求失败"


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
    assert "error" not in payload
    assert payload["message"] == "资源不存在"


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
    assert "error" not in payload
