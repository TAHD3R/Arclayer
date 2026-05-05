from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Literal

from src.common.types.json_types import JsonObject

EmailProviderId = Literal["smtp", "resend", "cloudflare", "ses"]


@dataclass(frozen=True)
class EmailMessage:
    to: tuple[str, ...]
    subject: str
    html_body: str | None = None
    text_body: str | None = None
    template_id: str | None = None
    template_vars: JsonObject = field(default_factory=dict)
    html_template: str | None = None
    plain_template: str | None = None
    reply_to: str | None = None
    attachments: tuple[Any, ...] = ()
    metadata: JsonObject = field(default_factory=dict)

    @classmethod
    def single(
        cls,
        *,
        recipient: str,
        subject: str,
        html_body: str | None = None,
        text_body: str | None = None,
        template_id: str | None = None,
        template_vars: JsonObject | None = None,
        html_template: str | None = None,
        plain_template: str | None = None,
        metadata: JsonObject | None = None,
    ) -> EmailMessage:
        return cls(
            to=(recipient,),
            subject=subject,
            html_body=html_body,
            text_body=text_body,
            template_id=template_id,
            template_vars=template_vars or {},
            html_template=html_template,
            plain_template=plain_template,
            metadata=metadata or {},
        )


@dataclass(frozen=True)
class SendResult:
    success: bool
    provider_id: str
    message_id: str | None = None
    error: str | None = None
    latency_ms: float = 0.0
    attempts: int = 1


class EmailProvider(ABC):
    provider_id: str
    provider_label: str

    @abstractmethod
    async def is_available(self) -> bool:
        raise NotImplementedError

    @abstractmethod
    async def send(self, message: EmailMessage) -> SendResult:
        raise NotImplementedError

    @abstractmethod
    def validate_config(self) -> None:
        raise NotImplementedError
