from __future__ import annotations

from typing import Literal

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID

AIReasoningEffort = Literal["low", "medium", "high"]


class ChatMessage(BaseSchema):
    """A single message in a chat conversation."""

    role: str
    content: str


class ChatRequest(BaseSchema):
    """Chat completion request body."""

    messages: list[dict[str, str]]
    workspace_id: PublicUUID | None = None
    model: str | None = None
    reasoning_effort: AIReasoningEffort | None = None
    temperature: float | None = None
    max_tokens: int | None = None


class ChatUsage(BaseSchema):
    """Token usage metrics for a chat completion."""

    prompt_tokens: int
    completion_tokens: int


class ChatResponse(BaseSchema):
    """Chat completion response."""

    id: str
    model: str
    content: str
    usage: ChatUsage
    finish_reason: str


class AIModelCatalogItem(BaseSchema):
    """Model option exposed to Admin UI."""

    id: str
    provider: str
    label: str
    label_key: str | None = None
    description: str | None = None
    description_key: str | None = None
    available: bool = True


class AIModelCatalogResponse(BaseSchema):
    """Available chat model catalog."""

    default_model: str
    models: list[AIModelCatalogItem]


class ErrorDetail(BaseSchema):
    """Machine-readable error detail."""

    code: str
    message: str


class ErrorResponse(BaseSchema):
    """Error response body."""

    error: ErrorDetail
