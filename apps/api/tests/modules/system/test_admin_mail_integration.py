from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.common.email.service import EmailService
from src.common.email.template_runtime import EmailTemplateDisabledError
from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_platform_app
from src.models.system.email_template import EmailTemplateRecord
from src.models.system.setting import SettingRecord
from src.modules.platform_identity.http import get_current_platform_session
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

pytestmark = pytest.mark.integration


async def _platform_owner() -> SimpleNamespace:
    return SimpleNamespace(actor_id=uuid4(), is_instance_owner=True)


async def test_admin_mail_test_endpoint_respects_core_mail_enabled(
    prepared_db,
    integration_valkey_settings,
    monkeypatch,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_platform_app()
    app.dependency_overrides[get_current_platform_session] = _platform_owner
    transport = ASGITransport(app=app)

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

    monkeypatch.setattr("src.common.email.service.EmailService._get_fast_mail", _dummy_get_fast_mail)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        # mail disabled => endpoint should return 400 and not send
        await SettingRecord.create(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace="core",
            value={"mail": {"enabled": False}},
        )

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/platform-api/v1/communications/email/test", json={"recipient": "to@example.com"})
            assert resp.status_code == 400
            assert resp.json().get("error") == "MAIL_DISABLED"
            assert sent == []

        # enable mail => endpoint should send via DummyMail
        record = await SettingRecord.get(scope_type=SCOPE_TYPE_SYSTEM, scope_id=SYSTEM_SCOPE_ID, namespace="core")
        record.value = {"mail": {"enabled": True}}
        await record.save()

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/platform-api/v1/communications/email/test", json={"recipient": "to@example.com"})
            assert resp.status_code == 200
            out = resp.json()["data"]
            assert out["ok"] is True
            assert out["provider"] == "smtp"
            assert sent == ["to@example.com"]

            providers_resp = await client.get("/platform-api/v1/communications/email/providers")
            assert providers_resp.status_code == 200
            providers = providers_resp.json()["data"]
            smtp = next(item for item in providers if item["providerId"] == "smtp")
            assert smtp["lastTestStatus"] == "passed"
            assert smtp["lastTestMessage"] is None
            assert isinstance(smtp["lastTestedAt"], str)


async def test_email_service_template_gating_works(
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

    monkeypatch.setattr("src.common.email.service.EmailService._get_fast_mail", _dummy_get_fast_mail)

    settings = get_settings()
    app = create_platform_app()

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        # Template availability is controlled by the persisted template record.
        await SettingRecord.create(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace="core",
            value={"mail": {"enabled": True}},
        )
        welcome = await EmailTemplateRecord.get(key="welcome", locale="en-US")
        welcome.is_enabled = False
        await welcome.save(update_fields=["is_enabled"])

        # Ensure env flag doesn't accidentally short-circuit tests.
        settings.email.enabled = True
        service = EmailService(settings)

        with pytest.raises(EmailTemplateDisabledError, match="MAIL_TEMPLATE_DISABLED:welcome:en-US"):
            await service.send_welcome(recipient="to@example.com", username="tester", locale="en-US")
        assert sent == []

        await service.send_invitation(
            recipient="to@example.com",
            invite_url=None,
            invite_token="token123",
            expires_at=None,
            organization_name="Test Org",
            invited_by_user_id=None,
            locale="en-US",
        )
        assert sent == ["to@example.com"]


async def test_email_template_test_send_endpoint_uses_selected_persisted_version(
    prepared_db,
    integration_valkey_settings,
    monkeypatch,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings
    settings = get_settings()
    app = create_platform_app()
    app.dependency_overrides[get_current_platform_session] = _platform_owner
    transport = ASGITransport(app=app)
    sent: list[tuple[str, str]] = []

    class DummyMail:
        async def send_message(self, message, **kwargs):  # type: ignore[no-untyped-def]
            del kwargs
            sent.append((str(message.recipients[0].email), str(message.subject)))

    async def _dummy_get_fast_mail(self):  # type: ignore[no-untyped-def]
        return DummyMail()

    monkeypatch.setattr("src.common.email.service.EmailService._get_fast_mail", _dummy_get_fast_mail)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        await SettingRecord.create(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace="core",
            value={"mail": {"enabled": True}},
        )
        template = await EmailTemplateRecord.get(key="welcome", locale="en-US")

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/platform-api/v1/communications/email/templates/{template.id}/test-send",
                json={
                    "recipient": "to@example.com",
                    "variables": {"username": "Template operator"},
                },
            )

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["state"] == "accepted"
        assert data["provider"] == "smtp"
        assert data["messageId"] is None
        assert data["attempts"] == 1
        assert data["latencyMs"] >= 0
        assert sent == [("to@example.com", "Welcome to Arclayer")]
