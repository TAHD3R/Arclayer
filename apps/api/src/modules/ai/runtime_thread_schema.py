from __future__ import annotations

from datetime import datetime
from typing import Self

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.modules.ai.runtime_snapshot_schema import AgentMessageSnapshotV1


class AgentThreadCreateRequestV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    project_id: PublicUUID | None
    lead_agent_id: PublicUUID
    title: str = Field(min_length=1, max_length=160)


class AgentThreadUpdateRequestV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    title: str | None = Field(default=None, min_length=1, max_length=160)
    archived: bool | None = None
    pinned: bool | None = None

    @model_validator(mode="after")
    def require_change(self) -> Self:
        if self.title is None and self.archived is None and self.pinned is None:
            raise ValueError("At least one Thread field must be changed")
        return self


class AgentThreadOutV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    protocol_version: int = Field(default=1, ge=1, le=1)
    thread_id: PublicUUID
    workspace_id: PublicUUID
    project_id: PublicUUID | None
    lead_agent_id: PublicUUID
    lead_agent_version_id: PublicUUID
    lead_agent_assignment_id: PublicUUID
    title: str
    pinned: bool
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AgentThreadDetailV1(AgentThreadOutV1):
    active_run_id: PublicUUID | None
    messages: tuple[AgentMessageSnapshotV1, ...]


class AgentThreadListV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    items: tuple[AgentThreadOutV1, ...]
    next_cursor: PublicUUID | None


class AgentThreadDeleteResultV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    thread_id: PublicUUID
    deleted_at: datetime
