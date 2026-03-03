from __future__ import annotations

import textwrap
from pathlib import Path
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.src.config import get_settings
from apps.api.src.core.registry import create_app
from apps.api.src.modules.auth.deps import get_current_user, get_current_user_id

pytestmark = pytest.mark.integration


def _write_demo_plugin_with_admin_router(plugin_root: Path, *, plugin_id: str) -> str:
    """
    Create a minimal plugin that exposes an admin router under:
    /api/v1/workspaces/{workspace_id}/plugins/{slug}/validate
    """

    slug = plugin_id.replace(".", "-").replace("_", "-").lower()
    plugin_dir = plugin_root / plugin_id
    package = "demo_alias_plugin"
    src_dir = plugin_dir / "src" / package
    src_dir.mkdir(parents=True, exist_ok=True)

    (src_dir / "__init__.py").write_text("", encoding="utf-8")
    (src_dir / "plugin.py").write_text(
        textwrap.dedent(
            """
            from apps.api.src.plugin.types import BasePlugin


            class DemoPlugin(BasePlugin):
                async def on_start(self) -> None:
                    return None

                async def on_stop(self) -> None:
                    return None
            """
        ).lstrip(),
        encoding="utf-8",
    )
    (src_dir / "routers.py").write_text(
        textwrap.dedent(
            """
            from fastapi import APIRouter

            admin_router = APIRouter()


            @admin_router.post("/validate")
            async def validate():
                return {"ok": True}
            """
        ).lstrip(),
        encoding="utf-8",
    )

    (plugin_dir / "plugin.toml").write_text(
        textwrap.dedent(
            f"""
            [plugin]
            id = "{plugin_id}"
            slug = "{slug}"
            name = "Demo Plugin (Alias Routes)"
            description = "A demo plugin with admin router for integration tests"
            author = "Test"
            version = "0.1.0"
            requires = ">=2026.01.18-dev"
            entrypoint = "{package}.plugin:DemoPlugin"
            """
        ).lstrip(),
        encoding="utf-8",
    )
    return slug


async def test_plugin_admin_alias_route(prepared_db, plugin_root) -> None:
    _ = prepared_db
    settings = get_settings()

    plugin_id = f"demo-alias-{uuid4().hex}"
    slug = _write_demo_plugin_with_admin_router(plugin_root, plugin_id=plugin_id)

    app = create_app()
    transport = ASGITransport(app=app)
    async with app.router.lifespan_context(app):
        from apps.api.src.modules.auth.repository import UserRepository
        from apps.api.src.modules.auth.security import hash_password
        from apps.api.src.modules.organization.models.org_membership import OrgMembership, OrgRole
        from apps.api.src.modules.organization.models.user import User
        from apps.api.src.modules.organization.repository import OrganizationRepository
        from apps.api.src.modules.workspaces.models.workspace import Workspace

        user_repo = UserRepository()
        org_repo = OrganizationRepository()

        user = await user_repo.create_user(
            username=f"admin_{uuid4().hex}",
            email="owner@example.com",
            display_name="Admin",
            password_hash=hash_password("admin_password_123", settings.auth),
        )
        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        await OrgMembership.create(organization_id=org.id, user_id=user.id, role=OrgRole.OWNER, status="active")
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
            resp = await client.post(f"/api/v1/workspaces/{ws.id}/plugins/{slug}/validate")
            assert resp.status_code == 200
            assert resp.json() == {"ok": True}
