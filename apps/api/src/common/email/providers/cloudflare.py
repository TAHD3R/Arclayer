from __future__ import annotations

import time
from collections.abc import Callable
from typing import cast

import httpx

from src.common.email.helpers import pick_str
from src.common.email.provider import EmailMessage, EmailProvider, SendResult
from src.common.types.json_types import JsonObject, JsonValue
from src.config import Settings


class CloudflareEmailProvider(EmailProvider):
    provider_id = "cloudflare"
    provider_label = "Cloudflare"

    def __init__(
        self,
        *,
        settings: Settings,
        config: JsonObject,
        http_client_factory: Callable[[], httpx.AsyncClient] | None = None,
    ) -> None:
        self.settings = settings
        self.config = config
        self._http_client_factory = http_client_factory

    async def is_available(self) -> bool:
        self.validate_config()
        return True

    def validate_config(self) -> None:
        config = self._provider_config()
        token = config.get("api_token") or getattr(self.settings.email, "cloudflare_api_token", "")
        if not isinstance(token, str) or not token.strip():
            raise ValueError("CLOUDFLARE_API_TOKEN_REQUIRED")

    async def send(self, message: EmailMessage) -> SendResult:
        self.validate_config()
        started = time.perf_counter()
        config = self._provider_config()
        token = str(config.get("api_token") or getattr(self.settings.email, "cloudflare_api_token", "")).strip()
        mail_from = pick_str(config.get("mail_from"), self.settings.email.mail_from)
        mail_from_name = pick_str(config.get("mail_from_name"), self.settings.email.mail_from_name)
        content: list[JsonValue] = []
        payload: JsonObject = {
            "personalizations": [{"to": [{"email": recipient} for recipient in message.to]}],
            "from": {"email": mail_from, "name": mail_from_name},
            "subject": message.subject,
            "content": content,
        }
        if message.text_body:
            content.append({"type": "text/plain", "value": message.text_body})
        if message.html_body:
            content.append({"type": "text/html", "value": message.html_body})

        client = self._http_client_factory() if self._http_client_factory else httpx.AsyncClient(timeout=15.0)
        async with client:
            response = await client.post(
                pick_str(config.get("api_url"), "https://api.mailchannels.net/tx/v1/send"),
                json=payload,
                headers={"Authorization": f"Bearer {token}"},
            )
            response.raise_for_status()

        return SendResult(
            success=True,
            provider_id=self.provider_id,
            latency_ms=(time.perf_counter() - started) * 1000,
        )

    def _provider_config(self) -> JsonObject:
        providers = self.config.get("providers")
        if isinstance(providers, dict):
            provider_value = cast(JsonObject, providers).get("cloudflare")
            if isinstance(provider_value, dict):
                return cast(JsonObject, provider_value)
        return self.config
