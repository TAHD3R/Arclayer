from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

import asyncpg
import pytest
import pytest_asyncio
from tortoise import Tortoise

from apps.api.config import get_settings
from apps.api.core.exceptions import BadRequest
from apps.api.core.registry import create_app
from apps.api.http.pagination import PageParams
from apps.api.infra.db.orm import close_orm, init_orm
from apps.api.models.user import UserStatus

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
    # Use built-in plugins from the repository.
    # Keep auto-restart disabled for tests; allow auto-migrate so schema stays in sync with models.
    repo_root = Path(__file__).resolve().parents[1]
    monkeypatch.setenv("PLUGIN__ENABLED", "1")
    monkeypatch.setenv("PLUGIN__ROOT_DIR", str(repo_root / "plugins"))
    monkeypatch.setenv("PLUGIN__AUTO_MIGRATE", "1")
    monkeypatch.setenv("PLUGIN__AUTO_RESTART", "0")
    get_settings.cache_clear()

    settings = get_settings()
    await _ensure_test_database(settings)
    await init_orm(settings)
    # Ensure aerich base table exists for upgrades on a fresh DB.
    await Tortoise.generate_schemas(safe=True)
    await close_orm()


async def test_department_soft_delete_and_directory_fields(prepared_db_with_repo_plugins_auto_migrate) -> None:
    _ = prepared_db_with_repo_plugins_auto_migrate
    settings = get_settings()

    app = create_app()
    async with app.router.lifespan_context(app):
        # Import after plugin discovery to ensure plugin packages are on sys.path.
        from org.models import Department
        from org.services import OrgService

        from apps.api.models.user import User

        service = OrgService(settings)

        # Create a root department.
        root = await service.create_department({
            "code": f"root_{uuid4().hex}",
            "name": "Root",
            "parent_id": None,
            "sort": 1,
            "is_active": True,
        })
        assert root.path is not None and root.path.startswith("/")
        assert root.depth == 0

        # Create a child department.
        child = await service.create_department({
            "code": f"child_{uuid4().hex}",
            "name": "Child",
            "parent_id": root.id,
            "sort": 1,
            "is_active": True,
        })
        assert child.depth == 1
        assert child.path is not None
        assert root.path is not None
        assert child.path.startswith(f"{root.path}/")

        # Move cycle should be rejected: cannot set root's parent to child.
        with pytest.raises(BadRequest) as exc:
            await service.update_department(department_id=root.id, payload={"parent_id": child.id})
        assert exc.value.error == "DEPARTMENT_MOVE_CYCLE"

        # Soft delete should be blocked when department has users.
        user = await User.create(username=f"demo_{uuid4().hex}", status=UserStatus.ACTIVE)
        await service.assign_user_department(user_id=user.id, department_id=child.id)
        with pytest.raises(BadRequest) as exc:
            await service.delete_department(department_id=child.id)
        assert exc.value.error == "DEPARTMENT_HAS_USERS"

        # After unbinding users, delete should mark deleted_at and hide from list.
        await service.revoke_user_department(user_id=user.id, department_id=child.id)
        await service.delete_department(department_id=child.id)

        deleted = await Department.get(id=child.id)
        assert deleted.deleted_at is not None
        assert deleted.is_active is False

        page = await service.list_departments_paginated(params=PageParams(page=1, size=200))
        assert all(item.id != child.id for item in page.items)

        # Restore should clear deleted_at and set active.
        await service.restore_department(department_id=child.id)
        restored = await Department.get(id=child.id)
        assert restored.deleted_at is None
        assert restored.is_active is True
