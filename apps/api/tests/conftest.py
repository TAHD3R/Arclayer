from __future__ import annotations

import os
import sys
from collections.abc import AsyncGenerator, Iterator
from pathlib import Path
from uuid import uuid4

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

from apps.api.config import get_settings
from apps.api.core.database.orm import close_orm, init_orm, verify_db_ready
from apps.api.infra.cache.valkey import ValkeyClient, close_valkey, init_valkey
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
    - Integration tests opt-in via `RUN_INTEGRATION_TESTS=1` and explicitly enable DB/Valkey using
      `TEST_DATABASE__ENABLED` / `TEST_VALKEY__ENABLED`.
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


@pytest.fixture
def integration_db_settings(monkeypatch) -> Iterator[None]:
    if not _integration_enabled():
        pytest.skip("integration tests disabled")

    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("APPLICATION__DEPLOYMENT_MODE", "self_host")
    monkeypatch.setenv("DEPLOYMENT_MODE", "self_host")
    monkeypatch.setenv("TEST_DATABASE__ENABLED", "1")
    monkeypatch.setenv("TEST_DATABASE__NAME", os.getenv("TEST_DATABASE__NAME", "celestial_test"))
    # Ensure subsequent `get_settings()` calls see the updated integration env.
    get_settings.cache_clear()
    yield


@pytest.fixture
def integration_valkey_settings(monkeypatch) -> str:
    if not _integration_enabled():
        pytest.skip("integration tests disabled")

    prefix = os.getenv("TEST_VALKEY__PREFIX") or f"test:{uuid4().hex}"
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("APPLICATION__DEPLOYMENT_MODE", "self_host")
    monkeypatch.setenv("DEPLOYMENT_MODE", "self_host")
    monkeypatch.setenv("TEST_VALKEY__ENABLED", "1")
    monkeypatch.setenv("TEST_VALKEY__DB", os.getenv("TEST_VALKEY__DB", "15"))
    monkeypatch.setenv("TEST_VALKEY__DEFAULT_TTL", os.getenv("TEST_VALKEY__DEFAULT_TTL", "5"))
    monkeypatch.setenv("TEST_VALKEY__PREFIX", prefix)
    # `get_settings()` is cached; clear it so valkey gets enabled for the app under test.
    get_settings.cache_clear()
    return prefix


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
    await close_orm()
    yield


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
