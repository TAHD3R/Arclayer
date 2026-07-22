from __future__ import annotations

from uuid import UUID

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema


class AgentRunOwnedScopeV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    project_id: UUID | None
    thread_id: UUID
    run_id: UUID
    owner_user_id: UUID
    last_sequence: int = Field(ge=1)
    last_cursor: str
    minimum_replay_sequence: int = Field(ge=1)
    minimum_replay_cursor: str | None
    terminal: bool


class AgentRunStreamSessionV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    run_id: UUID
    start_sequence: int = Field(ge=0)
    last_sequence: int = Field(ge=1)
    terminal: bool
