from __future__ import annotations

from pathlib import Path
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.config import get_settings
from apps.api.core.registry import create_app
from apps.api.modules.auth.deps import get_current_user_id

pytestmark = pytest.mark.integration


@pytest.fixture
def plugin_root(integration_db_settings, monkeypatch) -> Path:
    """
    Override the default `plugin_root` (from tests/conftest.py) for this module:
    we want to run integration tests with repository plugins enabled so the
    dynamic admin menu plugin models/permissions exist.

    Note:
    - In test env, we rely on `Tortoise.generate_schemas()` (not Aerich) for schema setup.
      Keeping AUTO_MIGRATE disabled avoids flaky subprocess behavior.
    """

    _ = integration_db_settings
    repo_root = Path(__file__).resolve().parents[3]
    root = repo_root / "plugins"
    monkeypatch.setenv("PLUGIN__ENABLED", "1")
    monkeypatch.setenv("PLUGIN__ROOT_DIR", str(root))
    monkeypatch.setenv("PLUGIN__AUTO_MIGRATE", "0")
    monkeypatch.setenv("PLUGIN__AUTO_RESTART", "0")
    get_settings.cache_clear()
    return root


async def test_admin_menu_filtered_for_user(prepared_db) -> None:
    _ = prepared_db
    settings = get_settings()

    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        from apps.api.modules.auth.repository import UserRepository
        from apps.api.modules.auth.security import hash_password
        from apps.api.modules.organization.models.org_membership import OrgMembership
        from apps.api.modules.organization.repository import OrganizationRepository
        from apps.api.modules.system.rbac.service import RBACService
        from apps.api.modules.workspaces.models.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipRole

        user_repo = UserRepository()
        org_repo = OrganizationRepository()
        rbac_service = RBACService(settings)

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")

        # Admin user (org owner + workspace creator) used to configure menu items.
        admin_user = await user_repo.create_user(
            username=f"admin_{uuid4().hex}",
            email=None,
            display_name="Admin",
            password_hash=hash_password("admin_password_123", settings.auth),
        )
        await OrgMembership.create(organization_id=org.id, user_id=admin_user.id, is_owner=True, status="active")
        ws = await Workspace.create(
            organization_id=org.id,
            slug=f"ws_{uuid4().hex[:8]}",
            name="Site",
            is_active=True,
            created_by_user_id=admin_user.id,
        )

        # Limited admin: has admin:access + system:plugins:read only.
        limited_user = await user_repo.create_user(
            username=f"staff_{uuid4().hex}",
            email=None,
            display_name="Staff",
            password_hash=hash_password("staff_password_123", settings.auth),
        )
        await OrgMembership.create(organization_id=org.id, user_id=limited_user.id, is_owner=False, status="active")
        limited_wsm = await WorkspaceMembership.create(
            workspace_id=ws.id,
            user_id=limited_user.id,
            status="active",
            invited_by_user_id=admin_user.id,
        )

        role_code = f"staff_role_{uuid4().hex}"
        # Ensure the new workspace has system roles + grants before we create custom roles.
        await rbac_service.ensure_workspace_system_role_grants(workspace_id=ws.id)

        role = await rbac_service.create_custom_role(
            workspace_id=ws.id,
            code=role_code,
            name_l10n={"en-US": "Staff Role"},
            description_l10n=None,
            template_role_code=None,
        )
        # Grant only the required permissions to this custom role.
        await rbac_service.set_permission_custom_roles(
            workspace_id=ws.id,
            permission_code="admin:access",
            role_codes=[role_code],
        )
        await rbac_service.set_permission_custom_roles(
            workspace_id=ws.id,
            permission_code="system:plugins:read",
            role_codes=[role_code],
        )
        await WorkspaceMembershipRole.create(membership_id=limited_wsm.id, role_id=role.id)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Configure menu items as admin.
            async def _as_admin() -> UUID:
                return admin_user.id

            app.dependency_overrides[get_current_user_id] = _as_admin

            # Root: Dashboard (no permission_code -> visible to any admin:access user).
            resp = await client.post(
                f"/api/v1/workspaces/{ws.id}/menus",
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
                f"/api/v1/workspaces/{ws.id}/menus",
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
                f"/api/v1/workspaces/{ws.id}/menus",
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
                f"/api/v1/workspaces/{ws.id}/menus",
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

            resp = await client.get(f"/api/v1/workspaces/{ws.id}/menus/me")
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
