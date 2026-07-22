from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal, Self

from pydantic import Field, StringConstraints, field_validator, model_validator

from src.common.types.json_types import JsonObject
from src.modules.ai.runtime_protocol_schema import (
    AgentEventEnvelopeV1,
    PublicErrorV1,
    StrictProtocolSchema,
    _require_utc,
)

DecimalString = Annotated[str, StringConstraints(pattern=r"^(0|[1-9]\d*)(\.\d+)?$")]


class UsageV1(StrictProtocolSchema):
    provider: str | None = Field(default=None, min_length=1, max_length=192, exclude_if=lambda value: value is None)
    model: str | None = Field(default=None, min_length=1, max_length=192, exclude_if=lambda value: value is None)
    input_tokens: int | None = Field(default=None, ge=0, exclude_if=lambda value: value is None)
    output_tokens: int | None = Field(default=None, ge=0, exclude_if=lambda value: value is None)
    total_tokens: int | None = Field(default=None, ge=0, exclude_if=lambda value: value is None)
    provider_cost: DecimalString | None = Field(default=None, exclude_if=lambda value: value is None)
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$", exclude_if=lambda value: value is None)
    credits: DecimalString | None = Field(default=None, exclude_if=lambda value: value is None)
    settlement: Literal["provisional", "committed"]

    @model_validator(mode="after")
    def require_measured_consistent_usage(self) -> Self:
        measured = (
            self.input_tokens,
            self.output_tokens,
            self.total_tokens,
            self.provider_cost,
            self.credits,
        )
        if all(value is None for value in measured):
            raise ValueError("usage must contain at least one measured value")
        if self.input_tokens is not None and self.output_tokens is not None and self.total_tokens is not None:
            if self.total_tokens != self.input_tokens + self.output_tokens:
                raise ValueError("totalTokens must equal inputTokens plus outputTokens")
        if (self.provider_cost is None) != (self.currency is None):
            raise ValueError("providerCost and currency must be present together")
        return self


class UsageUpdatedDataV1(StrictProtocolSchema):
    usage: UsageV1
    provider_occurred_at: datetime

    @model_validator(mode="after")
    def require_provisional_usage(self) -> Self:
        _require_utc(self.provider_occurred_at, field_alias="providerOccurredAt")
        if self.usage.settlement != "provisional":
            raise ValueError("usage.updated must carry provisional usage")
        return self


class UsageUpdatedEventV1(AgentEventEnvelopeV1):
    type: Literal["usage.updated"]
    data: UsageUpdatedDataV1


class ChangeSetWarningV1(StrictProtocolSchema):
    code: str = Field(min_length=1, max_length=192)
    message_key: str = Field(min_length=1, max_length=256)
    message_params: JsonObject


class ChangeSetProposedDataV1(StrictProtocolSchema):
    change_set_id: str = Field(min_length=1, max_length=192)
    base_revision_id: str = Field(min_length=1, max_length=192)
    preview_ref: str = Field(min_length=1, max_length=512)
    summary_key: str = Field(min_length=1, max_length=256)
    summary_params: JsonObject
    warnings: tuple[ChangeSetWarningV1, ...]
    required_approval_ids: tuple[str, ...]

    @field_validator("required_approval_ids")
    @classmethod
    def require_unique_approval_ids(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if any(not item or len(item) > 192 for item in value) or len(value) != len(set(value)):
            raise ValueError("requiredApprovalIds must be unique non-empty identifiers")
        return value


class ChangeSetProposedEventV1(AgentEventEnvelopeV1):
    type: Literal["changeset.proposed"]
    data: ChangeSetProposedDataV1


class SettlementV1(StrictProtocolSchema):
    outcome: Literal["committed", "released", "reconciled"]
    usage: UsageV1 | None
    credits_committed: DecimalString
    credits_released: DecimalString

    @model_validator(mode="after")
    def require_terminal_settlement(self) -> Self:
        committed = Decimal(self.credits_committed)
        released = Decimal(self.credits_released)
        if self.usage is not None and self.usage.settlement != "committed":
            raise ValueError("terminal settlement usage must be committed")
        if self.outcome == "released" and committed != 0:
            raise ValueError("released settlement cannot commit Credits")
        if self.outcome == "committed" and released != 0:
            raise ValueError("committed settlement cannot release Credits")
        return self


class RunCompletedDataV1(StrictProtocolSchema):
    completed_at: datetime
    assistant_message_id: str = Field(min_length=1, max_length=192)
    usage: UsageV1
    finish_reason: str = Field(min_length=1, max_length=192)

    @model_validator(mode="after")
    def require_committed_completion(self) -> Self:
        _require_utc(self.completed_at, field_alias="completedAt")
        if self.usage.settlement != "committed":
            raise ValueError("run.completed requires committed usage")
        return self


class RunCompletedEventV1(AgentEventEnvelopeV1):
    type: Literal["run.completed"]
    data: RunCompletedDataV1


class RunCancelledDataV1(StrictProtocolSchema):
    cancelled_at: datetime
    reason_code: str = Field(min_length=1, max_length=192)
    incomplete_part_ids: tuple[str, ...]
    settlement: SettlementV1

    @model_validator(mode="after")
    def require_utc_cancelled_at(self) -> Self:
        _require_utc(self.cancelled_at, field_alias="cancelledAt")
        return self


class RunCancelledEventV1(AgentEventEnvelopeV1):
    type: Literal["run.cancelled"]
    data: RunCancelledDataV1


class RunFailedDataV1(StrictProtocolSchema):
    failed_at: datetime
    error: PublicErrorV1
    incomplete_part_ids: tuple[str, ...]
    settlement: SettlementV1

    @model_validator(mode="after")
    def require_utc_failed_at(self) -> Self:
        _require_utc(self.failed_at, field_alias="failedAt")
        return self


class RunFailedEventV1(AgentEventEnvelopeV1):
    type: Literal["run.failed"]
    data: RunFailedDataV1


RunTerminalEventV1 = RunCompletedEventV1 | RunCancelledEventV1 | RunFailedEventV1
RunOutputProjectionEventV1 = UsageUpdatedEventV1 | ChangeSetProposedEventV1 | RunTerminalEventV1
