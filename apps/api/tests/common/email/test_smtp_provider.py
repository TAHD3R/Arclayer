from __future__ import annotations

from pathlib import Path

from fastapi_mail import MessageType
from fastapi_mail.schemas import MultipartSubtypeEnum

from src.common.email.provider import EmailMessage
from src.common.email.providers.smtp import SmtpEmailProvider
from src.config import EmailSettings, Settings


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


def test_smtp_provider_omits_missing_template_folder() -> None:
    provider = SmtpEmailProvider(
        settings=Settings(email=EmailSettings(template_dir=Path("/tmp/arclayer-missing-mail-templates"))),
        config={
            "server": "smtp.example.com",
            "mail_from": "noreply@example.com",
            "use_credentials": False,
            "starttls": False,
            "ssl_tls": False,
        },
    )

    config = provider.build_connection_config()

    assert config.TEMPLATE_FOLDER is None


def test_smtp_provider_build_message_schema_keeps_html_template_subtype() -> None:
    schema = SmtpEmailProvider._build_message_schema(
        EmailMessage.single(
            recipient="user@example.com",
            subject="Security alert",
            text_body="Plain fallback",
            html_template="security_alert.html",
            plain_template="security_alert.txt",
            template_vars={"title": "Security alert"},
        )
    )

    assert schema.subtype == MessageType.html
    assert schema.alternative_body == "Plain fallback"
    assert schema.multipart_subtype == MultipartSubtypeEnum.alternative
