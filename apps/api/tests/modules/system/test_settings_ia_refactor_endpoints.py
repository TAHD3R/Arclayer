from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI

from apps.api.config import get_settings
from apps.api.modules.auth.deps import get_current_user
from apps.api.modules.organization.deps import require_org_owner
from apps.api.modules.organization.models.org_membership import OrgRole
from apps.api.modules.organization.router import router as me_router
from apps.api.modules.system.router import router as system_router
from apps.api.tests.utils.asgi_client import asgi_client

pytestmark = pytest.mark.integration


async def test_system_runtime_public_endpoint(monkeypatch) -> None:
    monkeypatch.setenv("APPLICATION__DEPLOYMENT_MODE", "self_host")
    monkeypatch.setenv("DEPLOYMENT_MODE", "self_host")
    get_settings.cache_clear()

    app = FastAPI()
    app.include_router(system_router, prefix="/api/v1/system")

    async with asgi_client(app) as client:
        res = await client.get("/api/v1/system/runtime")

    assert res.status_code == 200
    payload = res.json()
    assert payload.get("error") is None
    data = payload.get("data") or {}
    assert data.get("deploymentMode") == "self_host"
    caps = data.get("capabilities") or {}
    assert caps.get("deploymentSettingsEnabled") is True
    assert caps.get("publicRegisterEnabled") is False


async def test_me_organization_owner_flag() -> None:
    """
    Keep this test dependency-light:
    - override auth/org membership dependency
    - avoid DB by returning a stub membership + organization object
    """

    org_id = uuid4()
    orgm_id = uuid4()

    @dataclass
    class DummyOrg:
        id: UUID
        name: str
        slug: str
        logo_url: str | None

    class DummyOrgMembership:
        id: UUID
        organization_id: UUID
        role: OrgRole
        status: str
        organization: DummyOrg | None

        def __init__(self, *, role: OrgRole) -> None:
            self.id = orgm_id
            self.organization_id = org_id
            self.role = role
            self.status = "active"
            self.organization = DummyOrg(
                id=org_id,
                name="Demo Org",
                slug="demo",
                logo_url=None,
            )

        async def fetch_related(self, *_args, **_kwargs) -> None:
            return None

    async def _get_orgm_owner_override() -> DummyOrgMembership:
        return DummyOrgMembership(role=OrgRole.OWNER)

    app = FastAPI()
    app.include_router(me_router, prefix="/api/v1")
    # Override the dependency used by `/me/organization` to bypass auth and DB.
    from apps.api.modules.organization.deps import get_current_org_membership

    app.dependency_overrides[get_current_org_membership] = _get_orgm_owner_override

    async with asgi_client(app) as client:
        res = await client.get("/api/v1/me/organization")

    assert res.status_code == 200
    data = res.json().get("data") or {}
    membership = data.get("membership") or {}
    assert membership.get("role") == "owner"
    assert membership.get("status") == "active"
    organization = data.get("organization") or {}
    assert organization.get("slug") == "demo"


async def test_system_endpoints_disabled_in_saas_mode(monkeypatch) -> None:
    monkeypatch.setenv("APPLICATION__DEPLOYMENT_MODE", "saas")
    monkeypatch.setenv("DEPLOYMENT_MODE", "saas")
    get_settings.cache_clear()

    app = FastAPI()
    # The production app installs exception handlers via the app factory; for this
    # dependency-light test we install them explicitly so APIError -> HTTP responses.
    from apps.api.core.exceptions import init_exception_handlers

    init_exception_handlers(app, get_settings())
    app.include_router(system_router, prefix="/api/v1/system")

    # In SaaS mode we should be blocked before any plugin/DB dependencies are evaluated,
    # but still override owner/user deps to keep the test robust.
    @dataclass
    class DummyOrgMembership:
        role: OrgRole = OrgRole.OWNER

    async def _org_owner_override() -> DummyOrgMembership:
        return DummyOrgMembership(role=OrgRole.OWNER)

    async def _user_override() -> object:
        return object()

    app.dependency_overrides[require_org_owner] = _org_owner_override
    app.dependency_overrides[get_current_user] = _user_override

    async with asgi_client(app) as client:
        res_settings = await client.get("/api/v1/system/settings")
        assert res_settings.status_code == 404

        res_mail = await client.post("/api/v1/system/mail/test", json={"recipient": "demo@example.com"})
        assert res_mail.status_code == 404
