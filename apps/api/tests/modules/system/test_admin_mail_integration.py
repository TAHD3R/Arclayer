from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.common.email.service import EmailService
from apps.api.config import get_settings
from apps.api.core.database.orm import verify_db_ready
from apps.api.core.registry import create_app
from apps.api.modules.auth.deps import get_current_user_id
from apps.api.modules.system.models.setting import SettingRecord
from apps.api.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

pytestmark = pytest.mark.integration


async def _bootstrap_admin_user(app, *, org_name: str = "Test Org"):
    """
    Create an organization + an org owner user (v2 system scope gate).

    Returns (org_id, admin_user_id).
    """

    from apps.api.modules.auth.repository import UserRepository
    from apps.api.modules.auth.security import hash_password
    from apps.api.modules.organization.models.org_membership import OrgMembership
    from apps.api.modules.organization.repository import OrganizationRepository

    settings = get_settings()
    org_repo = OrganizationRepository()
    user_repo = UserRepository()

    org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name=org_name)

    admin = await user_repo.create_user(
        username=f"admin_{uuid4().hex}",
        email="admin@example.com",
        display_name="Admin",
        password_hash=hash_password("admin_password_123", settings.auth),
    )
    await OrgMembership.create(organization_id=org.id, user_id=admin.id, is_owner=True, status="active")

    async def _current_user_id():
        return admin.id

    app.dependency_overrides[get_current_user_id] = _current_user_id
    return org.id, admin.id


async def test_admin_mail_test_endpoint_respects_core_mail_enabled(
    prepared_db,
    integration_valkey_settings,
    monkeypatch,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
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

    monkeypatch.setattr("apps.api.common.email.service.EmailService._get_fast_mail", _dummy_get_fast_mail)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        org_id, _admin_user_id = await _bootstrap_admin_user(app)
        _ = org_id

        # mail disabled => endpoint should return 400 and not send
        await SettingRecord.create(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace="core",
            value={"mail": {"enabled": False}},
        )

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/v1/system/mail/test", json={"recipient": "to@example.com"})
            assert resp.status_code == 400
            assert resp.json().get("error") == "MAIL_DISABLED"
            assert sent == []

        # enable mail => endpoint should send via DummyMail
        record = await SettingRecord.get(scope_type=SCOPE_TYPE_SYSTEM, scope_id=SYSTEM_SCOPE_ID, namespace="core")
        record.value = {"mail": {"enabled": True}}
        await record.save()

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/v1/system/mail/test", json={"recipient": "to@example.com"})
            assert resp.status_code == 200
            out = resp.json()["data"]
            assert out["ok"] is True
            assert sent == ["to@example.com"]


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

    monkeypatch.setattr("apps.api.common.email.service.EmailService._get_fast_mail", _dummy_get_fast_mail)

    settings = get_settings()
    app = create_app()

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        # Configure core mail as enabled, but only allow registration_prompt (disable welcome_email).
        await SettingRecord.create(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace="core",
            value={
                "mail": {
                    "enabled": True,
                    "preferences": {"enabled_templates": ["registration_prompt"]},
                }
            },
        )

        # Ensure env flag doesn't accidentally short-circuit tests.
        settings.email.enabled = True
        service = EmailService(settings)

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
