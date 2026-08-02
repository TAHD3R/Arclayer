from __future__ import annotations

import pytest

from src.config import Settings
from src.core.exceptions import ServiceUnavailable
from src.modules.system.mail.profile_schema import MailCredentialWriteRequest
from src.modules.system.mail.profile_service import MailServiceProfileService


def test_mail_credential_request_never_dumps_secret() -> None:
    request = MailCredentialWriteRequest(
        expected_revision=0,
        idempotency_key="mail-service-secret-0001",
        secret="credential-value",
    )

    assert "secret" not in request.model_dump()


@pytest.mark.asyncio
async def test_external_mail_credential_write_fails_when_provider_port_is_missing() -> None:
    service = MailServiceProfileService(Settings())

    with pytest.raises(ServiceUnavailable) as exc:
        await service._configure_external_credentials(
            provider="postmark",
            secret="credential-value",
            username=None,
            rotate=False,
        )

    assert exc.value.error == "MAIL_PROVIDER_CREDENTIAL_PORT_UNAVAILABLE"
