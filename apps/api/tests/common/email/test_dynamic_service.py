from __future__ import annotations

import pytest

from src.common.email.dynamic_service import DynamicMailService
from src.common.email.provider import EmailMessage, EmailProvider, SendResult
from src.common.types.json_types import JsonObject
from src.config import Settings


class RecordingProvider(EmailProvider):
    provider_label = "Recording"

    def __init__(self, provider_id: str, failures: int = 0) -> None:
        self.provider_id = provider_id
        self.failures = failures
        self.calls = 0

    async def is_available(self) -> bool:
        return True

    def validate_config(self) -> None:
        return None

    async def send(self, message: EmailMessage) -> SendResult:
        _ = message
        self.calls += 1
        if self.calls <= self.failures:
            raise RuntimeError(f"{self.provider_id}_failed")
        return SendResult(success=True, provider_id=self.provider_id)


@pytest.mark.asyncio
async def test_dynamic_mail_service_retries_active_provider() -> None:
    provider = RecordingProvider("smtp", failures=2)
    sleeps: list[float] = []

    async def sleep(seconds: float) -> None:
        sleeps.append(seconds)

    service = DynamicMailService(
        settings=Settings(),
        config={"provider": "smtp", "retry": {"max_attempts": 3, "backoff_seconds": [0, 0]}},
        providers={"smtp": provider},
        sleep=sleep,
    )

    result = await service.send(EmailMessage.single(recipient="to@example.com", subject="Hello", text_body="Body"))

    assert result.provider_id == "smtp"
    assert result.attempts == 3
    assert provider.calls == 3
    assert sleeps == [0.0, 0.0]


@pytest.mark.asyncio
async def test_dynamic_mail_service_uses_fallback_chain_after_provider_failure() -> None:
    smtp = RecordingProvider("smtp", failures=1)
    resend = RecordingProvider("resend")

    service = DynamicMailService(
        settings=Settings(),
        config={
            "provider": "smtp",
            "fallback_chain": ["resend"],
            "retry": {"max_attempts": 1, "backoff_seconds": [0]},
        },
        providers={"smtp": smtp, "resend": resend},
    )

    result = await service.send(EmailMessage.single(recipient="to@example.com", subject="Hello", text_body="Body"))

    assert result.provider_id == "resend"
    assert smtp.calls == 1
    assert resend.calls == 1


@pytest.mark.asyncio
async def test_dynamic_mail_service_switch_provider_updates_runtime_config() -> None:
    smtp = RecordingProvider("smtp")
    resend = RecordingProvider("resend")
    config: JsonObject = {"provider": "smtp"}
    service = DynamicMailService(
        settings=Settings(),
        config=config,
        providers={"smtp": smtp, "resend": resend},
    )

    await service.switch_provider("resend")

    assert config["provider"] == "resend"
    assert service.active_provider_id == "resend"
