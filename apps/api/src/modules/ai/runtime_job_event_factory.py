from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal, TypedDict, cast
from uuid import UUID, uuid4

from pydantic import ConfigDict

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.llm.runtime import detect_provider
from src.modules.ai.runtime_approval_protocol_schema import (
    ApprovalRequiredDataV1,
    ApprovalRequiredEventV1,
    ApprovalV1,
    RunInterruptedDataV1,
    RunInterruptedEventV1,
)
from src.modules.ai.runtime_job_repository import AgentRunJobState
from src.modules.ai.runtime_output_protocol_schema import (
    RunCancelledDataV1,
    RunCancelledEventV1,
    RunCompletedDataV1,
    RunCompletedEventV1,
    RunFailedDataV1,
    RunFailedEventV1,
    SettlementV1,
    UsageUpdatedDataV1,
    UsageUpdatedEventV1,
    UsageV1,
)
from src.modules.ai.runtime_protocol_schema import (
    MessagePartCompletedDataV1,
    MessagePartCompletedEventV1,
    MessagePartDeltaDataV1,
    MessagePartDeltaEventV1,
    MessagePartStartedDataV1,
    MessagePartStartedEventV1,
    ProjectedMessageShellV1,
    PublicErrorV1,
    RunCancelRequestedDataV1,
    RunCancelRequestedEventV1,
    RunStartedDataV1,
    RunStartedEventV1,
    TextAppendDeltaV1,
    TextMessagePartCompletedV1,
    TextMessagePartStartedV1,
    ThreadMessagePlacementV1,
    ToolCallMessagePartCompletedInlineV1,
    ToolCallMessagePartStartedV1,
)
from src.modules.ai.runtime_settlement_repository import AgentRunSettlementProof
from src.modules.ai.runtime_tool_protocol_schema import (
    ToolCompletedEventV1,
    ToolCompletedInlineDataV1,
    ToolStartedDataV1,
    ToolStartedEventV1,
)


