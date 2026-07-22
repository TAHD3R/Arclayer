"""Official Resend, Cloudflare MailChannels, and Amazon SES Connectors."""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any, cast

import httpx

from src.common.email.connector import EmailConnector
from src.common.email.helpers import pick_str
from src.common.email.provider import EmailMessage, EmailProvider, SendResult
from src.common.types.json_types import JsonObject, JsonValue
from src.config import Settings
from src.core.connectors import (
    ConnectorAdminMetadata,
    ConnectorDefinition,
    ConnectorKind,
    ConnectorTrustLevel,
)
from src.core.registries import PluginRegistry

_EXTENSION_NAME = "arclayer-email"


def _provider_config(config: JsonObject, provider_id: str) -> JsonObject:
    providers = config.get("providers")
    if isinstance(providers, dict):
        provider_value = cast(JsonObject, providers).get(provider_id)
        if isinstance(provider_value, dict):
            return cast(JsonObject, provider_value)
    return config


class ResendEmailProvider(EmailProvider):
    provider_id = "resend"
    provider_label = "Resend"

    def __init__(self, *, settings: Settings, config: JsonObject) -> None:
        self.settings = settings
        self.config = config

    async def is_available(self) -> bool:
        self.validate_config()
        return True

    def validate_config(self) -> None:
        if not self._api_key():
            raise ValueError("RESEND_API_KEY_REQUIRED")

    async def send(self, message: EmailMessage) -> SendResult:
        self.validate_config()
        started = time.perf_counter()
        payload: JsonObject = {
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
        async with httpx.AsyncClient(timeout=15.0) as client:
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

    def _api_key(self) -> str:
        value = _provider_config(self.config, self.provider_id).get("api_key")
        if isinstance(value, str) and value.strip():
            return value.strip()
        return ""

    def _api_url(self) -> str:
        return pick_str(
            _provider_config(self.config, self.provider_id).get("api_url"),
            "https://api.resend.com/emails",
        )

    def _from_address(self) -> str:
        config = _provider_config(self.config, self.provider_id)
        mail_from = pick_str(config.get("mail_from"), self.settings.email.mail_from)
        mail_from_name = pick_str(config.get("mail_from_name"), self.settings.email.mail_from_name)
        return f"{mail_from_name} <{mail_from}>" if mail_from_name else mail_from


class CloudflareEmailProvider(EmailProvider):
    provider_id = "cloudflare"
    provider_label = "Cloudflare"

    def __init__(self, *, settings: Settings, config: JsonObject) -> None:
        self.settings = settings
        self.config = config

    async def is_available(self) -> bool:
        self.validate_config()
        return True

    def validate_config(self) -> None:
        config = _provider_config(self.config, self.provider_id)
        token = config.get("api_token")
        if not isinstance(token, str) or not token.strip():
            raise ValueError("CLOUDFLARE_API_TOKEN_REQUIRED")

    async def send(self, message: EmailMessage) -> SendResult:
        self.validate_config()
        started = time.perf_counter()
        config = _provider_config(self.config, self.provider_id)
        token = str(config.get("api_token") or "").strip()
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
        async with httpx.AsyncClient(timeout=15.0) as client:
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


class SesEmailProvider(EmailProvider):
    provider_id = "ses"
    provider_label = "Amazon SES"

    def __init__(self, *, settings: Settings, config: JsonObject) -> None:
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
        response = self._client().send_email(**self._payload(message))
        message_id = response.get("MessageId") if isinstance(response, dict) else None
        return SendResult(
            success=True,
            provider_id=self.provider_id,
            message_id=str(message_id) if message_id else None,
            latency_ms=(time.perf_counter() - started) * 1000,
        )

    def _region(self) -> str:
        value = _provider_config(self.config, self.provider_id).get("region")
        region = value.strip() if isinstance(value, str) else ""
        if not region:
            raise ValueError("SES_REGION_REQUIRED")
        return region

    def _client(self) -> Any:
        import boto3

        return boto3.client("sesv2", region_name=self._region())

    def _payload(self, message: EmailMessage) -> JsonObject:
        config = _provider_config(self.config, self.provider_id)
        mail_from = pick_str(config.get("mail_from"), self.settings.email.mail_from)
        mail_from_name = pick_str(config.get("mail_from_name"), self.settings.email.mail_from_name)
        body: JsonObject = {}
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


class OfficialEmailConnector(EmailConnector):
    def __init__(
        self,
        *,
        definition: ConnectorDefinition,
        provider_id: str,
        provider_label: str,
        provider_factory: Callable[..., EmailProvider],
    ) -> None:
        self.definition = definition
        self.provider_id = provider_id
        self.provider_label = provider_label
        self._provider_factory = provider_factory

    def create_provider(self, *, settings: Settings, config: JsonObject) -> EmailProvider:
        return self._provider_factory(settings=settings, config=config)


def _connector(
    *,
    provider_id: str,
    provider_label: str,
    provider_factory: Callable[..., EmailProvider],
    config_schema: JsonObject,
    secret_schema: JsonObject,
) -> OfficialEmailConnector:
    key = f"email.{provider_id}"
    return OfficialEmailConnector(
        definition=ConnectorDefinition(
            key=key,
            kind=ConnectorKind.EMAIL,
            version="1.0.0",
            trust_level=ConnectorTrustLevel.OFFICIAL,
            capabilities=("send", "health_check"),
            config_schema=config_schema,
            secret_schema=secret_schema,
            health_contract=("configuration",),
            admin=ConnectorAdminMetadata(
                label_key=f"settings:SETTINGS_MESSAGING_MAIL_PROVIDER_{provider_id.upper()}",
                description_key=f"settings:SETTINGS_MESSAGING_MAIL_PROVIDER_{provider_id.upper()}_DESC",
                settings_section="mail",
                icon_key=provider_id,
            ),
        ),
        provider_id=provider_id,
        provider_label=provider_label,
        provider_factory=provider_factory,
    )


def _sender_schema() -> JsonObject:
    return {
        "mail_from": {
            "type": "string",
            "format": "email",
            "title": "settings:SETTINGS_MESSAGING_MAIL_FROM",
            "default": "noreply@example.com",
        },
        "mail_from_name": {
            "type": "string",
            "title": "settings:SETTINGS_MESSAGING_MAIL_FROM_NAME",
            "default": "Arclayer",
        },
    }


_CONNECTORS = (
    _connector(
        provider_id="resend",
        provider_label="Resend",
        provider_factory=ResendEmailProvider,
        config_schema={
            **_sender_schema(),
            "api_url": {
                "type": "string",
                "format": "uri",
                "title": "settings:SETTINGS_MESSAGING_MAIL_RESEND_API_URL",
                "default": "https://api.resend.com/emails",
            },
        },
        secret_schema={
            "api_key": {
                "type": "string",
                "title": "settings:SETTINGS_MESSAGING_MAIL_RESEND_API_KEY",
                "x-required": True,
            }
        },
    ),
    _connector(
        provider_id="cloudflare",
        provider_label="Cloudflare",
        provider_factory=CloudflareEmailProvider,
        config_schema={
            **_sender_schema(),
            "api_url": {
                "type": "string",
                "format": "uri",
                "title": "settings:SETTINGS_MESSAGING_MAIL_CLOUDFLARE_API_URL",
                "default": "https://api.mailchannels.net/tx/v1/send",
            },
        },
        secret_schema={
            "api_token": {
                "type": "string",
                "title": "settings:SETTINGS_MESSAGING_MAIL_CLOUDFLARE_API_TOKEN",
                "x-required": True,
            }
        },
    ),
    _connector(
        provider_id="ses",
        provider_label="Amazon SES",
        provider_factory=SesEmailProvider,
        config_schema={
            **_sender_schema(),
            "region": {
                "type": "string",
                "title": "settings:SETTINGS_MESSAGING_MAIL_SES_REGION",
                "placeholder": "us-east-1",
                "x-required": True,
            },
        },
        secret_schema={},
    ),
)


class OfficialEmailExtension:
    name = _EXTENSION_NAME

    def arclayer_register(self, registry: PluginRegistry) -> None:
        for connector in _CONNECTORS:
            registry.connectors.register(
                extension=self.name,
                definition=connector.definition,
                factory=lambda value=connector: value,
            )


def create_plugin() -> OfficialEmailExtension:
    return OfficialEmailExtension()
