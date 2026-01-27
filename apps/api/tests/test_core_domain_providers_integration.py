from __future__ import annotations

import os
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import asyncpg
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from tortoise import Tortoise

from apps.api.config import get_settings
from apps.api.core.authz import AUTHZ_EXTENSION_POINT
from apps.api.core.registry import create_app
from apps.api.infra.db.orm import close_orm, init_orm
from apps.api.plugin.registry import registry
from apps.api.routers.v1.auth.deps import get_current_user
from apps.api.tests.utils.tortoise import reset_postgres_schema

pytestmark = pytest.mark.integration


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
async def prepared_db_with_repo_plugins_auto_migrate(integration_db_settings, monkeypatch) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    monkeypatch.setenv("PLUGIN__ENABLED", "1")
    monkeypatch.setenv("PLUGIN__ROOT_DIR", str(repo_root / "plugins"))
    monkeypatch.setenv("PLUGIN__AUTO_MIGRATE", "1")
    monkeypatch.setenv("PLUGIN__AUTO_RESTART", "0")
    get_settings.cache_clear()

    settings = get_settings()
    await _ensure_test_database(settings)
    await init_orm(settings)
    await reset_postgres_schema()
    await Tortoise.generate_schemas(safe=True)
    await close_orm()


class _AllowAllEngine:
    async def has_permission(self, user_id, permission: str) -> bool:
        return True


async def _fake_user():
    return SimpleNamespace(id=uuid4())


async def test_core_domain_short_paths(prepared_db_with_repo_plugins_auto_migrate) -> None:
    _ = prepared_db_with_repo_plugins_auto_migrate

    app = create_app()
    app.dependency_overrides[get_current_user] = _fake_user
    registry.register_extension("test", AUTHZ_EXTENSION_POINT, _AllowAllEngine())

    transport = ASGITransport(app=app)
    try:
        async with app.router.lifespan_context(app):
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                # Org tools (provider in plugin-organization-core.tools)
                resp = await client.post("/api/v1/admin/org/tools/validate")
                assert resp.status_code == 200
                assert "departmentsTotal" in resp.json()["data"]

                # RBAC roles (provider in plugin-rbac-core)
                resp = await client.get("/api/v1/admin/rbac/roles?page=1&size=10")
                assert resp.status_code == 200
                page = resp.json()["data"]
                assert "items" in page

                # Org departments (provider in plugin-organization-core)
                resp = await client.get("/api/v1/admin/org/departments?page=1&size=10")
                assert resp.status_code == 200
                page = resp.json()["data"]
                assert "items" in page
    finally:
        registry.unregister_extensions("test", AUTHZ_EXTENSION_POINT)
