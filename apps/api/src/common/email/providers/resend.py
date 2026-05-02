from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any, cast

import httpx

from src.common.email.helpers import pick_str
from src.common.email.provider import EmailMessage, EmailProvider, SendResult
from src.config import Settings


class ResendEmailProvider(EmailProvider):
    provider_id = "resend"
    provider_label = "Resend"

    def __init__(
        self,
        *,
        settings: Settings,
        config: dict[str, object],
        http_client_factory: Callable[[], httpx.AsyncClient] | None = None,
    ) -> None:
        self.settings = settings
        self.config = config
        self._http_client_factory = http_client_factory

    async def is_available(self) -> bool:
        self.validate_config()
        return True

    def validate_config(self) -> None:
        api_key = self._api_key()
        if not api_key:
            raise ValueError("RESEND_API_KEY_REQUIRED")

    async def send(self, message: EmailMessage) -> SendResult:
        self.validate_config()
        started = time.perf_counter()
        payload: dict[str, Any] = {
            "from": self._from_address(),
            "to": list(message.to),
            "subject": message.subject,
        }
        if message.html_body:
            payload["html"] = message.html_body
        if message.text_body:
            payload["text"] = message.text_body
        if message.reply_to:
            payload["reply_to"] = message.reply_to

        client = self._http_client_factory() if self._http_client_factory else httpx.AsyncClient(timeout=15.0)
        async with client:
            response = await client.post(
                self._api_url(),
                json=payload,
                headers={"Authorization": f"Bearer {self._api_key()}"},
            )
            response.raise_for_status()
            body = response.json()

        message_id = body.get("id") if isinstance(body, dict) else None
        return SendResult(
            success=True,
            provider_id=self.provider_id,
            message_id=str(message_id) if message_id else None,
            latency_ms=(time.perf_counter() - started) * 1000,
        )

    def _provider_config(self) -> dict[str, object]:
        providers = self.config.get("providers")
        if isinstance(providers, dict):
            provider_value = cast(dict[str, object], providers).get("resend")
            if isinstance(provider_value, dict):
                return cast(dict[str, object], provider_value)
        return self.config

    def _api_key(self) -> str:
        config = self._provider_config()
        value = config.get("api_key")
        if isinstance(value, str) and value.strip():
            return value.strip()
        return getattr(self.settings.email, "resend_api_key", "") or ""

    def _api_url(self) -> str:
        return pick_str(self._provider_config().get("api_url"), "https://api.resend.com/emails")

    def _from_address(self) -> str:
        config = self._provider_config()
        mail_from = pick_str(config.get("mail_from"), self.settings.email.mail_from)
        mail_from_name = pick_str(config.get("mail_from_name"), self.settings.email.mail_from_name)
        return f"{mail_from_name} <{mail_from}>" if mail_from_name else mail_from
