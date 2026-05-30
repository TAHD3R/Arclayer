from __future__ import annotations

import inspect
import time
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import cast

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from fastapi_mail.schemas import MultipartSubtypeEnum
from pydantic import EmailStr, SecretStr, TypeAdapter, ValidationError

from src.common.email.helpers import default_template_dir, pick_bool, pick_int, pick_str, to_name_email
from src.common.email.provider import EmailMessage, EmailProvider, SendResult
from src.common.types.json_types import JsonObject
from src.config import Settings

_EMAIL_ADAPTER = TypeAdapter(EmailStr)


def _secret_from_value(value: object, fallback: SecretStr | None) -> SecretStr | None:
    if isinstance(value, SecretStr):
        return value
    if isinstance(value, str) and value.strip():
        return SecretStr(value)
    return fallback


class SmtpEmailProvider(EmailProvider):
    provider_id = "smtp"
    provider_label = "SMTP"

    def __init__(
        self,
        *,
        settings: Settings,
        config: JsonObject,
        fast_mail_factory: Callable[[], FastMail | Awaitable[FastMail]] | None = None,
    ) -> None:
        self.settings = settings
        self.config = config
        self._fast_mail_factory = fast_mail_factory

    async def is_available(self) -> bool:
        self.validate_config()
        return True

    def validate_config(self) -> None:
        _ = self.build_connection_config(self.settings, self.config)

    async def send(self, message: EmailMessage) -> SendResult:
        started = time.perf_counter()
        fm = await self._build_fast_mail()
        schema = self._build_message_schema(message)
        await fm.send_message(
            schema,
            html_template=message.html_template,
            plain_template=message.plain_template,
        )
        return SendResult(
            success=True,
            provider_id=self.provider_id,
            latency_ms=(time.perf_counter() - started) * 1000,
        )

    async def _build_fast_mail(self) -> FastMail:
        if self._fast_mail_factory is None:
            return FastMail(self.build_connection_config())
        value = self._fast_mail_factory()
        if inspect.isawaitable(value):
            return cast(FastMail, await value)
        return cast(FastMail, value)

    def build_connection_config(
        self,
        settings: Settings | None = None,
        config: JsonObject | None = None,
    ) -> ConnectionConfig:
        base = (settings or self.settings).email
        mail = config or self.config
        provider_config = mail.get("providers")
        smtp_config: JsonObject = {}
        if isinstance(provider_config, dict):
            providers = cast(JsonObject, provider_config)
            provider_value = providers.get("smtp")
            if isinstance(provider_value, dict):
                smtp_config = cast(JsonObject, provider_value)

        merged: JsonObject = {**mail, **smtp_config}
        server = pick_str(merged.get("server"), base.server)
        port = pick_int(merged.get("port"), base.port)
        username = pick_str(merged.get("username"), base.username or "")
        mail_from_raw = pick_str(merged.get("mail_from"), base.mail_from)
        mail_from_name = pick_str(merged.get("mail_from_name"), base.mail_from_name)
        starttls = pick_bool(merged.get("starttls"), base.starttls)
        ssl_tls = pick_bool(merged.get("ssl_tls"), base.ssl_tls)
        use_credentials = pick_bool(merged.get("use_credentials"), base.use_credentials)
        validate_certs = pick_bool(merged.get("validate_certs"), base.validate_certs)
        suppress_send = pick_bool(merged.get("suppress_send"), base.suppress_send)

        try:
            mail_from = _EMAIL_ADAPTER.validate_python(mail_from_raw)
        except ValidationError as exc:
            raise ValueError("invalid mail_from") from exc

        password_secret = _secret_from_value(merged.get("password"), base.password)

        configured_template_dir = base.template_dir or default_template_dir()
        template_dir: Path | None = configured_template_dir if configured_template_dir.is_dir() else None
        return ConnectionConfig(
            MAIL_USERNAME=username if use_credentials else "",
            MAIL_PASSWORD=(password_secret if use_credentials and password_secret is not None else SecretStr("")),
            MAIL_FROM=mail_from,
            MAIL_FROM_NAME=mail_from_name,
            MAIL_PORT=port,
            MAIL_SERVER=server,
            MAIL_STARTTLS=starttls,
            MAIL_SSL_TLS=ssl_tls,
            USE_CREDENTIALS=use_credentials,
            VALIDATE_CERTS=validate_certs,
            SUPPRESS_SEND=suppress_send,
            TEMPLATE_FOLDER=template_dir,
        )

    @staticmethod
    def _build_message_schema(message: EmailMessage) -> MessageSchema:
        has_html = bool(message.html_body or message.html_template)
        body = message.html_body or message.text_body or ""
        subtype = MessageType.html if has_html else MessageType.plain
        alternative_body: str | None = None
        multipart_subtype = MultipartSubtypeEnum.mixed
        if message.html_body and message.text_body:
            alternative_body = message.text_body
            multipart_subtype = MultipartSubtypeEnum.alternative
        if message.html_template and message.text_body:
            alternative_body = message.text_body
            multipart_subtype = MultipartSubtypeEnum.alternative
        return MessageSchema(
            subject=message.subject,
            recipients=[to_name_email(recipient) for recipient in message.to],
            body=body,
            subtype=subtype,
            template_body=message.template_vars or None,
            alternative_body=alternative_body,
            multipart_subtype=multipart_subtype,
        )
