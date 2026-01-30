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
from apps.api.infra.cache.valkey import ValkeyClient, close_valkey, init_valkey
from apps.api.infra.db.orm import close_orm, init_orm, verify_db_ready
from apps.api.tests.utils.tortoise import reset_postgres_schema


@pytest.fixture(autouse=True)
def clear_settings_cache() -> Iterator[None]:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _integration_enabled() -> bool:
    return os.getenv("RUN_INTEGRATION_TESTS") == "1"


@pytest.fixture
def integration_db_settings(monkeypatch) -> Iterator[None]:
    if not _integration_enabled():
        pytest.skip("integration tests disabled")

    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("TEST_DATABASE__ENABLED", "1")
    monkeypatch.setenv("TEST_DATABASE__NAME", os.getenv("TEST_DATABASE__NAME", "celestial_test"))
    yield


@pytest.fixture
def integration_valkey_settings(monkeypatch) -> str:
    if not _integration_enabled():
        pytest.skip("integration tests disabled")

    prefix = os.getenv("TEST_VALKEY__PREFIX") or f"test:{uuid4().hex}"
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("TEST_VALKEY__ENABLED", "1")
    monkeypatch.setenv("TEST_VALKEY__DB", os.getenv("TEST_VALKEY__DB", "15"))
    monkeypatch.setenv("TEST_VALKEY__DEFAULT_TTL", os.getenv("TEST_VALKEY__DEFAULT_TTL", "5"))
    monkeypatch.setenv("TEST_VALKEY__PREFIX", prefix)
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
    await _ensure_test_database(settings)
    await init_orm(settings)
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
