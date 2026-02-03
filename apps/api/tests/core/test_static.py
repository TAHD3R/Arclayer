from pathlib import Path

from starlette.routing import Mount

from apps.api.core.registry import create_app


def _mount_paths(app) -> set[str]:
    return {route.path for route in app.routes if isinstance(route, Mount)}


def test_static_not_enabled_by_default(monkeypatch) -> None:
    monkeypatch.setenv("APP_STATIC_ENABLED", "0")
    monkeypatch.delenv("APP_STATIC_DIR", raising=False)
    monkeypatch.delenv("APP_STATIC_URL", raising=False)

    app = create_app()

    assert "/static" not in _mount_paths(app)


def test_static_enabled_creates_directory(monkeypatch, tmp_path: Path) -> None:
    static_dir = tmp_path / "public"

    monkeypatch.setenv("APP_STATIC_ENABLED", "1")
    monkeypatch.setenv("APP_STATIC_DIR", str(static_dir))
    monkeypatch.setenv("APP_STATIC_URL", "/assets")

    app = create_app()

    assert static_dir.exists()
    assert "/assets" in _mount_paths(app)
