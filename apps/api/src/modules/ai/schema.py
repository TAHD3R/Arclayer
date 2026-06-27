from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.models.agents.conversation import AgentConversationMode

AIReasoningEffort = Literal["low", "medium", "high"]


class ChatMessage(BaseSchema):
    """A client-supplied message in a chat conversation."""

    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=20000)


class ChatRequest(BaseSchema):
    """Chat completion request body."""

    messages: list[ChatMessage] = Field(..., min_length=1, max_length=200)
    workspace_id: PublicUUID | None = None
    mode: AgentConversationMode | None = None
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


class AIConversationMessage(BaseSchema):
    """Persisted Admin AI conversation message."""

    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=20000)
    agent_run_id: PublicUUID | None = None
    agent_status: Literal["running", "interrupted", "completed", "cancelled", "failed"] | None = None
    agent_thread_id: str | None = Field(default=None, max_length=160)
    agent_checkpoint_id: str | None = Field(default=None, max_length=192)
    agent_interrupt: JsonObject | None = None
    agent_artifact: JsonObject | None = None
    agent_execution_summary: JsonObject | None = None
    error: bool = False
    error_message: str | None = Field(default=None, max_length=4000)
    error_details: str | None = Field(default=None, max_length=12000)


class AIConversationCreateRequest(BaseSchema):
    """Create a workspace AI conversation with an optional client-generated id."""

    id: PublicUUID | None = None
    workspace_id: PublicUUID
    title: str | None = Field(default=None, min_length=1, max_length=160)
    mode: AgentConversationMode = AgentConversationMode.BUILD
    model: str | None = Field(default=None, max_length=128)
    reasoning_effort: AIReasoningEffort | None = None
    messages: list[AIConversationMessage] = Field(default_factory=list, max_length=200)
    project_id: PublicUUID | None = None
    runtime_id: PublicUUID | None = None
    site_id: PublicUUID | None = None
    environment_id: PublicUUID | None = None
    context_snapshot: JsonObject = Field(default_factory=dict)


class AIConversationUpdateRequest(BaseSchema):
    """Patch mutable AI conversation fields."""

    title: str | None = Field(default=None, min_length=1, max_length=160)
    mode: AgentConversationMode | None = None
    model: str | None = Field(default=None, max_length=128)
    reasoning_effort: AIReasoningEffort | None = None
    messages: list[AIConversationMessage] | None = Field(default=None, max_length=200)
    project_id: PublicUUID | None = None
    runtime_id: PublicUUID | None = None
    site_id: PublicUUID | None = None
    environment_id: PublicUUID | None = None
    context_snapshot: JsonObject | None = None


class AIConversationOut(BaseSchema):
    """Workspace AI conversation stored by the backend."""

    id: UUID
    workspace_id: UUID
    user_id: UUID
    title: str
    mode: AgentConversationMode
    model: str | None = None
    reasoning_effort: str | None = None
    messages: list[AIConversationMessage] = Field(default_factory=list)
    project_id: UUID | None = None
    runtime_id: UUID | None = None
    site_id: UUID | None = None
    environment_id: UUID | None = None
    context_snapshot: JsonObject = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class AIConversationListOut(BaseSchema):
    conversations: list[AIConversationOut] = Field(default_factory=list)


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
