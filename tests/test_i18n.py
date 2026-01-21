from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from apps.api.core import i18n
from apps.api.core.i18n import get_request_locale, localize_message, t


def test_get_request_locale_priority() -> None:
    app = FastAPI()

    @app.get("/locale")
    def locale_handler(request: Request) -> dict[str, str]:
        return {"locale": get_request_locale(request)}

    client = TestClient(app)

    response = client.get(
        "/locale?lang=zh-CN",
        headers={"X-Locale": "en-US", "Accept-Language": "zh-CN"},
    )
    assert response.json()["locale"] == "en-US"

    response = client.get("/locale?lang=zh-CN", headers={"Accept-Language": "en-US"})
    assert response.json()["locale"] == "zh-CN"

    response = client.get("/locale", headers={"Accept-Language": "en-US,en;q=0.9"})
    assert response.json()["locale"] == "en-US"

    response = client.get("/locale")
    assert response.json()["locale"] == "zh-CN"


def test_t_fallback_and_translate() -> None:
    assert t("auth", "LOGIN_SUCCESS", locale="en-US") == "Login succeeded"
    assert t("auth", "UNKNOWN_KEY", locale="en-US", default="Fallback") == "Fallback"
    assert t("auth", "UNKNOWN_KEY", locale="en-US") == "UNKNOWN_KEY"


def test_localize_message() -> None:
    assert localize_message("Denied", error="FORBIDDEN", locale="en-US") == "Forbidden"
    assert localize_message("Denied", error="FORBIDDEN", locale="zh-CN") == "Denied"


def test_register_locale_path_merges(tmp_path: Path) -> None:
    locale_root = tmp_path / "locales"
    en_dir = locale_root / "en-US"
    en_dir.mkdir(parents=True)
    (en_dir / "custom.json").write_text(json.dumps({"HELLO": "Hello from plugin"}), encoding="utf-8")

    original_paths = list(i18n._LOCALE_PATHS)
    try:
        i18n.register_locale_path(locale_root)
        assert t("custom", "HELLO", locale="en-US") == "Hello from plugin"
    finally:
        i18n._LOCALE_PATHS[:] = original_paths
        i18n._load_locale.cache_clear()
