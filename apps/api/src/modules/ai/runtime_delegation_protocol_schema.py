from __future__ import annotations

from datetime import datetime
from typing import Literal, Self

from pydantic import Field, model_validator

from src.modules.ai.runtime_protocol_schema import (
    AgentEventEnvelopeV1,
    ArtifactRefV1,
    PublicErrorV1,
    StrictProtocolSchema,
    _require_utc,
)


class DelegationEventEnvelopeV1(AgentEventEnvelopeV1):
    span_id: str = Field(min_length=1, max_length=192)
    parent_span_id: str = Field(min_length=1, max_length=192)


class DelegationDelegatedDataV1(StrictProtocolSchema):
    delegation_id: str = Field(min_length=1, max_length=192)
    parent_tool_call_id: str = Field(min_length=1, max_length=192)
    child_run_id: str = Field(min_length=1, max_length=192)
    source_agent_version_id: str = Field(min_length=1, max_length=192)
    target_agent_version_id: str = Field(min_length=1, max_length=192)
    delegated_at: datetime
    objective_summary: str = Field(min_length=1, max_length=4000)

    @model_validator(mode="after")
    def require_utc_delegated_at(self) -> Self:
        _require_utc(self.delegated_at, field_alias="delegatedAt")
        return self


class DelegationDelegatedEventV1(DelegationEventEnvelopeV1):
    type: Literal["delegation.delegated"]
    data: DelegationDelegatedDataV1


class DelegationCompletedDataV1(StrictProtocolSchema):
    delegation_id: str = Field(min_length=1, max_length=192)
    child_run_id: str = Field(min_length=1, max_length=192)
    completed_at: datetime
    artifact_refs: tuple[ArtifactRefV1, ...] = Field(default=(), exclude_if=lambda value: not value)
    summary: str = Field(min_length=1, max_length=8000)

    @model_validator(mode="after")
    def require_utc_completed_at(self) -> Self:
        _require_utc(self.completed_at, field_alias="completedAt")
        return self


class DelegationCompletedEventV1(DelegationEventEnvelopeV1):
    type: Literal["delegation.completed"]
    data: DelegationCompletedDataV1


class DelegationFailedDataV1(StrictProtocolSchema):
    delegation_id: str = Field(min_length=1, max_length=192)
    child_run_id: str = Field(min_length=1, max_length=192)
    failed_at: datetime
    error: PublicErrorV1

    @model_validator(mode="after")
    def require_utc_failed_at(self) -> Self:
        _require_utc(self.failed_at, field_alias="failedAt")
        return self


class DelegationFailedEventV1(DelegationEventEnvelopeV1):
    type: Literal["delegation.failed"]
    data: DelegationFailedDataV1


DelegationTerminalEventV1 = DelegationCompletedEventV1 | DelegationFailedEventV1
DelegationProjectionEventV1 = DelegationDelegatedEventV1 | DelegationTerminalEventV1
