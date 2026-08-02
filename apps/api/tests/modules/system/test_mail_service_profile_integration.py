from __future__ import annotations

import json
from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_platform_app
from src.models.system.setting import SettingRecord
from src.modules.platform_identity.http import get_current_platform_session
from src.settings.crypto import ensure_master_key
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

pytestmark = pytest.mark.integration


async def test_mail_service_profile_keeps_nested_credentials_write_only_and_recovers(
    prepared_db,
    integration_valkey_settings,
    monkeypatch,
    tmp_path,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings
    settings = get_settings()
    monkeypatch.setattr(settings.security, "master_key_path", tmp_path / "mail-service.key")
    ensure_master_key(settings.security.master_key_path)

    actor_id = uuid4()

    async def owner() -> SimpleNamespace:
        return SimpleNamespace(actor_id=actor_id, is_instance_owner=True)

    app = create_platform_app()
    app.dependency_overrides[get_current_platform_session] = owner
    transport = ASGITransport(app=app)
    sent: list[str] = []

    class DummyMail:
        async def send_message(self, message, **kwargs):  # type: ignore[no-untyped-def]
            del kwargs
            sent.append(str(message.recipients[0].email))

    async def dummy_get_fast_mail(self):  # type: ignore[no-untyped-def]
        return DummyMail()

    monkeypatch.setattr("src.common.email.service.EmailService._get_fast_mail", dummy_get_fast_mail)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await _configure_service(client)
            await _write_credentials(client)
            await _assert_profile_is_write_only(client)
            await _test_disable_recover_and_rotate(client, sent)


async def _configure_service(client: AsyncClient) -> None:
    payload = {
        "expectedRevision": 0,
        "idempotencyKey": "mail-service-configure-0001",
        "senderAddress": "noreply@example.com",
        "senderName": "Arclayer",
        "senderDomain": "example.com",
        "active": True,
        "smtp": {
            "server": "smtp.example.com",
            "port": 2525,
            "useCredentials": True,
            "starttls": False,
            "sslTls": False,
        },
    }
    configure = await client.put("/platform-api/v1/communications/email/service", json=payload)
    assert configure.status_code == 200
    assert configure.json()["data"]["revision"] == 1

    replay = await client.put("/platform-api/v1/communications/email/service", json=payload)
    assert replay.status_code == 200
    assert replay.json()["data"]["revision"] == 1


async def _write_credentials(client: AsyncClient) -> None:
    credentials = await client.put(
        "/platform-api/v1/communications/email/service/credentials",
        json={
            "expectedRevision": 1,
            "idempotencyKey": "mail-service-credential-0001",
            "secret": "initial-mail-secret",
            "username": "smtp-user",
        },
    )
    assert credentials.status_code == 200
    assert credentials.json()["data"] == {
        "provider": "smtp",
        "configured": True,
        "rotated": False,
        "revision": 2,
    }
    assert "initial-mail-secret" not in json.dumps(credentials.json())

    record = await SettingRecord.get(
        scope_type=SCOPE_TYPE_SYSTEM,
        scope_id=SYSTEM_SCOPE_ID,
        namespace="core",
    )
    password = record.value["mail"]["providers"]["smtp"]["password"]
    assert isinstance(password, str)
    assert password.startswith("enc:v1:")
    assert password != "initial-mail-secret"


async def _assert_profile_is_write_only(client: AsyncClient) -> None:
    profile = await client.get("/platform-api/v1/communications/email/service")
    assert profile.status_code == 200
    data = profile.json()["data"]
    assert data["credentialConfigured"] is True
    assert data["configured"] is True
    assert data["senderVerified"] is False
    assert data["reachable"] is False
    assert data["degraded"] is True
    assert "initial-mail-secret" not in json.dumps(data)
    assert "password" not in data


async def _test_disable_recover_and_rotate(client: AsyncClient, sent: list[str]) -> None:
    readiness = await client.post(
        "/platform-api/v1/communications/email/service/test",
        json={
            "recipient": "to@example.com",
            "expectedRevision": 2,
            "idempotencyKey": "mail-service-test-0001",
        },
    )
    assert readiness.status_code == 200
    readiness_data = readiness.json()["data"]
    assert readiness_data["state"] == "accepted"
    assert readiness_data["service"]["active"] is True
    assert readiness_data["service"]["senderVerified"] is True
    assert readiness_data["service"]["reachable"] is True
    assert sent == ["to@example.com"]

    disable = await client.post(
        "/platform-api/v1/communications/email/service/disable",
        json={"expectedRevision": 2, "idempotencyKey": "mail-service-disable-0001"},
    )
    assert disable.status_code == 200
    assert disable.json()["data"]["desiredActive"] is False
    assert disable.json()["data"]["active"] is False

    recover = await client.post(
        "/platform-api/v1/communications/email/service/recover",
        json={"expectedRevision": 3, "idempotencyKey": "mail-service-recover-0001"},
    )
    assert recover.status_code == 200
    assert recover.json()["data"]["active"] is True

    rotated = await client.post(
        "/platform-api/v1/communications/email/service/credentials/rotate",
        json={
            "expectedRevision": 4,
            "idempotencyKey": "mail-service-credential-rotate-0001",
            "secret": "rotated-mail-secret",
        },
    )
    assert rotated.status_code == 200
    assert rotated.json()["data"]["rotated"] is True
    assert "rotated-mail-secret" not in json.dumps(rotated.json())
