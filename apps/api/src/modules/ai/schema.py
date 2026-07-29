from __future__ import annotations

from typing import Literal

from src.common.schemas import BaseSchema
from src.models.agents.conversation import AgentConversationMode

AIReasoningEffort = Literal["low", "medium", "high"]


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

    default_model: str | None
    default_mode: AgentConversationMode = AgentConversationMode.BUILD
    reasoning_effort: AIReasoningEffort = "medium"
    models: list[AIModelCatalogItem]


class ErrorDetail(BaseSchema):
    """Machine-readable error detail."""

    code: str
    message: str


class ErrorResponse(BaseSchema):
    """Error response body."""

    error: ErrorDetail
