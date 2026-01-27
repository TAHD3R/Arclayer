from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.core.authz import AUTHZ_EXTENSION_POINT
from apps.api.core.registry import create_app
from apps.api.plugin.registry import registry
from apps.api.routers.v1.auth.deps import get_current_user

pytestmark = pytest.mark.integration


class _AllowAllEngine:
    async def has_permission(self, user_id, permission: str) -> bool:
        return True


async def test_org_selection_required_when_multi_org(prepared_db) -> None:
    _ = prepared_db

    app = create_app()
    transport = ASGITransport(app=app)

    from apps.api.core.rbac.constants import CORE_PERMISSION_OWNER
    from apps.api.core.rbac.engine import RBACAuthorizationEngine

    prev = registry.get_extension(AUTHZ_EXTENSION_POINT)
    registry.register_extension(CORE_PERMISSION_OWNER, AUTHZ_EXTENSION_POINT, _AllowAllEngine())
    try:
        async with app.router.lifespan_context(app):
            from apps.api.config import get_settings
            from apps.api.core.organization.repository import OrganizationRepository
            from apps.api.routers.v1.auth.repository import UserRepository
            from apps.api.routers.v1.auth.security import hash_password

            settings = get_settings()
            user_repo = UserRepository()
            org_repo = OrganizationRepository()

            # Create a user with two org memberships.
            user = await user_repo.create_user(
                username=f"user_{uuid4().hex[:10]}",
                email=None,
                display_name="User",
                password_hash=hash_password("user_password_123", settings.auth),
            )
            org1 = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Org 1")
            org2 = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Org 2")
            await org_repo.ensure_membership(user_id=user.id, organization_id=org1.id)
            await org_repo.ensure_membership(user_id=user.id, organization_id=org2.id)

            async def _fake_user():
                return SimpleNamespace(id=user.id)

            app.dependency_overrides[get_current_user] = _fake_user

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                # Without X-Org-Id, org-scoped endpoints must ask client to choose.
                resp = await client.get("/api/v1/auth/me/authz")
                assert resp.status_code == 409
                payload = resp.json()
                assert payload["error"] == "ORG_SELECTION_REQUIRED"
                assert payload["meta"] is not None
                candidates = payload["meta"].get("candidates") or []
                assert str(org1.id) in candidates
                assert str(org2.id) in candidates

                # With X-Org-Id, request should succeed.
                resp = await client.get("/api/v1/auth/me/authz", headers={"X-Org-Id": str(org1.id)})
                assert resp.status_code == 200
                data = resp.json()["data"]
                assert data["userId"] == str(user.id)
    finally:
        # Restore previous engine (usually RBACAuthorizationEngine).
        if prev is None:
            registry.unregister_extensions(CORE_PERMISSION_OWNER, AUTHZ_EXTENSION_POINT)
        else:
            registry.register_extension(CORE_PERMISSION_OWNER, AUTHZ_EXTENSION_POINT, prev or RBACAuthorizationEngine())
