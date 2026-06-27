from __future__ import annotations

from enum import StrEnum
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject


class AgentRunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    INTERRUPTED = "interrupted"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


class AgentMode(StrEnum):
    BUILD = "build"
    PLAN = "plan"
    AGENT = "agent"


class AgentRunEventType(StrEnum):
    RUN_CREATED = "run.created"
    APPROVAL_REQUIRED = "approval.required"
    RUN_INTERRUPTED = "run.interrupted"
    RUN_RESUMED = "run.resumed"
    MESSAGE_DELTA = "message.delta"
    TOOL_STARTED = "tool.started"
    TOOL_COMPLETED = "tool.completed"
    USAGE_PARTIAL = "usage.partial"
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


class AgentSkillDefinition(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    skill_id: str
    name: str
    description: str
    mode: AgentMode
    agent_id: str | None = None
    tool_names: tuple[str, ...] = Field(default_factory=tuple)
    read_only: bool = True
    requires_approval: bool = False
    enabled: bool = True
    disabled_reason: str | None = None
    approval_policy: str | None = None


class AgentDefinition(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    agent_id: str
    name: str
    description: str
    system_prompt: str
    mode: AgentMode = AgentMode.AGENT
    skill_id: str
    tool_names: tuple[str, ...] = Field(default_factory=tuple)
    read_only: bool = True
    requires_approval: bool = False


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
    langgraph_thread_id: str | None = None
    langgraph_checkpoint_ns: str = "project-agent"
    langgraph_checkpoint_id: str | None = None
    langgraph_checkpoint_node: str | None = None

    @model_validator(mode="after")
    def derive_langgraph_thread_id(self) -> AgentRunState:
        if self.langgraph_thread_id is None or not self.langgraph_thread_id.strip():
            self.langgraph_thread_id = f"agent-run:{self.id}"
        return self
