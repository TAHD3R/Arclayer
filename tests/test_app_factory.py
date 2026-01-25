from fastapi.testclient import TestClient

from apps.api.core.registry import create_app


def test_create_app_docs_enabled_in_test_env(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "test")

    app = create_app()

    assert app.title == "Celestial Framework API"
    assert app.debug is False

    with TestClient(app) as client:
        assert client.get("/docs").status_code == 200
        assert client.get("/openapi.json").status_code == 200


def test_create_app_docs_disabled_in_production(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")

    app = create_app()

    with TestClient(app) as client:
        assert client.get("/docs").status_code == 404
        assert client.get("/openapi.json").status_code == 404
