from __future__ import annotations

from src.common.schemas import BaseSchema


class ChatMessage(BaseSchema):
    """A single message in a chat conversation."""

    role: str
    content: str


class ChatRequest(BaseSchema):
    """Chat completion request body."""

    messages: list[dict[str, str]]
    model: str | None = None
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


class ErrorDetail(BaseSchema):
    """Machine-readable error detail."""

    code: str
    message: str


class ErrorResponse(BaseSchema):
    """Error response body."""

    error: ErrorDetail
