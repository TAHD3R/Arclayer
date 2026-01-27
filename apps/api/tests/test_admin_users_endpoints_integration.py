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
from apps.api.infra.db.orm import close_orm, init_orm, verify_db_ready
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
async def prepared_db_with_repo_plugins(integration_db_settings, monkeypatch) -> None:
    # Use built-in plugins from the repository, but disable auto-migrate for integration tests.
    repo_root = Path(__file__).resolve().parents[3]
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


async def test_admin_users_management_flow(prepared_db_with_repo_plugins) -> None:
    _ = prepared_db_with_repo_plugins
    settings = get_settings()

    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        from apps.api.core.rbac.constants import ROLE_ADMIN
        from apps.api.core.rbac.repository import RBACRepository
        from apps.api.routers.v1.auth.repository import UserRepository
        from apps.api.routers.v1.auth.security import hash_password

        user_repo = UserRepository()
        rbac_repo = RBACRepository()

        # Create an admin user for calling /admin/** endpoints.
        admin_username = f"admin_{uuid4().hex}"
        admin = await user_repo.create_user(
            username=admin_username,
            email=None,
            display_name="Admin",
            password_hash=hash_password("admin_password_123", settings.auth),
        )
        role = await rbac_repo.get_role_by_code(ROLE_ADMIN)
        assert role is not None
        await rbac_repo.assign_role(user_id=admin.id, role=role)

        async def _current_user_id():
            return admin.id

        app.dependency_overrides[get_current_user_id] = _current_user_id

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Create a normal user.
            username = f"user_{uuid4().hex}"
            email = f"{uuid4().hex}@example.com"
            resp = await client.post(
                "/api/v1/admin/users",
                json={
                    "username": username,
                    "email": email,
                    "displayName": "Demo User",
                    "password": "user_password_123",
                },
            )
            assert resp.status_code == 200
            created = resp.json()["data"]
            user_id = created["id"]
            user_uuid = UUID(user_id)
            assert created["username"] == username
            assert created["email"] == email
            assert created["status"] == "active"

            # List users (pagination shape).
            resp = await client.get("/api/v1/admin/users?page=1&size=10")
            assert resp.status_code == 200
            page = resp.json()["data"]
            assert "items" in page
            assert page["page"] == 1
            assert page["size"] == 10
            assert page["total"] >= 2

            # Search by q.
            resp = await client.get(f"/api/v1/admin/users?q={username}")
            assert resp.status_code == 200
            items = resp.json()["data"]["items"]
            assert any(item["id"] == user_id for item in items)

            # Filter by role_code (admin should match).
            resp = await client.get("/api/v1/admin/users?roleCode=admin")
            assert resp.status_code == 200
            items = resp.json()["data"]["items"]
            assert any(item["id"] == str(admin.id) for item in items)

            # Detail.
            resp = await client.get(f"/api/v1/admin/users/{user_id}")
            assert resp.status_code == 200
            detail = resp.json()["data"]
            assert detail["id"] == user_id
            assert "tokenVersion" in detail

            # Update (username must stay immutable; only allow email/display_name/avatar_url).
            resp = await client.patch(
                f"/api/v1/admin/users/{user_id}",
                json={"displayName": "Updated User"},
            )
            assert resp.status_code == 200
            assert resp.json()["data"]["displayName"] == "Updated User"
            assert resp.json()["data"]["username"] == username

            # Disable and filter by status.
            resp = await client.post(f"/api/v1/admin/users/{user_id}/disable")
            assert resp.status_code == 200
            assert resp.json()["data"]["status"] == "disabled"

            resp = await client.get("/api/v1/admin/users?status=disabled")
            assert resp.status_code == 200
            items = resp.json()["data"]["items"]
            assert any(item["id"] == user_id for item in items)

            # Reset password (should bump token version).
            before_user = await user_repo.get_by_id(user_uuid)
            assert before_user is not None
            before = before_user.token_version
            resp = await client.post(
                f"/api/v1/admin/users/{user_id}/reset-password",
                json={"newPassword": "new_password_123"},
            )
            assert resp.status_code == 200
            after_user = await user_repo.get_by_id(user_uuid)
            assert after_user is not None
            after = after_user.token_version
            assert after == before + 1

            # Authz snapshot for the user should be available.
            resp = await client.get(f"/api/v1/admin/users/{user_id}/authz")
            assert resp.status_code == 200
            authz = resp.json()["data"]
            assert authz["userId"] == user_id
            assert "roleCodes" in authz
            assert "permissionCodes" in authz
