from __future__ import annotations

from typing import cast

import pytest
from fastapi_mail.errors import ConnectionErrors

from src.common.email.service import EmailService
from src.config import Settings
from src.core.exceptions import BadRequest, ServiceUnavailable
from src.modules.system.mail.service import AdminMailService
from src.settings.core_schema import CORE_SETTINGS_SCHEMA
from src.settings.validation import validate_config_schema


class _RaisingEmailService:
    def __init__(self, exc: Exception) -> None:
        self.exc = exc

    async def send_test_email(self, *, recipient: str, locale: str | None = None) -> None:
        _ = recipient
        _ = locale
        raise self.exc


class _ConfigOverrideEmailService(EmailService):
    def __init__(self, settings: Settings, config: dict[str, object]) -> None:
        super().__init__(settings)
        self._config = config

    async def _get_core_mail_config(self) -> dict:
        return self._config


@pytest.mark.asyncio
async def test_email_service_build_connection_config_uses_core_use_credentials_override() -> None:
    service = _ConfigOverrideEmailService(
        Settings(),
        {
            "enabled": True,
            "server": "localhost",
            "port": 1025,
            "mail_from": "noreply@example.com",
            "mail_from_name": "Arclayer",
            "username": "ignored",
            "password": "ignored-secret",
            "use_credentials": False,
            "starttls": False,
            "ssl_tls": False,
        },
    )

    config = await service._build_connection_config()

    assert config.USE_CREDENTIALS is False


def test_validate_config_schema_rejects_conflicting_mail_transport_modes() -> None:
    with pytest.raises(BadRequest) as exc:
        validate_config_schema(
            CORE_SETTINGS_SCHEMA,
            {
                "mail": {
                    "starttls": True,
                    "ssl_tls": True,
                }
            },
        )

    assert exc.value.error == "MAIL_TRANSPORT_CONFLICT"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("message", "expected_error"),
    [
        (
            "Exception raised The SMTP AUTH extension is not supported by this server. "
            "Try connecting via TLS (or STARTTLS)., check your credentials or email service configuration",
            "MAIL_AUTH_NOT_SUPPORTED",
        ),
        (
            "Exception raised SMTP STARTTLS extension not supported by server., "
            "check your credentials or email service configuration",
            "MAIL_STARTTLS_NOT_SUPPORTED",
        ),
        (
            "Exception raised The start_tls and use_tls options are not compatible., "
            "check your credentials or email service configuration",
            "MAIL_TRANSPORT_CONFLICT",
        ),
    ],
)
async def test_admin_mail_service_maps_known_fastapi_mail_config_errors_to_bad_request(
    message: str,
    expected_error: str,
) -> None:
    service = AdminMailService(Settings())
    service.email_service = cast(EmailService, _RaisingEmailService(ConnectionErrors(message)))

    with pytest.raises(BadRequest) as exc:
        await service.send_test_email(recipient="to@example.com")

    assert exc.value.error == expected_error


@pytest.mark.asyncio
async def test_admin_mail_service_maps_unknown_fastapi_mail_errors_to_service_unavailable() -> None:
    service = AdminMailService(Settings())
    service.email_service = cast(
        EmailService,
        _RaisingEmailService(
            ConnectionErrors(
                "Exception raised [Errno 111] Connection refused, check your credentials or email service configuration"
            )
        ),
    )

    with pytest.raises(ServiceUnavailable) as exc:
        await service.send_test_email(recipient="to@example.com")

    assert exc.value.error == "MAIL_SEND_FAILED"
