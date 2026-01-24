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
    repo_root = Path(__file__).resolve().parents[1]
    monkeypatch.setenv("PLUGIN__ENABLED", "1")
    monkeypatch.setenv("PLUGIN__ROOT_DIR", str(repo_root / "plugins"))
    monkeypatch.setenv("PLUGIN__AUTO_MIGRATE", "1")
    monkeypatch.setenv("PLUGIN__AUTO_RESTART", "0")
    get_settings.cache_clear()

    settings = get_settings()
    await _ensure_test_database(settings)
    await init_orm(settings)
    await Tortoise.generate_schemas(safe=True)
    await close_orm()


async def test_org_tools_merge_and_move(prepared_db_with_repo_plugins_auto_migrate) -> None:
    _ = prepared_db_with_repo_plugins_auto_migrate
    settings = get_settings()

    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        # Import after plugin startup so plugin packages are available.
        from org.models import Department, UserDepartment
        from org.services import OrgService
        from rbac.constants import ROLE_ADMIN
        from rbac.repository import RBACRepository

        from apps.api.models.user import User
        from apps.api.routers.v1.auth.repository import UserRepository
        from apps.api.routers.v1.auth.security import hash_password

        org = OrgService(settings)
        user_repo = UserRepository()
        rbac_repo = RBACRepository()

        # Create an admin user and bind admin role (superuser).
        admin = await user_repo.create_user(
            username=f"admin_{uuid4().hex}",
            email=None,
            display_name="Admin",
            password_hash=hash_password("admin_password_123", settings.auth),
        )
        role = await rbac_repo.get_role_by_code(ROLE_ADMIN)
        assert role is not None
        await rbac_repo.assign_role(user_id=admin.id, role=role)

        async def _current_user_id() -> UUID:
            return admin.id

        app.dependency_overrides[get_current_user_id] = _current_user_id

        # Create departments.
        target = await org.create_department({"code": f"t_{uuid4().hex}", "name": "Target", "parent_id": None})
        source = await org.create_department({"code": f"s_{uuid4().hex}", "name": "Source", "parent_id": None})
        child = await org.create_department({"code": f"c_{uuid4().hex}", "name": "Child", "parent_id": source.id})

        # Bind a user to source (to validate merge migration).
        demo_user = await User.create(username=f"u_{uuid4().hex}")
        await org.assign_user_department(user_id=demo_user.id, department_id=source.id, primary=True)
        assert await UserDepartment.filter(user_id=demo_user.id, department_id=source.id).exists()

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Validate endpoint works.
            resp = await client.post("/api/v1/admin/plugins/com.celestial.org.tools/validate")
            assert resp.status_code == 200
            data = resp.json()["data"]
            assert "departmentsTotal" in data

            # Move child under target.
            resp = await client.post(
                f"/api/v1/admin/plugins/com.celestial.org.tools/departments/{child.id}/move",
                json={"newParentId": str(target.id)},
            )
            assert resp.status_code == 200

            moved = await Department.get(id=child.id)
            assert moved.parent_id == target.id

            # Merge source into target.
            resp = await client.post(
                f"/api/v1/admin/plugins/com.celestial.org.tools/departments/{source.id}/merge",
                json={
                    "targetDepartmentId": str(target.id),
                    "moveChildrenToTarget": True,
                    "migrateUsers": True,
                    "migrateRoles": True,
                },
            )
            assert resp.status_code == 200

        # Source should be soft-deleted now.
        src = await Department.get(id=source.id)
        assert src.deleted_at is not None

        # Demo user should now be in target, not in source.
        assert not await UserDepartment.filter(user_id=demo_user.id, department_id=source.id).exists()
        assert await UserDepartment.filter(user_id=demo_user.id, department_id=target.id).exists()
