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


async def test_core_domain_short_paths(prepared_db_with_repo_plugins_auto_migrate) -> None:
    _ = prepared_db_with_repo_plugins_auto_migrate

    app = create_app()
    from apps.api.core.rbac.constants import CORE_PERMISSION_OWNER
    from apps.api.core.rbac.engine import RBACAuthorizationEngine

    prev = registry.get_extension(AUTHZ_EXTENSION_POINT)
    # Overwrite core authz engine for this test run (singleton).
    registry.register_extension(CORE_PERMISSION_OWNER, AUTHZ_EXTENSION_POINT, _AllowAllEngine())

    transport = ASGITransport(app=app)
    try:
        async with app.router.lifespan_context(app):
            from apps.api.core.organization.repository import OrganizationRepository
            from apps.api.routers.v1.auth.repository import UserRepository
            from apps.api.routers.v1.auth.security import hash_password

            settings = get_settings()
            user_repo = UserRepository()
            org_repo = OrganizationRepository()

            user = await user_repo.create_user(
                username=f"admin_{uuid4().hex}",
                email=None,
                display_name="Admin",
                password_hash=hash_password("admin_password_123", settings.auth),
            )
            org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
            await org_repo.ensure_membership(user_id=user.id, organization_id=org.id)

            async def _fake_user():
                return SimpleNamespace(id=user.id)

            app.dependency_overrides[get_current_user] = _fake_user

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                # Admin menu (provider in plugin-admin-dynamic-menu)
                resp = await client.get("/api/v1/admin/menus/me")
                assert resp.status_code == 200
                assert "items" in resp.json()["data"]

                # RBAC roles (core)
                resp = await client.get("/api/v1/admin/rbac/roles?page=1&size=10")
                assert resp.status_code == 200
                page = resp.json()["data"]
                assert "items" in page
    finally:
        if prev is None:
            registry.unregister_extensions(CORE_PERMISSION_OWNER, AUTHZ_EXTENSION_POINT)
        else:
            # Restore previous engine (usually RBACAuthorizationEngine).
            registry.register_extension(CORE_PERMISSION_OWNER, AUTHZ_EXTENSION_POINT, prev or RBACAuthorizationEngine())
