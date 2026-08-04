from __future__ import annotations

from typing import Literal

from pydantic import Field

from src.common.schemas import BaseSchema
from src.models.agents.conversation import AgentConversationMode
from src.modules.ai.provider_icon import AIProviderIcon

AIReasoningEffort = Literal["low", "medium", "high"]


class AIModelCatalogItem(BaseSchema):
    """Model option exposed to Admin UI."""

    id: str
    provider: str
    label: str
    label_i18n: dict[str, str] = Field(default_factory=dict)
    description: str | None = None
    description_i18n: dict[str, str] = Field(default_factory=dict)
    provider_icon: AIProviderIcon | None = None
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
