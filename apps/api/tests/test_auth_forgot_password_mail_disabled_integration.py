from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.config import get_settings
from apps.api.core.registry import create_app
from apps.api.infra.db.orm import verify_db_ready
from apps.api.models.setting import SettingRecord
from apps.api.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

pytestmark = pytest.mark.integration


async def _create_user_with_email(*, email: str) -> None:
    from apps.api.routers.v1.auth.repository import UserRepository
    from apps.api.routers.v1.auth.security import hash_password

    settings = get_settings()
    user_repo = UserRepository()
    await user_repo.create_user(
        username=f"user_{uuid4().hex}",
        email=email,
        display_name="User",
        password_hash=hash_password("user_password_123", settings.auth),
    )


async def test_forgot_password_fails_fast_when_mail_disabled(
    prepared_db,
    integration_valkey_settings,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        # No matter whether the account exists, we should fail fast to avoid "fake success".
        await SettingRecord.create(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace="core",
            value={"mail": {"enabled": False}},
        )

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/v1/auth/forgot-password", json={"identifier": "any@example.com"})
            assert resp.status_code == 400
            assert resp.json().get("error") == "MAIL_DISABLED"


async def test_forgot_password_works_when_mail_enabled(
    prepared_db,
    integration_valkey_settings,
    monkeypatch,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    sent: list[str] = []

    class DummyMail:
        async def send_message(self, message, **kwargs):  # type: ignore[no-untyped-def]
            recipients = getattr(message, "recipients", None)
            if recipients:
                sent.append(str(recipients[0].email))
            else:
                sent.append("unknown")

    async def _dummy_get_fast_mail(self):  # type: ignore[no-untyped-def]
        return DummyMail()

    monkeypatch.setattr("apps.api.common.email.service.EmailService._get_fast_mail", _dummy_get_fast_mail)

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        await SettingRecord.create(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace="core",
            value={"mail": {"enabled": True}},
        )
        await _create_user_with_email(email="user@example.com")

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/v1/auth/forgot-password", json={"identifier": "user@example.com"})
            assert resp.status_code == 200
            # Data may be hidden depending on environment; ensure endpoint succeeds and sends email.
            # BackgroundTasks should send the email via DummyMail.
            assert sent == ["user@example.com"]
