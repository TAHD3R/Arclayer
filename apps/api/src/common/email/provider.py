from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from src.common.types.json_types import JsonObject

EmailProviderId = Literal["smtp", "resend", "cloudflare", "ses"]


class EmailMessage(BaseModel):
    model_config = ConfigDict(frozen=True)
    to: tuple[str, ...]
    subject: str
    html_body: str | None = None
    text_body: str | None = None
    template_id: str | None = None
    reply_to: str | None = None
    attachments: tuple[Any, ...] = ()
    metadata: JsonObject = Field(default_factory=dict)

    @classmethod
    def single(
        cls,
        *,
        recipient: str,
        subject: str,
        html_body: str | None = None,
        text_body: str | None = None,
        template_id: str | None = None,
        metadata: JsonObject | None = None,
    ) -> EmailMessage:
        return cls(
            to=(recipient,),
            subject=subject,
            html_body=html_body,
            text_body=text_body,
            template_id=template_id,
            metadata=metadata or {},
        )


class SendResult(BaseModel):
    model_config = ConfigDict(frozen=True)
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
