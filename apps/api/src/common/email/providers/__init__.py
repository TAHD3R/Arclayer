from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi_mail import FastMail

from src.common.email.provider import EmailProvider
from src.common.email.providers.smtp import SmtpEmailProvider
from src.common.types.json_types import JsonObject
from src.config import Settings

BUILT_IN_EMAIL_PROVIDER_IDS = ("smtp",)


def create_builtin_email_provider(
    provider_id: str,
    *,
    settings: Settings,
    config: JsonObject,
    smtp_fast_mail_factory: Callable[[], FastMail | Awaitable[FastMail]] | None = None,
) -> EmailProvider:
    normalized = provider_id.strip().lower()
    if normalized == "smtp":
        return SmtpEmailProvider(settings=settings, config=config, fast_mail_factory=smtp_fast_mail_factory)
    raise ValueError(f"Unsupported built-in email provider: {provider_id}")
