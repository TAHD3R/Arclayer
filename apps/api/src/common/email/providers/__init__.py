from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi_mail import FastMail

from src.common.email.provider import EmailProvider
from src.common.email.providers.cloudflare import CloudflareEmailProvider
from src.common.email.providers.resend import ResendEmailProvider
from src.common.email.providers.ses import SesEmailProvider
from src.common.email.providers.smtp import SmtpEmailProvider
from src.config import Settings

ProviderFactory = Callable[[Settings, dict[str, object], Callable[[], object] | None], EmailProvider]


def create_email_provider(
    provider_id: str,
    *,
    settings: Settings,
    config: dict[str, object],
    smtp_fast_mail_factory: Callable[[], FastMail | Awaitable[FastMail]] | None = None,
) -> EmailProvider:
    normalized = provider_id.strip().lower()
    if normalized == "smtp":
        return SmtpEmailProvider(settings=settings, config=config, fast_mail_factory=smtp_fast_mail_factory)
    if normalized == "resend":
        return ResendEmailProvider(settings=settings, config=config)
    if normalized == "cloudflare":
        return CloudflareEmailProvider(settings=settings, config=config)
    if normalized == "ses":
        return SesEmailProvider(settings=settings, config=config)
    raise ValueError(f"Unsupported email provider: {provider_id}")


def supported_email_provider_ids() -> tuple[str, ...]:
    return ("smtp", "resend", "cloudflare", "ses")
