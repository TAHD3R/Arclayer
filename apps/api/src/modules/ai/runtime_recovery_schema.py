from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.models.agents.runtime_recovery_v1 import (
    AgentRunExecutionEffectDisposition,
    AgentRunRecoveryAction,
    AgentRunRecoveryStatus,
)


class AgentRunExecutionEffectRegistration(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    run_id: UUID
    effect_key: str = Field(..., min_length=1, max_length=128)
    request_hash: str = Field(..., min_length=64, max_length=64)


class AgentRunExecutionEffectSnapshot(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    id: UUID
    run_id: UUID
    job_id: UUID
    owner_attempt_id: UUID
    effect_key: str
    request_hash: str
    disposition: AgentRunExecutionEffectDisposition
    outcome: JsonObject | None
    outcome_hash: str | None
    error_code: str | None
    registered_at: datetime
    settled_at: datetime | None

    @model_validator(mode="after")
    def validate_terminal_evidence(self) -> AgentRunExecutionEffectSnapshot:
        terminal = self.disposition != AgentRunExecutionEffectDisposition.ACTIVE
        if terminal != (self.settled_at is not None):
            raise ValueError("Agent execution effect terminal evidence is incomplete")
        if self.disposition == AgentRunExecutionEffectDisposition.COMMITTED:
            if self.outcome is None or self.outcome_hash is None or self.error_code is not None:
                raise ValueError("Committed Agent execution effects require only an outcome receipt")
        elif self.disposition == AgentRunExecutionEffectDisposition.UNKNOWN:
            if self.outcome is not None or self.outcome_hash is not None or self.error_code is None:
                raise ValueError("Unknown Agent execution effects require only an error code")
        elif any(value is not None for value in (self.outcome, self.outcome_hash, self.error_code)):
            raise ValueError("Active Agent execution effects cannot carry terminal evidence")
        return self


class AgentRunRecoveryEvidence(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    source_job_id: UUID
    recovery_job_id: UUID
    action: Literal["retry", "reconcile"]
    source_effect_disposition: AgentRunExecutionEffectDisposition | None = None
    source_effect_id: UUID | None = None


class AgentRunRecoveryExecutionSnapshot(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    recovery_id: UUID
    action: AgentRunRecoveryAction
    status: AgentRunRecoveryStatus
    source_job_id: UUID
    source_effect: AgentRunExecutionEffectSnapshot | None = None
