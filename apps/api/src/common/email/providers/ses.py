from __future__ import annotations

import time
from typing import Any, cast

from src.common.email.helpers import pick_str
from src.common.email.provider import EmailMessage, EmailProvider, SendResult
from src.config import Settings


class SesEmailProvider(EmailProvider):
    provider_id = "ses"
    provider_label = "Amazon SES"

    def __init__(self, *, settings: Settings, config: dict[str, object]) -> None:
        self.settings = settings
        self.config = config

    async def is_available(self) -> bool:
        self.validate_config()
        return True

    def validate_config(self) -> None:
        _ = self._region()

    async def send(self, message: EmailMessage) -> SendResult:
        self.validate_config()
        started = time.perf_counter()
        client = self._client()
        response = client.send_email(**self._payload(message))
        message_id = response.get("MessageId") if isinstance(response, dict) else None
        return SendResult(
            success=True,
            provider_id=self.provider_id,
            message_id=str(message_id) if message_id else None,
            latency_ms=(time.perf_counter() - started) * 1000,
        )

    def _provider_config(self) -> dict[str, object]:
        providers = self.config.get("providers")
        if isinstance(providers, dict):
            provider_value = cast(dict[str, object], providers).get("ses")
            if isinstance(provider_value, dict):
                return cast(dict[str, object], provider_value)
        return self.config

    def _region(self) -> str:
        value = self._provider_config().get("region")
        region = value if isinstance(value, str) and value.strip() else getattr(self.settings.email, "ses_region", "")
        if not region:
            raise ValueError("SES_REGION_REQUIRED")
        return region

    def _client(self) -> Any:
        import boto3

        return boto3.client("sesv2", region_name=self._region())

    def _payload(self, message: EmailMessage) -> dict[str, Any]:
        config = self._provider_config()
        mail_from = pick_str(config.get("mail_from"), self.settings.email.mail_from)
        mail_from_name = pick_str(config.get("mail_from_name"), self.settings.email.mail_from_name)
        body: dict[str, Any] = {}
        if message.text_body:
            body["Text"] = {"Data": message.text_body, "Charset": "UTF-8"}
        if message.html_body:
            body["Html"] = {"Data": message.html_body, "Charset": "UTF-8"}
        return {
            "FromEmailAddress": f"{mail_from_name} <{mail_from}>" if mail_from_name else mail_from,
            "Destination": {"ToAddresses": list(message.to)},
            "Content": {
                "Simple": {
                    "Subject": {"Data": message.subject, "Charset": "UTF-8"},
                    "Body": body,
                }
            },
        }
