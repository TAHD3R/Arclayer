from __future__ import annotations

from datetime import datetime
from typing import Literal, Self

from pydantic import Field, model_validator

from src.modules.ai.runtime_protocol_schema import AgentEventEnvelopeV1, StrictProtocolSchema, _require_utc


class RunRecoveryRequestedDataV1(StrictProtocolSchema):
    recovery_id: str = Field(min_length=1, max_length=192)
    action: Literal["retry", "reconcile"]
    source_job_id: str = Field(min_length=1, max_length=192)
    recovery_job_id: str = Field(min_length=1, max_length=192)
    requested_at: datetime
    authority: Literal["platform_operator"] = "platform_operator"

    @model_validator(mode="after")
    def require_utc_requested_at(self) -> Self:
        _require_utc(self.requested_at, field_alias="requestedAt")
        if self.source_job_id == self.recovery_job_id:
            raise ValueError("Agent Run recovery cannot reopen its source Job")
        return self


class RunRecoveryRequestedEventV1(AgentEventEnvelopeV1):
    type: Literal["run.recovery.requested"]
    data: RunRecoveryRequestedDataV1
