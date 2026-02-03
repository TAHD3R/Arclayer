from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

import asyncpg
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from tortoise import Tortoise

from apps.api.config import get_settings
from apps.api.core.database.orm import close_orm, init_orm
from apps.api.core.registry import create_app
from apps.api.modules.auth.deps import get_current_user, get_current_user_id
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


async def test_core_domain_short_paths(prepared_db_with_repo_plugins_auto_migrate) -> None:
    _ = prepared_db_with_repo_plugins_auto_migrate

    app = create_app()

    transport = ASGITransport(app=app)
    async with app.router.lifespan_context(app):
        from apps.api.modules.auth.repository import UserRepository
        from apps.api.modules.auth.security import hash_password
        from apps.api.modules.organization.models.org_membership import OrgMembership
        from apps.api.modules.organization.models.user import User
        from apps.api.modules.organization.repository import OrganizationRepository
        from apps.api.modules.workspaces.models.workspace import Workspace

        settings = get_settings()
        user_repo = UserRepository()
        org_repo = OrganizationRepository()

        user = await user_repo.create_user(
            username=f"admin_{uuid4().hex}",
            email="owner@example.com",
            display_name="Admin",
            password_hash=hash_password("admin_password_123", settings.auth),
        )
        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        await OrgMembership.create(organization_id=org.id, user_id=user.id, is_owner=True, status="active")
        ws = await Workspace.create(
            organization_id=org.id,
            slug=f"ws_{uuid4().hex[:8]}",
            name="Site",
            is_active=True,
            created_by_user_id=user.id,
        )

        current_user: User | None = user

        async def _fake_user():
            assert current_user is not None
            return current_user

        async def _fake_user_id():
            assert current_user is not None
            return current_user.id

        app.dependency_overrides[get_current_user] = _fake_user
        app.dependency_overrides[get_current_user_id] = _fake_user_id

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Admin menu (provider in plugin-admin-dynamic-menu)
            resp = await client.get(f"/api/v1/workspaces/{ws.id}/menus/me")
            assert resp.status_code == 200
            assert "items" in resp.json()["data"]

            # RBAC roles (workspace-scoped read)
            resp = await client.get(f"/api/v1/workspaces/{ws.id}/rbac/roles?page=1&size=10")
            assert resp.status_code == 200
            page = resp.json()["data"]
            assert "items" in page