class AgentRunJobMessageIdentity(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    message_id: UUID
    part_id: UUID


class _AgentEventFields(TypedDict):
    event_version: Literal[1]
    event_id: str
    cursor: str
    run_id: str
    thread_id: str
    sequence: int
    occurred_at: datetime
    correlation_id: str
    span_id: str | None
    parent_span_id: str | None


class _AgentSpannedEventFields(TypedDict):
    event_version: Literal[1]
    event_id: str
    cursor: str
    run_id: str
    thread_id: str
    sequence: int
    occurred_at: datetime
    correlation_id: str
    span_id: str
    parent_span_id: str


class AgentRunJobEventFactory:
    """Build strict v1 events while persistence remains the sequence authority."""

    __slots__ = ("_state",)

    def __init__(self, state: AgentRunJobState) -> None:
        self._state = state

    @staticmethod
    def new_message_identity() -> AgentRunJobMessageIdentity:
        return AgentRunJobMessageIdentity(message_id=uuid4(), part_id=uuid4())

    def run_started(
        self,
        *,
        sequence: int,
        occurred_at: datetime,
        attempt_number: int,
    ) -> RunStartedEventV1:
        return RunStartedEventV1(
            **self._envelope(sequence=sequence, occurred_at=occurred_at),
            type="run.started",
            data=RunStartedDataV1(
                started_at=occurred_at,
                attempt_number=attempt_number,
                agent_version_id=str(self._state.lead_agent_version_id),
            ),
        )

    def run_cancel_requested(
        self,
        *,
        sequence: int,
        occurred_at: datetime,
        requested_by_actor_id: UUID,
    ) -> RunCancelRequestedEventV1:
        return RunCancelRequestedEventV1(
            **self._envelope(sequence=sequence, occurred_at=occurred_at),
            type="run.cancel.requested",
            data=RunCancelRequestedDataV1(
                requested_at=occurred_at,
                requested_by_actor_id=str(requested_by_actor_id),
            ),
        )

    def message_started(
        self,
        *,
        sequence: int,
        occurred_at: datetime,
        identity: AgentRunJobMessageIdentity,
    ) -> MessagePartStartedEventV1:
        return MessagePartStartedEventV1(
            **self._envelope(sequence=sequence, occurred_at=occurred_at),
            type="message.part.started",
            data=MessagePartStartedDataV1(
                message=ProjectedMessageShellV1(
                    message_id=str(identity.message_id),
                    role="assistant",
                    agent_id=self._state.lead_agent_id,
                    created_at=occurred_at,
                    placement=ThreadMessagePlacementV1(kind="thread"),
                ),
                part=TextMessagePartStartedV1(
                    part_id=str(identity.part_id),
                    part_index=0,
                    type="text",
                    status="running",
                    text="",
                ),
            ),
        )

    def message_delta(
        self,
        *,
        sequence: int,
        occurred_at: datetime,
        identity: AgentRunJobMessageIdentity,
        text: str,
    ) -> MessagePartDeltaEventV1:
        return MessagePartDeltaEventV1(
            **self._envelope(sequence=sequence, occurred_at=occurred_at),
            type="message.part.delta",
            data=MessagePartDeltaDataV1(
                message_id=str(identity.message_id),
                part_id=str(identity.part_id),
                delta=TextAppendDeltaV1(kind="text.append", text=text),
            ),
        )

    def tool_message_started(
        self,
        *,
        sequence: int,
        occurred_at: datetime,
        identity: AgentRunJobMessageIdentity,
        tool_call_id: str,
        tool_name: str,
        args: JsonObject,
        args_text: str,
    ) -> MessagePartStartedEventV1:
        return MessagePartStartedEventV1(
            **self._envelope(sequence=sequence, occurred_at=occurred_at),
            type="message.part.started",
            data=MessagePartStartedDataV1(
                message=ProjectedMessageShellV1(
                    message_id=str(identity.message_id),
                    role="assistant",
                    agent_id=self._state.lead_agent_id,
                    created_at=occurred_at,
                    placement=ThreadMessagePlacementV1(kind="thread"),
                ),
                part=ToolCallMessagePartStartedV1(
                    part_id=str(identity.part_id),
                    part_index=0,
                    type="tool-call",
                    status="running",
                    tool_call_id=tool_call_id,
                    tool_name=tool_name,
                    args=args,
                    args_text=args_text,
                ),
            ),
        )

    def approval_required(
        self,
        *,
        sequence: int,
        occurred_at: datetime,
        identity: AgentRunJobMessageIdentity,
        approval: ApprovalV1,
        span_id: str,
        parent_span_id: str,
    ) -> ApprovalRequiredEventV1:
        return ApprovalRequiredEventV1(
            **self._spanned_envelope(
                sequence=sequence,
                occurred_at=occurred_at,
                span_id=span_id,
                parent_span_id=parent_span_id,
            ),
            type="approval.required",
            data=ApprovalRequiredDataV1(
                approval=approval,
                message_id=str(identity.message_id),
                part_id=str(identity.part_id),
            ),
        )

    def tool_started(
        self,
        *,
        sequence: int,
        occurred_at: datetime,
        identity: AgentRunJobMessageIdentity,
        tool_call_id: str,
        tool_id: str,
        tool_version: str,
        tool_name: str,
        args: JsonObject,
        args_text: str,
        span_id: str,
        parent_span_id: str,
    ) -> ToolStartedEventV1:
        return ToolStartedEventV1(
            **self._spanned_envelope(
                sequence=sequence,
                occurred_at=occurred_at,
                span_id=span_id,
                parent_span_id=parent_span_id,
            ),
            type="tool.started",
            data=ToolStartedDataV1(
                message_id=str(identity.message_id),
                part_id=str(identity.part_id),
                tool_call_id=tool_call_id,
                tool_id=tool_id,
                tool_version=tool_version,
                tool_name=tool_name,
                args=args,
                args_text=args_text,
                started_at=occurred_at,
            ),
        )

    def tool_completed(
        self,
        *,
        sequence: int,
        occurred_at: datetime,
        tool_call_id: str,
        result: object,
        span_id: str,
        parent_span_id: str,
    ) -> ToolCompletedEventV1:
        return ToolCompletedEventV1(
            **self._spanned_envelope(
                sequence=sequence,
                occurred_at=occurred_at,
                span_id=span_id,
                parent_span_id=parent_span_id,
            ),
            type="tool.completed",
            data=ToolCompletedInlineDataV1(
                tool_call_id=tool_call_id,
                completed_at=occurred_at,
                result=cast(Any, result),
            ),
        )

    def tool_message_completed(
        self,
        *,
        sequence: int,
        occurred_at: datetime,
        identity: AgentRunJobMessageIdentity,
        tool_call_id: str,
        tool_name: str,
        args: JsonObject,
        args_text: str,
        result: object,
        approval: JsonObject | None,
    ) -> MessagePartCompletedEventV1:
        return MessagePartCompletedEventV1(
            **self._envelope(sequence=sequence, occurred_at=occurred_at),
            type="message.part.completed",
            data=MessagePartCompletedDataV1(
                message_id=str(identity.message_id),
                part=ToolCallMessagePartCompletedInlineV1(
                    part_id=str(identity.part_id),
                    part_index=0,
                    type="tool-call",
                    status="complete",
                    tool_call_id=tool_call_id,
                    tool_name=tool_name,
                    args=args,
                    args_text=args_text,
                    result=cast(Any, result),
                    approval=approval,
                ),
            ),
        )

    def run_interrupted(
        self,
        *,
        sequence: int,
        occurred_at: datetime,
        interrupt_id: str,
        checkpoint_id: str,
        reason: Literal["approval_required", "human_tool_input"],
        tool_call_id: str,
        approval_id: str | None,
        span_id: str | None,
        parent_span_id: str | None,
    ) -> RunInterruptedEventV1:
        return RunInterruptedEventV1(
            **self._envelope(
                sequence=sequence,
                occurred_at=occurred_at,
                span_id=span_id,
                parent_span_id=parent_span_id,
            ),
            type="run.interrupted",
            data=RunInterruptedDataV1(
                interrupt_id=interrupt_id,
                checkpoint_id=checkpoint_id,
                reason=reason,
                approval_id=approval_id,
                tool_call_id=tool_call_id,
            ),
        )

    def message_completed(
        self,
        *,
        sequence: int,
        occurred_at: datetime,
        identity: AgentRunJobMessageIdentity,
        text: str,
    ) -> MessagePartCompletedEventV1:
        return MessagePartCompletedEventV1(
            **self._envelope(sequence=sequence, occurred_at=occurred_at),
            type="message.part.completed",
            data=MessagePartCompletedDataV1(
                message_id=str(identity.message_id),
                part=TextMessagePartCompletedV1(
                    part_id=str(identity.part_id),
                    part_index=0,
                    type="text",
                    status="complete",
                    text=text,
                ),
            ),
        )

    def usage_updated(
        self,
        *,
        sequence: int,
        occurred_at: datetime,
        usage: UsageV1,
    ) -> UsageUpdatedEventV1:
        return UsageUpdatedEventV1(
            **self._envelope(sequence=sequence, occurred_at=occurred_at),
            type="usage.updated",
            data=UsageUpdatedDataV1(
                usage=usage,
                provider_occurred_at=occurred_at,
            ),
        )

    def run_completed(
        self,
        *,
        sequence: int,
        occurred_at: datetime,
        identity: AgentRunJobMessageIdentity,
        usage: UsageV1,
        finish_reason: str,
    ) -> RunCompletedEventV1:
        return RunCompletedEventV1(
            **self._envelope(sequence=sequence, occurred_at=occurred_at),
            type="run.completed",
            data=RunCompletedDataV1(
                completed_at=occurred_at,
                assistant_message_id=str(identity.message_id),
                usage=usage,
                finish_reason=finish_reason,
            ),
        )

    def run_failed(
        self,
        *,
        sequence: int,
        occurred_at: datetime,
        error_code: str,
        message: str,
        retryable: bool,
        proof: AgentRunSettlementProof,
    ) -> RunFailedEventV1:
        return RunFailedEventV1(
            **self._envelope(sequence=sequence, occurred_at=occurred_at),
            type="run.failed",
            data=RunFailedDataV1(
                failed_at=occurred_at,
                error=PublicErrorV1(
                    code=error_code,
                    message=message,
                    retryable=retryable,
                ),
                incomplete_part_ids=self._state.running_part_ids,
                settlement=terminal_settlement(proof=proof),
            ),
        )

    def run_cancelled(
        self,
        *,
        sequence: int,
        occurred_at: datetime,
        proof: AgentRunSettlementProof,
    ) -> RunCancelledEventV1:
        return RunCancelledEventV1(
            **self._envelope(sequence=sequence, occurred_at=occurred_at),
            type="run.cancelled",
            data=RunCancelledDataV1(
                cancelled_at=occurred_at,
                reason_code="USER_REQUESTED",
                incomplete_part_ids=self._state.running_part_ids,
                settlement=terminal_settlement(proof=proof),
            ),
        )

    def _envelope(
        self,
        *,
        sequence: int,
        occurred_at: datetime,
        span_id: str | None = None,
        parent_span_id: str | None = None,
    ) -> _AgentEventFields:
        return {
            "event_version": 1,
            "event_id": uuid4().hex,
            "cursor": uuid4().hex,
            "run_id": str(self._state.run_id),
            "thread_id": str(self._state.thread_id),
            "sequence": sequence,
            "occurred_at": occurred_at,
            "correlation_id": self._state.correlation_id,
            "span_id": span_id,
            "parent_span_id": parent_span_id,
        }

    def _spanned_envelope(
        self,
        *,
        sequence: int,
        occurred_at: datetime,
        span_id: str,
        parent_span_id: str,
    ) -> _AgentSpannedEventFields:
        return {
            "event_version": 1,
            "event_id": uuid4().hex,
            "cursor": uuid4().hex,
            "run_id": str(self._state.run_id),
            "thread_id": str(self._state.thread_id),
            "sequence": sequence,
            "occurred_at": occurred_at,
            "correlation_id": self._state.correlation_id,
            "span_id": span_id,
            "parent_span_id": parent_span_id,
        }


def build_usage(
    *,
    model: str,
    input_tokens: int,
    output_tokens: int,
    proof: AgentRunSettlementProof,
    settlement: Literal["provisional", "committed"],
) -> UsageV1:
    provider_cost = _decimal_string(proof.actual_cost_micros, scale=1_000_000)
    return UsageV1(
        provider=detect_provider(model),
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=input_tokens + output_tokens,
        provider_cost=provider_cost if proof.reservation_count else None,
        currency="USD" if proof.reservation_count else None,
        credits=str(proof.credits_committed) if proof.credit_reservation_count else None,
        settlement=settlement,
    )


def terminal_settlement(*, proof: AgentRunSettlementProof) -> SettlementV1:
    return SettlementV1(
        outcome=proof.outcome,
        usage=None,
        credits_committed=str(proof.credits_committed),
        credits_released=str(proof.credits_released),
    )


def _decimal_string(value: int, *, scale: int) -> str:
    normalized = Decimal(value) / Decimal(scale)
    return format(normalized, "f")
