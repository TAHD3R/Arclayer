from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextInputV1
from src.modules.ai.agent_design_system_context_schema import AgentRunDesignSystemContextInputV1
from src.modules.ai.agent_skill_grant_schema import AgentRunSkillGrantSnapshotInput


class AgentRunCreatePersistenceCommand(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    run_id: UUID
    workspace_id: UUID
    project_id: UUID | None
    thread_id: UUID
    job_id: UUID | None = None
    owner_user_id: UUID
    lead_agent_id: UUID
    lead_agent_version_id: UUID
    lead_agent_assignment_id: UUID
    mentioned_agent_ids: tuple[UUID, ...] = ()
    mentioned_agent_version_ids: tuple[UUID, ...] = ()
    mentioned_agent_assignment_ids: tuple[UUID, ...] = ()
    skill_grants: tuple[AgentRunSkillGrantSnapshotInput, ...] = ()
    design_system_context: AgentRunDesignSystemContextInputV1 | None = None
    builder_context: AgentRunBuilderContextInputV1 | None = None
    execution_mode: Literal["plan", "build"]
    site_revision_id: UUID | None
    message: str = Field(min_length=1, max_length=8000)
    idempotency_key: str = Field(min_length=1, max_length=192)
    correlation_id: str = Field(min_length=1, max_length=192)


class PersistedAgentRunHead(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    run_id: UUID
    thread_id: UUID
    status: str
    last_sequence: int
    last_cursor: str


class PersistedAgentRunEvent(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    event_id: str
    sequence: int
    cursor: str
    payload: JsonObject


class PersistedAgentMessagePart(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    type: str
    status: str
    text: str | None


class PersistedAgentMessage(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    id: UUID
    role: str
    status: str
    parts: tuple[PersistedAgentMessagePart, ...]
