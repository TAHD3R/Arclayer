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
from apps.api.core.registry import create_app
from apps.api.infra.db.orm import close_orm, init_orm, verify_db_ready
from apps.api.models.user import UserStatus
from apps.api.routers.v1.auth.deps import get_current_user
from tests.utils.tortoise import reset_postgres_schema

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
async def prepared_db_with_rbac_org(integration_db_settings, monkeypatch) -> None:
    # Use the built-in plugins from the repository. We keep auto-migrate disabled and
    # rely on generate_schemas() for integration tests.
    repo_root = Path(__file__).resolve().parents[1]
    monkeypatch.setenv("PLUGIN__ENABLED", "1")
    monkeypatch.setenv("PLUGIN__ROOT_DIR", str(repo_root / "plugins"))
    monkeypatch.setenv("PLUGIN__AUTO_MIGRATE", "0")
    monkeypatch.setenv("PLUGIN__AUTO_RESTART", "0")
    get_settings.cache_clear()

    settings = get_settings()
    await _ensure_test_database(settings)
    await init_orm(settings)
    await reset_postgres_schema()
    await Tortoise.generate_schemas(safe=True)
    await close_orm()


async def test_rbac_org_bridge_effective_roles(prepared_db_with_rbac_org) -> None:
    _ = prepared_db_with_rbac_org
    settings = get_settings()

    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        # Import plugin modules after lifespan startup, because plugin discovery adds
        # plugin roots (and their src/) to sys.path.
        from org.models import Department, Position, UserPosition
        from rbac.services import RBACService
        from rbac_org.services import RBACOrgService

        from apps.api.models.user import User

        # Create a user without any direct roles. It should NOT be able to access admin routes.
        user = await User.create(
            username=f"demo_{uuid4().hex}",
            email=None,
            status=UserStatus.ACTIVE,
            display_name="Demo",
            avatar_url=None,
        )

        async def _current_user():
            return SimpleNamespace(id=user.id)

        app.dependency_overrides[get_current_user] = _current_user

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me/authz")
            assert resp.status_code == 403

        # Create a position and bind a custom role to it, then assign the user to that position.
        # Use a randomized department code to avoid collisions when integration DB is reused
        # across runs (generate_schemas(safe=True) does not clear existing data).
        dept = await Department.create(
            code=f"d_{uuid4().hex[:8]}",
            name="Dept",
            parent_id=None,
            sort=0,
            is_active=True,
            description=None,
        )
        pos = await Position.create(
            code=f"p_{uuid4().hex[:8]}", name="Editor", sort=0, is_active=True, description=None
        )
        await UserPosition.create(user=user, position=pos)

        rbac = RBACService(settings)
        # A non-superuser role that still grants entering /admin/** via admin:access,
        # and grants a specific admin action for demonstration.
        role = await rbac.create_role(
            code=f"content_admin_{uuid4().hex[:8]}",
            name="Content Admin",
            description=None,
            is_default=False,
            is_superuser=False,
        )
        await rbac.set_role_permissions(
            role_code=role.code,
            permission_codes=["admin:access", "admin:org:departments:read"],
        )

        bridge = RBACOrgService(settings)
        await bridge.add_position_role(position_id=pos.id, role_code=role.code)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me/authz")
            assert resp.status_code == 200
            payload = resp.json()["data"]
            assert "admin:access" in payload["permissionCodes"]
            assert "admin:org:departments:read" in payload["permissionCodes"]
            assert role.code in payload["roleCodes"]

            # Access an /admin/** plugin route guarded by admin:access + admin:org:departments:read.
            resp = await client.get("/api/v1/admin/plugins/com.celestial.org/departments")
            assert resp.status_code == 200
            page = resp.json()["data"]
            items = page["items"]
            assert any(item["id"] == str(dept.id) for item in items)
