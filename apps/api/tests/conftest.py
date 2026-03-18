from __future__ import annotations

import os
import sys
from collections.abc import AsyncGenerator, Iterator
from pathlib import Path

import asyncpg
import pytest
import pytest_asyncio
from fastapi import FastAPI
from tortoise import Tortoise

# Ensure repository root is importable (e.g. `apps.*`, `plugins/*`), but avoid
# putting `apps/api` itself on `sys.path` (it would shadow stdlib modules like `http`).
REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from apps.api.src.config import get_settings
from apps.api.src.core.database.orm import close_orm, init_orm, verify_db_ready
from apps.api.src.infra.cache.valkey import ValkeyClient, close_valkey, init_valkey
from apps.api.tests.utils.plugins import collect_test_plugin_models
from apps.api.tests.utils.tortoise import reset_postgres_schema


@pytest.fixture(autouse=True)
def clear_settings_cache() -> Iterator[None]:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def base_test_env(monkeypatch) -> Iterator[None]:
    """
    Make unit tests hermetic by default.

    Rationale:
    - `get_settings()` loads `.env` first. In local dev this often enables DB/Valkey, which makes
      pure unit tests flaky/hanging in sandboxed environments (no external sockets).
    - Integration tests opt-in via `RUN_INTEGRATION_TESTS=1`. Test DB/Valkey backends default to
      enabled in test mode and can still be explicitly disabled via
      `TEST_DATABASE__ENABLED=0` / `TEST_VALKEY__ENABLED=0`.
    """

    # External dependencies off by default.
    #
    # Notes:
    # - Do NOT set `APP_ENV` here. Some unit tests construct `Settings(...)` explicitly and expect
    #   init kwargs to win; our Settings source order prioritizes env over init kwargs.
    # - Do NOT force `TEST_*` flags here; integration fixtures control those explicitly.
    monkeypatch.setenv("DATABASE__ENABLED", "0")
    monkeypatch.setenv("VALKEY__ENABLED", "0")
    monkeypatch.setenv("VALKEY__LIMITER_ENABLED", "0")
    monkeypatch.setenv("TASKIQ__ENABLED", "0")

    # Avoid async log queue threads in tests unless explicitly enabled.
    monkeypatch.setenv("LOG_ASYNC", "0")
    yield


def _integration_enabled() -> bool:
    return os.getenv("RUN_INTEGRATION_TESTS") == "1"


def _activate_integration_env(monkeypatch) -> None:
    """
    Switch settings loading into test mode and let TEST_* values come from env files.

    Integration backends default to enabled in test mode. `apps/api/.env`, `.env.test`, `.env.local`,
    or exported `TEST_DATABASE__*` / `TEST_VALKEY__*` keys can override the defaults when a test needs
    to disable or customize them.
    """

    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("APPLICATION__DEPLOYMENT_MODE", "self_host")
    monkeypatch.setenv("DEPLOYMENT_MODE", "self_host")
    # Integration tests may hit email invitation flows. Enable mail but suppress actual sending.
    monkeypatch.setenv("MAIL__ENABLED", "1")
    monkeypatch.setenv("MAIL__SUPPRESS_SEND", "1")
    # Keep integration tests hermetic regardless of local `.env` values.
    #
    # ORM discovery must only load the canonical model package.
    monkeypatch.setenv("DATABASE__CORE_MODELS", '["apps.api.src.models"]')
    monkeypatch.setenv("DATABASE__PLUGIN_PACKAGES", '["apps.api.src.plugins"]')
    get_settings.cache_clear()


def _require_test_backend_enabled(*, enabled: bool, flag_name: str, backend_name: str) -> None:
    if enabled:
        return
    pytest.skip(f"{backend_name} integration backend disabled; set {flag_name}=true")


@pytest.fixture
def integration_db_settings(monkeypatch) -> Iterator[None]:
    if not _integration_enabled():
        pytest.skip("integration tests disabled")

    _activate_integration_env(monkeypatch)
    settings = get_settings()
    _require_test_backend_enabled(
        enabled=settings.testing.database_enabled,
        flag_name="TEST_DATABASE__ENABLED",
        backend_name="database",
    )
    yield


@pytest.fixture
def integration_valkey_settings(monkeypatch) -> str:
    if not _integration_enabled():
        pytest.skip("integration tests disabled")

    _activate_integration_env(monkeypatch)
    settings = get_settings()
    _require_test_backend_enabled(
        enabled=settings.testing.valkey_enabled,
        flag_name="TEST_VALKEY__ENABLED",
        backend_name="valkey",
    )
    return settings.testing.valkey_prefix or "test"


@pytest.fixture
def plugin_root(tmp_path, monkeypatch) -> Path:
    root = tmp_path / "plugins"
    monkeypatch.setenv("PLUGIN__ENABLED", "1")
    monkeypatch.setenv("PLUGIN__ROOT_DIR", str(root))
    monkeypatch.setenv("PLUGIN__AUTO_MIGRATE", "0")
    monkeypatch.setenv("PLUGIN__AUTO_RESTART", "0")
    get_settings.cache_clear()
    return root


async def _ensure_test_database(settings) -> None:
    db_name = settings.database.database
    admin_db = os.getenv("TEST_DATABASE__ADMIN_DB", "postgres")
    if db_name == admin_db:
        return

    password = settings.database.password.get_secret_value()
    auth = f"{settings.database.user}:{password}@" if password else f"{settings.database.user}@"
    dsn = f"postgresql://{auth}{settings.database.host}:{settings.database.port}/{admin_db}"
    conn = await asyncpg.connect(dsn)
    try:
        exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname=$1", db_name)
        if not exists:
            safe_name = db_name.replace('"', '""')
            await conn.execute(f'CREATE DATABASE "{safe_name}"')
    finally:
        await conn.close()


@pytest_asyncio.fixture
async def db(integration_db_settings) -> AsyncGenerator[None, None]:
    settings = get_settings()
    await _ensure_test_database(settings)
    await init_orm(settings)
    await verify_db_ready(settings)
    try:
        yield
    finally:
        await close_orm()


@pytest_asyncio.fixture
async def prepared_db(integration_db_settings, plugin_root) -> AsyncGenerator[None, None]:
    settings = get_settings()
    extra_models = collect_test_plugin_models(settings)
    await _ensure_test_database(settings)
    await init_orm(settings, extra_modules=extra_models)
    await reset_postgres_schema()
    await Tortoise.generate_schemas(safe=True)
    try:
        yield
    finally:
        await close_orm()


@pytest_asyncio.fixture
async def db_schema(db) -> AsyncGenerator[None, None]:
    await reset_postgres_schema()
    await Tortoise.generate_schemas(safe=True)
    yield


@pytest_asyncio.fixture
async def valkey_client(integration_valkey_settings) -> AsyncGenerator[tuple[ValkeyClient, str], None]:
    settings = get_settings()
    app = FastAPI()
    await init_valkey(app, settings)
    try:
        yield app.state.valkey, integration_valkey_settings
    finally:
        await close_valkey(app)
