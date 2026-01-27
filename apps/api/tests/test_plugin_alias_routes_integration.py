from __future__ import annotations

import textwrap
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.config import get_settings
from apps.api.core.authz import AUTHZ_EXTENSION_POINT
from apps.api.core.registry import create_app
from apps.api.plugin.registry import registry
from apps.api.routers.v1.auth.deps import get_current_user

pytestmark = pytest.mark.integration


def _write_demo_plugin_with_admin_router(plugin_root: Path, *, plugin_id: str) -> str:
    """
    Create a minimal plugin that exposes an admin router under:
    /api/v1/admin/plugins/{slug}/validate
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
            from apps.api.plugin.types import BasePlugin


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


class _AllowAllEngine:
    async def has_permission(self, user_id, permission: str) -> bool:
        return True


async def test_plugin_admin_alias_route(prepared_db, plugin_root) -> None:
    _ = prepared_db
    settings = get_settings()

    plugin_id = f"demo_alias_{uuid4().hex}"
    slug = _write_demo_plugin_with_admin_router(plugin_root, plugin_id=plugin_id)

    app = create_app()
    from apps.api.core.rbac.constants import CORE_PERMISSION_OWNER
    from apps.api.core.rbac.engine import RBACAuthorizationEngine

    prev = registry.get_extension(AUTHZ_EXTENSION_POINT)
    registry.register_extension(CORE_PERMISSION_OWNER, AUTHZ_EXTENSION_POINT, _AllowAllEngine())
    transport = ASGITransport(app=app)
    try:
        async with app.router.lifespan_context(app):
            from apps.api.core.organization.repository import OrganizationRepository
            from apps.api.routers.v1.auth.repository import UserRepository
            from apps.api.routers.v1.auth.security import hash_password

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
                resp = await client.post(f"/api/v1/admin/plugins/{slug}/validate")
                assert resp.status_code == 200
                assert resp.json() == {"ok": True}
    finally:
        if prev is None:
            registry.unregister_extensions(CORE_PERMISSION_OWNER, AUTHZ_EXTENSION_POINT)
        else:
            registry.register_extension(CORE_PERMISSION_OWNER, AUTHZ_EXTENSION_POINT, prev or RBACAuthorizationEngine())
