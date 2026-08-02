from __future__ import annotations

import pytest
from fastapi_mail import MessageType
from fastapi_mail.schemas import MultipartSubtypeEnum

from src.common.email.credentials import encrypt_mail_credential
from src.common.email.provider import EmailMessage
from src.common.email.providers.smtp import SmtpEmailProvider
from src.config import Settings
from src.settings.crypto import ensure_master_key


def test_smtp_provider_build_connection_config_uses_nested_provider_config() -> None:
    provider = SmtpEmailProvider(
        settings=Settings(),
        config={
            "providers": {
                "smtp": {
                    "server": "smtp.example.com",
                    "port": 2525,
                    "mail_from": "noreply@example.com",
                    "use_credentials": False,
                    "starttls": False,
                    "ssl_tls": False,
                }
            }
        },
    )

    config = provider.build_connection_config()

    assert config.MAIL_SERVER == "smtp.example.com"
    assert config.MAIL_PORT == 2525
    assert config.USE_CREDENTIALS is False


def test_smtp_provider_rejects_nested_configuration_without_port() -> None:
    provider = SmtpEmailProvider(
        settings=Settings(),
        config={
            "providers": {
                "smtp": {
                    "server": "smtp.example.com",
                    "mail_from": "noreply@example.com",
                    "use_credentials": False,
                }
            }
        },
    )

    with pytest.raises(ValueError, match="MAIL_SMTP_PORT_REQUIRED"):
        provider.build_connection_config()


def test_smtp_provider_decrypts_encrypted_nested_password(tmp_path) -> None:
    settings = Settings()
    settings.security.master_key_path = tmp_path / "mail.key"
    ensure_master_key(settings.security.master_key_path)
    secret = encrypt_mail_credential(
        settings=settings,
        provider_id="smtp",
        field="password",
        value="mail-password",
    )
    provider = SmtpEmailProvider(
        settings=settings,
        config={
            "providers": {
                "smtp": {
                    "server": "smtp.example.com",
                    "port": 2525,
                    "mail_from": "noreply@example.com",
                    "password": secret,
                    "use_credentials": True,
                    "starttls": False,
                    "ssl_tls": False,
                }
            }
        },
    )

    config = provider.build_connection_config()

    assert config.MAIL_PASSWORD.get_secret_value() == "mail-password"


def test_smtp_provider_build_message_schema_keeps_html_alternative() -> None:
    schema = SmtpEmailProvider._build_message_schema(
        EmailMessage.single(
            recipient="user@example.com",
            subject="Security alert",
            html_body="<p>Security alert</p>",
            text_body="Plain fallback",
        )
    )

    assert schema.subtype == MessageType.html
    assert schema.alternative_body == "Plain fallback"
    assert schema.multipart_subtype == MultipartSubtypeEnum.alternative
