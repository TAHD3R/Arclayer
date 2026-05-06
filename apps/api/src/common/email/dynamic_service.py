from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import cast

from fastapi_mail import FastMail
from pydantic import BaseModel, ConfigDict

from src.common.email.helpers import pick_int, pick_str, raise_if_fatal
from src.common.email.provider import EmailMessage, EmailProvider, SendResult
from src.common.email.providers import create_email_provider, supported_email_provider_ids
from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.logging import get_logger

DEFAULT_EMAIL_PROVIDER_ID = "smtp"
DEFAULT_RETRY_ATTEMPTS = 3
DEFAULT_RETRY_BACKOFF_SECONDS = (1, 2, 4)


class ProviderInfo(BaseModel):
    model_config = ConfigDict(frozen=True)
    provider_id: str
    label: str
    active: bool
    configured: bool
    available: bool
    error: str | None = None


class DynamicMailService:
    def __init__(
        self,
        *,
        settings: Settings,
        config: JsonObject,
        smtp_fast_mail_factory: Callable[[], FastMail | Awaitable[FastMail]] | None = None,
        providers: dict[str, EmailProvider] | None = None,
        sleep: Callable[[float], Awaitable[object]] | None = None,
    ) -> None:
        self.settings = settings
        self.config = config
        self.logger = get_logger(__name__)
        self._smtp_fast_mail_factory = smtp_fast_mail_factory
        self._providers = providers
        self._sleep = sleep or asyncio.sleep

    async def send(self, message: EmailMessage) -> SendResult:
        last_exc: BaseException | None = None
        for provider_id in self._provider_chain():
            provider = self._get_provider(provider_id)
            try:
                result = await self._send_with_retry(provider, message)
                self.logger.info(
                    "Email sent",
                    provider_id=provider.provider_id,
                    template_id=message.template_id,
                    recipients=len(message.to),
                    latency_ms=result.latency_ms,
                    attempts=result.attempts,
                )
                return result
            except BaseException as exc:
                raise_if_fatal(exc)
                last_exc = exc
                self.logger.warning(
                    "Email provider failed",
                    provider_id=provider.provider_id,
                    template_id=message.template_id,
                    error=str(exc),
                )
        if last_exc is None:
            raise ValueError("NO_EMAIL_PROVIDER_CONFIGURED")
        raise last_exc

    async def switch_provider(self, provider_id: str) -> None:
        normalized = self._normalize_provider_id(provider_id)
        self._get_provider(normalized).validate_config()
        self.config["provider"] = normalized

    async def get_available_providers(self) -> list[ProviderInfo]:
        active_provider_id = self.active_provider_id
        infos: list[ProviderInfo] = []
        for provider_id in supported_email_provider_ids():
            provider = self._get_provider(provider_id)
            try:
                await provider.is_available()
                infos.append(
                    ProviderInfo(
                        provider_id=provider.provider_id,
                        label=provider.provider_label,
                        active=provider.provider_id == active_provider_id,
                        configured=True,
                        available=True,
                    )
                )
            except BaseException as exc:
                raise_if_fatal(exc)
                infos.append(
                    ProviderInfo(
                        provider_id=provider.provider_id,
                        label=provider.provider_label,
                        active=provider.provider_id == active_provider_id,
                        configured=False,
                        available=False,
                        error=str(exc),
                    )
                )
        return infos

    @property
    def active_provider_id(self) -> str:
        configured = self.config.get("provider")
        fallback = getattr(self.settings.email, "default_provider", DEFAULT_EMAIL_PROVIDER_ID)
        return self._normalize_provider_id(pick_str(configured, fallback))

    async def _send_with_retry(self, provider: EmailProvider, message: EmailMessage) -> SendResult:
        max_attempts = self._max_attempts()
        backoff = self._backoff_seconds()
        last_exc: BaseException | None = None
        for attempt in range(1, max_attempts + 1):
            try:
                result = await provider.send(message)
                return SendResult(
                    success=result.success,
                    provider_id=result.provider_id,
                    message_id=result.message_id,
                    error=result.error,
                    latency_ms=result.latency_ms,
                    attempts=attempt,
                )
            except BaseException as exc:
                raise_if_fatal(exc)
                last_exc = exc
                if attempt >= max_attempts:
                    break
                await self._sleep(float(backoff[min(attempt - 1, len(backoff) - 1)]))
        if last_exc is None:
            raise RuntimeError("EMAIL_SEND_FAILED")
        raise last_exc

    def _provider_chain(self) -> list[str]:
        chain = [self.active_provider_id]
        configured = self.config.get("fallback_chain")
        env_chain = getattr(self.settings.email, "fallback_chain", [])
        raw_chain = configured if isinstance(configured, list) else env_chain
        for item in raw_chain:
            if not isinstance(item, str):
                continue
            provider_id = self._normalize_provider_id(item)
            if provider_id not in chain:
                chain.append(provider_id)
        return chain

    def _max_attempts(self) -> int:
        retry = self.config.get("retry")
        if isinstance(retry, dict):
            retry_config = cast(JsonObject, retry)
            return max(pick_int(retry_config.get("max_attempts"), DEFAULT_RETRY_ATTEMPTS), 1)
        return max(getattr(self.settings.email, "retry_max_attempts", DEFAULT_RETRY_ATTEMPTS), 1)

    def _backoff_seconds(self) -> tuple[int, ...]:
        retry = self.config.get("retry")
        retry_config = cast(JsonObject, retry) if isinstance(retry, dict) else {}
        raw = retry_config.get("backoff_seconds")
        if isinstance(raw, list):
            values = tuple(max(int(item), 0) for item in raw if isinstance(item, int))
            if values:
                return values
        return DEFAULT_RETRY_BACKOFF_SECONDS

    def _get_provider(self, provider_id: str) -> EmailProvider:
        normalized = self._normalize_provider_id(provider_id)
        if self._providers is not None and normalized in self._providers:
            return self._providers[normalized]
        return create_email_provider(
            normalized,
            settings=self.settings,
            config=self.config,
            smtp_fast_mail_factory=self._smtp_fast_mail_factory,
        )

    @staticmethod
    def _normalize_provider_id(provider_id: str) -> str:
        normalized = provider_id.strip().lower()
        if normalized not in supported_email_provider_ids():
            raise ValueError(f"Unsupported email provider: {provider_id}")
        return normalized
