from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator, model_validator

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.agents.runtime_v1 import AgentRunStatusV1


class AgentRunCreateRequestV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    project_id: PublicUUID | None = None
    site_revision_id: PublicUUID | None = None
    lead_agent_id: PublicUUID
    mentioned_agent_ids: tuple[PublicUUID, ...] = ()
    execution_mode: Literal["plan", "build"]
    message: str = Field(min_length=1, max_length=8000)

    @field_validator("message")
    @classmethod
    def require_non_whitespace(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("value must contain non-whitespace characters")
        return value

    @field_validator("mentioned_agent_ids")
    @classmethod
    def validate_mentions(cls, values: tuple[UUID, ...]) -> tuple[UUID, ...]:
        if len(values) != len(set(values)):
            raise ValueError("mentionedAgentIds must be unique")
        return values

    @model_validator(mode="after")
    def require_project_for_site_revision(self) -> AgentRunCreateRequestV1:
        if self.site_revision_id is not None and self.project_id is None:
            raise ValueError("siteRevisionId requires projectId")
        return self


class AgentRunCreateResponseV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    protocol_version: Literal[1] = 1
    run_id: PublicUUID
    thread_id: PublicUUID
    status: AgentRunStatusV1
    snapshot_url: str
    events_url: str
    last_sequence: int
    last_cursor: str
