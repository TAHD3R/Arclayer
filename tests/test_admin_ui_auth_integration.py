from __future__ import annotations

import os
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import asyncpg
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from org.models import Position, UserPosition
from rbac.services import RBACService
from rbac_org.services import RBACOrgService
from tortoise import Tortoise

from apps.api.config import get_settings
from apps.api.core.database.orm import close_orm, init_orm, verify_db_ready
from apps.api.core.registry import create_app
from apps.api.models.user import User, UserStatus
from apps.api.routers.v1.auth.deps import get_current_user

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
async def prepared_db_with_admin_ui(integration_db_settings, monkeypatch) -> None:
    # Use repo plugins to ensure admin ui auth + org + rbac plugins are discovered.
    repo_root = Path(__file__).resolve().parents[1]
    monkeypatch.setenv("PLUGIN__ENABLED", "1")
    monkeypatch.setenv("PLUGIN__ROOT_DIR", str(repo_root / "plugins"))
    monkeypatch.setenv("PLUGIN__AUTO_MIGRATE", "0")
    monkeypatch.setenv("PLUGIN__AUTO_RESTART", "0")
    get_settings.cache_clear()

    settings = get_settings()
    await _ensure_test_database(settings)
    await init_orm(settings)
    await Tortoise.generate_schemas(safe=True)
    await close_orm()


async def test_admin_ui_context_menu_filter_and_action_disabled(prepared_db_with_admin_ui) -> None:
    _ = prepared_db_with_admin_ui
    settings = get_settings()

    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

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
            # No permissions -> cannot access admin ui endpoints.
            resp = await client.get("/api/v1/admin/ui/context")
            assert resp.status_code == 403

        # Create a role that allows entering admin and reading org positions, but not writing.
        rbac = RBACService(settings)
        role = await rbac.create_role(
            code=f"org_reader_{uuid4().hex[:8]}",
            name="Org Reader",
            description=None,
            is_default=False,
            is_superuser=False,
        )
        await rbac.set_role_permissions(
            role_code=role.code,
            permission_codes=["admin:access", "admin:org:positions:read"],
        )

        # Assign role via position mapping (rbac.org bridge) to ensure effective roles work end-to-end.
        pos = await Position.create(
            code=f"p_{uuid4().hex[:8]}", name="Reader", sort=0, is_active=True, description=None
        )
        await UserPosition.create(user=user, position=pos)
        bridge = RBACOrgService(settings)
        await bridge.add_position_role(position_id=pos.id, role_code=role.code)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/admin/ui/context")
            assert resp.status_code == 200
            data = resp.json()["data"]
            nav = data["navTree"]
            actions = data["actions"]

            # Menu is filtered: user should see org positions, but not org departments.
            nav_ids = set()

            def _walk(nodes):
                for n in nodes:
                    nav_ids.add(n["id"])
                    _walk(n.get("children") or [])

            _walk(nav)
            assert "org" in nav_ids
            assert "org.positions" in nav_ids
            assert "org.departments" not in nav_ids

            # Actions exist but are disabled when lacking write permission.
            create_action = actions.get("org.positions.create")
            assert create_action is not None
            assert create_action["enabled"] is False
