import json
import re
from pathlib import Path

import structlog
from asgi_correlation_id import correlation_id

from src.config import get_settings
from src.core import logging as app_logging
from src.core.logging import configure_logging


def _configure(monkeypatch, log_dir: Path, *, app_env: str, log_json: bool | None = None) -> None:
    monkeypatch.setenv("APP_ENV", app_env)
    monkeypatch.setenv("LOGGING__LEVEL", "INFO")
    monkeypatch.setenv("LOGGING__LOG_DIR", str(log_dir))
    monkeypatch.setenv("LOGGING__ASYNC_ENABLED", "0")
    if app_env == "production":
        # Production settings require a stable public-id secret; provide a test-only value.
        monkeypatch.setenv("PUBLIC_ID__SECRET", "test-public-id-secret")
    if log_json is not None:
        monkeypatch.setenv("LOGGING__JSON_LOGS", "1" if log_json else "0")
    settings = get_settings()
    configure_logging(settings)


def test_logging_json_renderer_in_production(monkeypatch, capsys, tmp_path) -> None:
    _configure(monkeypatch, tmp_path, app_env="production", log_json=True)

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


def test_drain_async_logging_flushes_queued_records_and_keeps_logging_available(
    monkeypatch,
    capsys,
    tmp_path,
) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("LOGGING__LEVEL", "INFO")
    monkeypatch.setenv("LOGGING__LOG_DIR", str(tmp_path))
    monkeypatch.setenv("LOGGING__ASYNC_ENABLED", "1")
    monkeypatch.setenv("LOGGING__JSON_LOGS", "0")
    configure_logging(get_settings())
    logger = structlog.get_logger("tests.logging.drain")

    logger.info("queued before drain")
    app_logging.drain_async_logging()

    assert "queued before drain" in capsys.readouterr().out

    logger.info("synchronous after drain")

    assert "synchronous after drain" in capsys.readouterr().out
