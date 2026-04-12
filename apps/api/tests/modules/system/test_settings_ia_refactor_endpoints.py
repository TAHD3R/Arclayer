from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict

from src.config import get_settings
from src.models.organization.org_membership import OrgRole
from src.modules.auth.http.service import get_current_user
from src.modules.organization.http.service import require_org_owner
from src.modules.organization.router import router as me_router
from src.modules.system.mail.router import get_mail_service
from src.modules.system.mail.schema import MailTestResult
from src.modules.system.router import router as system_router
from tests.utils.asgi_client import asgi_client

pytestmark = pytest.mark.integration


async def test_system_runtime_public_endpoint(monkeypatch) -> None:
    monkeypatch.setenv("TEST_DATABASE__ENABLED", "0")
    monkeypatch.setenv("TEST_VALKEY__ENABLED", "0")
    get_settings.cache_clear()

    app = FastAPI()
    app.include_router(system_router, prefix="/api/v1/system")

    async with asgi_client(app) as client:
        res = await client.get("/api/v1/system/runtime")

    assert res.status_code == 200
    payload = res.json()
    assert payload.get("error") is None
    data = payload.get("data") or {}
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

    class DummyOrg(BaseModel):
        model_config = ConfigDict(extra="forbid", frozen=True)

        id: UUID
        name: str
        slug: str
        logo_url: str | None

    class DummyOrgMembership(BaseModel):
        model_config = ConfigDict(extra="forbid")

        id: UUID
        organization_id: UUID
        role: OrgRole
        status: str
        organization: DummyOrg | None

        async def fetch_related(self, *_args, **_kwargs) -> None:
            return None

    async def _get_orgm_owner_override() -> DummyOrgMembership:
        return DummyOrgMembership(
            id=orgm_id,
            organization_id=org_id,
            role=OrgRole.OWNER,
            status="active",
            organization=DummyOrg(id=org_id, name="Demo Org", slug="demo", logo_url=None),
        )

    app = FastAPI()
    app.include_router(me_router, prefix="/api/v1")
    # Override the dependency used by `/me/organization` to bypass auth and DB.
    from src.modules.organization.http.service import get_current_org_membership

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


async def test_system_endpoints_available_without_deployment_mode_gate(monkeypatch) -> None:
    get_settings.cache_clear()

    app = FastAPI()
    # The production app installs exception handlers via the app factory; for this
    # dependency-light test we install them explicitly so APIError -> HTTP responses.
    from src.core.exceptions import init_exception_handlers

    init_exception_handlers(app, get_settings())
    app.include_router(system_router, prefix="/api/v1/system")

    class DummyOrgMembership(BaseModel):
        model_config = ConfigDict(extra="forbid", frozen=True)

        role: OrgRole = OrgRole.OWNER

    async def _org_owner_override() -> DummyOrgMembership:
        return DummyOrgMembership(role=OrgRole.OWNER)

    async def _user_override() -> object:
        return object()

    class DummyMailService:
        async def send_test_email(self, *, recipient: str, locale: str | None = None) -> MailTestResult:
            return MailTestResult(ok=True)

    app.dependency_overrides[require_org_owner] = _org_owner_override
    app.dependency_overrides[get_current_user] = _user_override
    app.dependency_overrides[get_mail_service] = lambda: DummyMailService()

    async with asgi_client(app) as client:
        res_settings = await client.get("/api/v1/system/settings")
        assert res_settings.status_code == 503

        res_mail = await client.post("/api/v1/system/mail/test", json={"recipient": "demo@example.com"})
        assert res_mail.status_code == 200
