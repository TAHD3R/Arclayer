from __future__ import annotations

from uuid import UUID

from pydantic import Field

from src.agents.types import AgentDefinition, AgentRunEvent, AgentRunStatus, AgentSkillDefinition, AgentToolSpec
from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.modules.ai.schema import AIReasoningEffort


class AgentRunCreateRequest(BaseSchema):
    agent_id: str = Field(..., min_length=1, max_length=64)
    prompt: str = Field(..., min_length=1, max_length=8000)
    model: str | None = Field(default=None, max_length=128)
    reasoning_effort: AIReasoningEffort | None = None
    tool_inputs: dict[str, JsonObject] = Field(default_factory=dict)


class AgentRunResumeRequest(BaseSchema):
    approved: bool
    comment: str | None = Field(default=None, max_length=2000)
    metadata: JsonObject = Field(default_factory=dict)


class AgentRunOut(BaseSchema):
    id: UUID
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
    langgraph_thread_id: str
    langgraph_checkpoint_ns: str
    langgraph_checkpoint_id: str | None = None
    langgraph_checkpoint_node: str | None = None


class AgentCatalogOut(BaseSchema):
    agents: list[AgentDefinition] = Field(default_factory=list)
    tools: list[AgentToolSpec] = Field(default_factory=list)
    skills: list[AgentSkillDefinition] = Field(default_factory=list)
