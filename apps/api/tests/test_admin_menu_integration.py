from __future__ import annotations

import os
from pathlib import Path
from uuid import UUID, uuid4

import asyncpg
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from tortoise import Tortoise

from apps.api.config import get_settings
from apps.api.core.registry import create_app
from apps.api.infra.db.orm import close_orm, init_orm
from apps.api.routers.v1.auth.deps import get_current_user_id
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


async def test_admin_menu_filtered_for_user(prepared_db_with_repo_plugins_auto_migrate) -> None:
    _ = prepared_db_with_repo_plugins_auto_migrate
    settings = get_settings()

    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        # Import after plugin startup so plugin packages are available.
        from rbac.constants import ROLE_ADMIN
        from rbac.repository import RBACRepository
        from rbac.services import RBACService

        from apps.api.routers.v1.auth.repository import UserRepository
        from apps.api.routers.v1.auth.security import hash_password

        user_repo = UserRepository()
        rbac_repo = RBACRepository()
        rbac_service = RBACService(settings)

        # Admin user (superuser) used to configure menu items.
        admin_user = await user_repo.create_user(
            username=f"admin_{uuid4().hex}",
            email=None,
            display_name="Admin",
            password_hash=hash_password("admin_password_123", settings.auth),
        )
        admin_role = await rbac_repo.get_role_by_code(ROLE_ADMIN)
        assert admin_role is not None
        await rbac_repo.assign_role(user_id=admin_user.id, role=admin_role)

        # Limited admin: has admin:access + system:plugins:read only.
        limited_user = await user_repo.create_user(
            username=f"staff_{uuid4().hex}",
            email=None,
            display_name="Staff",
            password_hash=hash_password("staff_password_123", settings.auth),
        )

        role_code = f"staff_role_{uuid4().hex}"
        role = await rbac_service.create_role(
            code=role_code,
            name="Staff Role",
            description=None,
            is_default=False,
            is_superuser=False,
        )
        await rbac_service.set_role_permissions(
            role_code=role_code,
            permission_codes=[
                "admin:access",
                "system:plugins:read",
            ],
        )
        await rbac_repo.assign_role(user_id=limited_user.id, role=role)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Configure menu items as admin.
            async def _as_admin() -> UUID:
                return admin_user.id

            app.dependency_overrides[get_current_user_id] = _as_admin

            # Root: Dashboard (no permission_code -> visible to any admin:access user).
            resp = await client.post(
                "/api/v1/admin/menus",
                json={
                    "code": f"dashboard_{uuid4().hex}",
                    "parentId": None,
                    "title": "Dashboard",
                    "type": "item",
                    "path": "/admin/dashboard",
                    "name": "admin_dashboard",
                    "componentKey": "DashboardPage",
                    "sort": 1,
                    "isActive": True,
                    "permissionCode": None,
                    "meta": {"keepAlive": True},
                },
            )
            assert resp.status_code == 200

            # Root group: System
            resp = await client.post(
                "/api/v1/admin/menus",
                json={
                    "code": f"system_{uuid4().hex}",
                    "parentId": None,
                    "title": "System",
                    "type": "group",
                    "sort": 10,
                    "isActive": True,
                },
            )
            assert resp.status_code == 200
            system_group_id = resp.json()["data"]["id"]

            # Child: Plugins (read)
            resp = await client.post(
                "/api/v1/admin/menus",
                json={
                    "code": f"plugins_read_{uuid4().hex}",
                    "parentId": system_group_id,
                    "title": "Plugins",
                    "type": "item",
                    "path": "/admin/plugins",
                    "name": "admin_plugins",
                    "componentKey": "PluginsPage",
                    "sort": 1,
                    "isActive": True,
                    "permissionCode": "system:plugins:read",
                },
            )
            assert resp.status_code == 200

            # Child: Plugins Manage (write)
            resp = await client.post(
                "/api/v1/admin/menus",
                json={
                    "code": f"plugins_manage_{uuid4().hex}",
                    "parentId": system_group_id,
                    "title": "Plugins Manage",
                    "type": "item",
                    "path": "/admin/plugins/manage",
                    "name": "admin_plugins_manage",
                    "componentKey": "PluginsManagePage",
                    "sort": 2,
                    "isActive": True,
                    "permissionCode": "system:plugins:manage",
                },
            )
            assert resp.status_code == 200

            # Fetch menu as limited user.
            async def _as_limited() -> UUID:
                return limited_user.id

            app.dependency_overrides[get_current_user_id] = _as_limited

            resp = await client.get("/api/v1/admin/menus/me")
            assert resp.status_code == 200
            tree = resp.json()["data"]["items"]

            # Dashboard should be visible.
            assert any(item.get("name") == "admin_dashboard" for item in tree)

            # System group should be visible because it has at least one visible child.
            system_nodes = [item for item in tree if item.get("title") == "System"]
            assert len(system_nodes) == 1
            system_children = system_nodes[0].get("children") or []
            # Should include read menu.
            assert any(child.get("name") == "admin_plugins" for child in system_children)
            # Should NOT include manage menu.
            assert not any(child.get("name") == "admin_plugins_manage" for child in system_children)
