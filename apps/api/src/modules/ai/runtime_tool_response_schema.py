from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import Field, model_validator

from src.common.types.json_types import JsonValue
from src.modules.ai.runtime_protocol_schema import StrictProtocolSchema, _require_utc


class ToolResponseCommandBaseV1(StrictProtocolSchema):
    response_id: str = Field(min_length=1, max_length=192)
    workspace_id: UUID
    project_id: UUID | None
    thread_id: UUID
    run_id: UUID
    actor_user_id: UUID
    tool_call_id: str = Field(min_length=1, max_length=192)
    checkpoint_id: str = Field(min_length=1, max_length=192)
    idempotency_key: str = Field(min_length=1, max_length=192)
    responded_at: datetime

    @model_validator(mode="after")
    def require_utc_responded_at(self) -> Self:
        _require_utc(self.responded_at, field_alias="respondedAt")
        return self


class ApprovalToolResponseCommandV1(ToolResponseCommandBaseV1):
    kind: Literal["approval"]
    approval_id: str = Field(min_length=1, max_length=192)
    approval_version: int = Field(ge=1)
    approved: bool
    option_id: str | None = Field(default=None, min_length=1, max_length=192, exclude_if=lambda value: value is None)
    reason: str | None = Field(default=None, max_length=1000, exclude_if=lambda value: value is None)


class HumanToolResultResponseCommandV1(ToolResponseCommandBaseV1):
    kind: Literal["human_result"]
    result: JsonValue


ToolResponseCommandV1 = Annotated[
    ApprovalToolResponseCommandV1 | HumanToolResultResponseCommandV1,
    Field(discriminator="kind"),
]


class PersistedAgentToolResponseV1(StrictProtocolSchema):
    response_id: str
    kind: Literal["approval", "human_result"]
    run_id: UUID
    tool_call_id: str
    checkpoint_id: str
    expected_sequence: int = Field(ge=1)
    consumed_at: datetime | None
