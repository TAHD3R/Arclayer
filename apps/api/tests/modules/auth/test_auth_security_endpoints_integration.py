from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.modules.auth.repository import EmailLoginCodeStore, UserRepository
from src.modules.auth.tokens.service import hash_password
from src.modules.auth.two_factor.totp import generate_totp_code
from src.settings.crypto import ensure_master_key

pytestmark = pytest.mark.integration


def _set_test_env(monkeypatch, *, base_dir: Path) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "0123456789abcdef0123456789abcdef")
    monkeypatch.setenv("SECURITY__MASTER_KEY_PATH", str(base_dir / "master.key"))
    get_settings.cache_clear()


async def _create_user(*, password: str):
    settings = get_settings()
    user_repo = UserRepository()
    return await user_repo.create_user(
        username=f"user_{uuid4().hex}",
        email=f"user_{uuid4().hex[:8]}@example.com",
        display_name="Security User",
        password_hash=hash_password(password, settings.auth),
    )


def _access_token(tokens: dict) -> str:
    return str(tokens.get("accessToken") or tokens.get("access_token") or "")


async def _login(client: AsyncClient, *, email: str, password: str, headers: dict[str, str] | None = None) -> dict:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json().get("data") or {}
    assert _access_token(payload)
    return payload


async def test_auth_security_endpoints_two_factor_flow(
    prepared_db,
    integration_valkey_settings,
    monkeypatch,
    tmp_path: Path,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings
    _set_test_env(monkeypatch, base_dir=tmp_path)

    settings = get_settings()
    ensure_master_key(Path(settings.security.master_key_path))
    user = await _create_user(password="pass1234")

    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            email_check = await client.post("/api/v1/auth/email-check", json={"email": user.email})
            assert email_check.status_code == 200, email_check.text
            assert (email_check.json().get("data") or {}).get("exists") is True

            missing_check = await client.post("/api/v1/auth/email-check", json={"email": "missing@example.com"})
            assert missing_check.status_code == 200, missing_check.text
            assert (missing_check.json().get("data") or {}).get("exists") is False

            tokens = await _login(client, email=user.email, password="pass1234")
            auth_headers = {"Authorization": f"Bearer {_access_token(tokens)}"}

            cap_before = await client.get("/api/v1/auth/2fa/capabilities", headers=auth_headers)
            assert cap_before.status_code == 200, cap_before.text
            cap_before_data = cap_before.json().get("data") or {}
            assert cap_before_data.get("enabled") is False
            assert cap_before_data.get("canSetup", cap_before_data.get("can_setup")) is True

            setup = await client.post(
                "/api/v1/auth/2fa/setup",
                json={"password": "pass1234"},
                headers=auth_headers,
            )
            assert setup.status_code == 200, setup.text
            setup_data = setup.json().get("data") or {}
            secret = str(setup_data.get("secret") or "")
            assert secret

            confirm = await client.post(
                "/api/v1/auth/2fa/confirm",
                json={"code": generate_totp_code(secret)},
                headers=auth_headers,
            )
            assert confirm.status_code == 200, confirm.text
            confirm_data = confirm.json().get("data") or {}
            backup_codes = confirm_data.get("backupCodes") or confirm_data.get("backup_codes") or []
            assert len(backup_codes) == 10

            status_enabled = await client.get("/api/v1/auth/2fa", headers=auth_headers)
            assert status_enabled.status_code == 200, status_enabled.text
            status_enabled_data = status_enabled.json().get("data") or {}
            assert status_enabled_data.get("enabled") is True
            assert (
                status_enabled_data.get("backupCodesRemaining", status_enabled_data.get("backup_codes_remaining")) == 10
            )

            challenged = await client.post(
                "/api/v1/auth/login",
                json={"email": user.email, "password": "pass1234"},
            )
            assert challenged.status_code == 401, challenged.text
            assert challenged.json().get("error") == "TWO_FACTOR_REQUIRED"
            challenge_meta = challenged.json().get("meta") or {}
            challenge_token = challenge_meta.get("two_factor_token") or challenge_meta.get("twoFactorToken")
            assert challenge_token

            login_2fa = await client.post(
                "/api/v1/auth/login/2fa",
                json={"twoFactorToken": challenge_token, "backupCode": backup_codes[0]},
            )
            assert login_2fa.status_code == 200, login_2fa.text
            second_headers = {"Authorization": f"Bearer {_access_token(login_2fa.json().get('data') or {})}"}

            regenerate = await client.post(
                "/api/v1/auth/2fa/backup-codes/regenerate",
                json={"backupCode": backup_codes[1]},
                headers=second_headers,
            )
            assert regenerate.status_code == 200, regenerate.text
            regenerate_data = regenerate.json().get("data") or {}
            regenerated_codes = regenerate_data.get("backupCodes") or regenerate_data.get("backup_codes") or []
            assert len(regenerated_codes) == 10

            disable = await client.post(
                "/api/v1/auth/2fa/disable",
                json={"backupCode": regenerated_codes[0]},
                headers=second_headers,
            )
            assert disable.status_code == 200, disable.text

            status_disabled = await client.get("/api/v1/auth/2fa", headers=second_headers)
            assert status_disabled.status_code == 200, status_disabled.text
            assert (status_disabled.json().get("data") or {}).get("enabled") is False


async def test_auth_email_code_login_flow(
    prepared_db,
    integration_valkey_settings,
    monkeypatch,
    tmp_path: Path,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings
    _set_test_env(monkeypatch, base_dir=tmp_path)

    sent: list[str] = []

    class DummyMail:
        async def send_message(self, message, **kwargs):  # type: ignore[no-untyped-def]
            recipients = getattr(message, "recipients", None)
            if recipients:
                sent.append(str(recipients[0].email))

    async def _dummy_get_fast_mail(self):  # type: ignore[no-untyped-def]
        return DummyMail()

    monkeypatch.setattr("src.common.email.service.EmailService._get_fast_mail", _dummy_get_fast_mail)

    settings = get_settings()
    ensure_master_key(Path(settings.security.master_key_path))
    user = await _create_user(password="pass1234")

    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            request_resp = await client.post(
                "/api/v1/auth/login/email-code/request",
                json={"email": user.email},
            )
            assert request_resp.status_code == 200, request_resp.text
            request_data = request_resp.json().get("data") or {}
            assert (request_data.get("retryAfter") or request_data.get("retry_after")) == 20
            assert sent == [user.email]

            store = EmailLoginCodeStore(app.state.valkey)
            record = await store.get(email=user.email)
            assert isinstance(record, dict)
            code = str(record.get("code") or "")
            assert code

            verify_resp = await client.post(
                "/api/v1/auth/login/email-code/verify",
                json={"email": user.email, "code": code},
            )
            assert verify_resp.status_code == 200, verify_resp.text
            payload = verify_resp.json().get("data") or {}
            assert _access_token(payload)


async def test_auth_sessions_endpoints_include_metadata_and_revoke_others(
    prepared_db,
    integration_valkey_settings,
    monkeypatch,
    tmp_path: Path,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings
    _set_test_env(monkeypatch, base_dir=tmp_path)

    settings = get_settings()
    ensure_master_key(Path(settings.security.master_key_path))
    user = await _create_user(password="pass1234")

    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await _login(
                client,
                email=user.email,
                password="pass1234",
                headers={
                    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4)",
                    "x-forwarded-for": "203.0.113.8",
                },
            )
            latest_tokens = await _login(
                client,
                email=user.email,
                password="pass1234",
                headers={
                    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/123.0.0.0",
                    "x-forwarded-for": "198.51.100.4",
                },
            )
            auth_headers = {"Authorization": f"Bearer {_access_token(latest_tokens)}"}

            sessions = await client.get("/api/v1/auth/sessions", headers=auth_headers)
            assert sessions.status_code == 200, sessions.text
            items = (sessions.json().get("data") or {}).get("items") or []
            assert len(items) == 2
            assert any(item.get("current") is True for item in items)
            current_session = next(item for item in items if item.get("current") is True)
            assert "deviceLabel" in current_session or "device_label" in current_session
            assert "authMethod" in current_session or "auth_method" in current_session

            revoked = await client.post("/api/v1/auth/sessions/revoke-others", headers=auth_headers)
            assert revoked.status_code == 200, revoked.text
            revoked_data = revoked.json().get("data") or {}
            assert (revoked_data.get("revokedCount") or revoked_data.get("revoked_count")) == 1

            sessions_after = await client.get("/api/v1/auth/sessions", headers=auth_headers)
            assert sessions_after.status_code == 200, sessions_after.text
            items_after = (sessions_after.json().get("data") or {}).get("items") or []
            assert len(items_after) == 1
            assert items_after[0].get("current") is True
