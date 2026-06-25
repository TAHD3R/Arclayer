from __future__ import annotations

from enum import StrEnum
from uuid import UUID

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject


class AgentRunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


class AgentRunEventType(StrEnum):
    RUN_CREATED = "run.created"
    MESSAGE_DELTA = "message.delta"
    TOOL_STARTED = "tool.started"
    TOOL_COMPLETED = "tool.completed"
    RUN_COMPLETED = "run.completed"
    RUN_CANCELLED = "run.cancelled"
    RUN_FAILED = "run.failed"


class AgentRunContext(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    workspace_id: UUID
    project_id: UUID
    user_id: UUID
    correlation_id: str
    runtime_id: UUID | None = None
    site_id: UUID | None = None
    environment_id: UUID | None = None


class AgentToolSpec(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    name: str
    description: str
    read_only: bool = True
    required_permission: str
    input_schema: JsonObject = Field(default_factory=dict)


class AgentDefinition(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    agent_id: str
    name: str
    description: str
    system_prompt: str
    tool_names: tuple[str, ...] = Field(default_factory=tuple)


class AgentRunEvent(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True, use_enum_values=False)

    event: AgentRunEventType
    data: JsonObject = Field(default_factory=dict)


class AgentRunState(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(use_enum_values=False)

    id: UUID
    workspace_id: UUID
    project_id: UUID
    user_id: UUID
    correlation_id: str
    agent_id: str
    status: AgentRunStatus
    prompt: str
    model: str | None = None
    result: JsonObject | None = None
    tool_outputs: JsonObject = Field(default_factory=dict)
    events: list[AgentRunEvent] = Field(default_factory=list)
    cancellation_requested: bool = False
    error_code: str | None = None
    error_message: str | None = None
    runtime_id: UUID | None = None
    site_id: UUID | None = None
    environment_id: UUID | None = None
