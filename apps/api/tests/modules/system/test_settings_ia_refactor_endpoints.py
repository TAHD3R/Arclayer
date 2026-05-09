from __future__ import annotations

import pytest
from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict

from src.config import get_settings
from src.modules.auth.http.service import get_current_user, require_super_admin
from src.modules.system.mail.router import get_mail_service
from src.modules.system.mail.schema import MailTestResult
from src.modules.system.router import router as system_router
from tests.utils.asgi_client import asgi_client

pytestmark = pytest.mark.integration


async def test_system_runtime_public_endpoint(monkeypatch) -> None:
    monkeypatch.setenv("TEST_DATABASE__ENABLED", "0")
    monkeypatch.setenv("TEST_VALKEY__ENABLED", "0")
    monkeypatch.setenv("AUTH__ALLOW_PUBLIC_REGISTER", "0")
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


async def test_system_endpoints_available_without_deployment_mode_gate(monkeypatch) -> None:
    get_settings.cache_clear()

    app = FastAPI()
    # The production app installs exception handlers via the app factory; for this
    # dependency-light test we install them explicitly so APIError -> HTTP responses.
    from src.core.exceptions import init_exception_handlers

    init_exception_handlers(app, get_settings())
    app.include_router(system_router, prefix="/api/v1/system")

    class DummyUser(BaseModel):
        model_config = ConfigDict(extra="forbid", frozen=True)

        is_super_admin: bool = True

    async def _super_admin_override() -> DummyUser:
        return DummyUser()

    class DummyMailService:
        async def send_test_email(self, *, recipient: str, locale: str | None = None) -> MailTestResult:
            return MailTestResult(ok=True)

    app.dependency_overrides[require_super_admin] = _super_admin_override
    app.dependency_overrides[get_current_user] = _super_admin_override
    app.dependency_overrides[get_mail_service] = lambda: DummyMailService()

    async with asgi_client(app) as client:
        res_settings = await client.get("/api/v1/system/settings")
        assert res_settings.status_code == 503

        res_mail = await client.post("/api/v1/system/mail/test", json={"recipient": "demo@example.com"})
        assert res_mail.status_code == 200


async def test_system_settings_require_super_admin() -> None:
    app = FastAPI()

    from src.core.exceptions import init_exception_handlers

    init_exception_handlers(app, get_settings())
    app.include_router(system_router, prefix="/api/v1/system")

    class DummyUser(BaseModel):
        model_config = ConfigDict(extra="forbid", frozen=True)

        is_super_admin: bool = False

    async def _user_override() -> DummyUser:
        return DummyUser()

    app.dependency_overrides[get_current_user] = _user_override

    async with asgi_client(app) as client:
        res = await client.get("/api/v1/system/settings")

    assert res.status_code == 403
    assert res.json().get("error") == "SUPER_ADMIN_REQUIRED"


async def test_system_activity_requires_super_admin() -> None:
    app = FastAPI()

    from src.core.exceptions import init_exception_handlers

    init_exception_handlers(app, get_settings())
    app.include_router(system_router, prefix="/api/v1/system")

    class DummyUser(BaseModel):
        model_config = ConfigDict(extra="forbid", frozen=True)

        is_super_admin: bool = False

    async def _user_override() -> DummyUser:
        return DummyUser()

    app.dependency_overrides[get_current_user] = _user_override

    async with asgi_client(app) as client:
        res = await client.get("/api/v1/system/activity")

    assert res.status_code == 403
    assert res.json().get("error") == "SUPER_ADMIN_REQUIRED"
