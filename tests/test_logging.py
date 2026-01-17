import json
import re
from pathlib import Path

import structlog
from asgi_correlation_id import correlation_id

from apps.api.config import get_settings
from apps.api.core.logging import configure_logging


def _configure(monkeypatch, log_dir: Path, *, app_env: str, log_json: bool | None = None) -> None:
    monkeypatch.setenv("APP_ENV", app_env)
    monkeypatch.setenv("LOG_LEVEL", "INFO")
    monkeypatch.setenv("LOG_DIR", str(log_dir))
    monkeypatch.setenv("LOG_ASYNC", "0")
    if log_json is not None:
        monkeypatch.setenv("LOG_JSON", "1" if log_json else "0")
    settings = get_settings()
    configure_logging(settings)


def test_logging_json_renderer_in_production(monkeypatch, capsys, tmp_path) -> None:
    _configure(monkeypatch, tmp_path, app_env="production")

    logger = structlog.get_logger("tests.logging.json")
    logger.info("hello", foo="bar")

    out = capsys.readouterr().out.strip()
    assert out
    payload = json.loads(out)
    assert payload["event"] == "hello"
    assert payload["level"] == "info"
    assert payload["foo"] == "bar"


def test_logging_console_renderer_in_development(monkeypatch, capsys, tmp_path) -> None:
    _configure(monkeypatch, tmp_path, app_env="development", log_json=False)

    token = correlation_id.set("deadbeef")
    try:
        logger = structlog.get_logger("tests.logging.console")
        logger.info("hello")
    finally:
        correlation_id.reset(token)

    out = capsys.readouterr().out.strip()
    assert "\x1b[34m" in out

    clean = re.sub(r"\x1b\[[0-9;]*m", "", out).strip()
    assert re.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \[info\s*\]", clean)
    assert "tests.logging.console" in clean
    assert "deadbeef" in clean
    assert "hello" in clean
