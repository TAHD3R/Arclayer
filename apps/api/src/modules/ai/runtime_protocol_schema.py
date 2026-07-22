from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Annotated, Literal, Self

from pydantic import ConfigDict, Field, StringConstraints, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject, JsonValue

VerbatimText = Annotated[str, StringConstraints(strip_whitespace=False)]


def _require_utc(value: datetime, *, field_alias: str) -> None:
    if value.utcoffset() != timedelta(0):
        raise ValueError(f"{field_alias} must be an RFC 3339 UTC timestamp")


class StrictProtocolSchema(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)


class CanonicalToolArgsV1(StrictProtocolSchema):
    args: JsonObject
    args_text: str = Field(min_length=2)

    @model_validator(mode="after")
    def require_canonical_args_text(self) -> Self:
        canonical = json.dumps(
            self.args,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        if self.args_text != canonical:
            raise ValueError("argsText must be the canonical JSON representation of args")
        return self


class RunCreatedProjectionV1(StrictProtocolSchema):
    status: Literal["created"]
    execution_mode: Literal["plan", "build"]
    lead_agent_id: str = Field(min_length=1, max_length=160)
    created_at: datetime

    @model_validator(mode="after")
    def require_utc_created_at(self) -> Self:
        _require_utc(self.created_at, field_alias="createdAt")
        return self


class RunCreatedDataV1(StrictProtocolSchema):
    run: RunCreatedProjectionV1


class AgentEventEnvelopeV1(StrictProtocolSchema):
    event_version: Literal[1]
    event_id: str = Field(min_length=1, max_length=192)
    cursor: str = Field(min_length=1, max_length=512)
    run_id: str = Field(min_length=1, max_length=192)
    thread_id: str = Field(min_length=1, max_length=192)
    sequence: int = Field(ge=1)
    occurred_at: datetime
    correlation_id: str = Field(min_length=1, max_length=192)
    span_id: str | None
    parent_span_id: str | None

    @model_validator(mode="after")
    def require_utc_occurred_at(self) -> Self:
        _require_utc(self.occurred_at, field_alias="occurredAt")
        return self


class RunCreatedEventV1(AgentEventEnvelopeV1):
    type: Literal["run.created"]
    data: RunCreatedDataV1


class RunQueuedDataV1(StrictProtocolSchema):
    queued_at: datetime
    queue_class: str | None = Field(default=None, min_length=1, max_length=96)

    @model_validator(mode="after")
    def require_utc_queued_at(self) -> Self:
        _require_utc(self.queued_at, field_alias="queuedAt")
        return self


class RunQueuedEventV1(AgentEventEnvelopeV1):
    type: Literal["run.queued"]
    data: RunQueuedDataV1


class RunStartedDataV1(StrictProtocolSchema):
    started_at: datetime
    attempt_number: int = Field(ge=1)
    agent_version_id: str = Field(min_length=1, max_length=192)

    @model_validator(mode="after")
    def require_utc_started_at(self) -> Self:
        _require_utc(self.started_at, field_alias="startedAt")
        return self


class RunStartedEventV1(AgentEventEnvelopeV1):
    type: Literal["run.started"]
    data: RunStartedDataV1


class RunCancelRequestedDataV1(StrictProtocolSchema):
    requested_at: datetime
    requested_by_actor_id: str = Field(min_length=1, max_length=192)

    @model_validator(mode="after")
    def require_utc_requested_at(self) -> Self:
        _require_utc(self.requested_at, field_alias="requestedAt")
        return self


class RunCancelRequestedEventV1(AgentEventEnvelopeV1):
    type: Literal["run.cancel.requested"]
    data: RunCancelRequestedDataV1


class ThreadMessagePlacementV1(StrictProtocolSchema):
    kind: Literal["thread"]


class DelegationMessagePlacementV1(StrictProtocolSchema):
    kind: Literal["delegation"]
    delegation_id: str = Field(min_length=1, max_length=192)
    parent_tool_call_id: str = Field(min_length=1, max_length=192)
    source_run_id: str = Field(min_length=1, max_length=192)


MessagePlacementV1 = Annotated[
    ThreadMessagePlacementV1 | DelegationMessagePlacementV1,
    Field(discriminator="kind"),
]


class ProjectedMessageShellV1(StrictProtocolSchema):
    message_id: str = Field(min_length=1, max_length=192)
    role: Literal["assistant", "user"]
    agent_id: str | None = Field(default=None, min_length=1, max_length=160)
    actor_user_id: str | None = Field(default=None, min_length=1, max_length=192)
    created_at: datetime
    placement: MessagePlacementV1

    @model_validator(mode="after")
    def require_role_identity_and_utc_created_at(self) -> Self:
        _require_utc(self.created_at, field_alias="createdAt")
        if self.role == "assistant" and (self.agent_id is None or self.actor_user_id is not None):
            raise ValueError("assistant messages require only agentId")
        if self.role == "user" and (self.actor_user_id is None or self.agent_id is not None):
            raise ValueError("user messages require only actorUserId")
        return self


class TextMessagePartStartedV1(StrictProtocolSchema):
    part_id: str = Field(min_length=1, max_length=192)
    part_index: int = Field(ge=0)
    type: Literal["text"]
    status: Literal["running"]
    text: VerbatimText


class ToolCallMessagePartBaseV1(CanonicalToolArgsV1):
    part_id: str = Field(min_length=1, max_length=192)
    part_index: int = Field(ge=0)
    type: Literal["tool-call"]
    tool_call_id: str = Field(min_length=1, max_length=192)
    tool_name: str = Field(min_length=1, max_length=192)
    approval: JsonObject | None = Field(default=None, exclude_if=lambda value: value is None)


class ToolCallMessagePartStartedV1(ToolCallMessagePartBaseV1):
    status: Literal["running"]


class TextMessagePartCompletedV1(StrictProtocolSchema):
    part_id: str = Field(min_length=1, max_length=192)
    part_index: int = Field(ge=0)
    type: Literal["text"]
    status: Literal["complete", "incomplete", "failed"]
    text: VerbatimText


class ArtifactRefV1(StrictProtocolSchema):
    artifact_id: str = Field(min_length=1, max_length=192)


class PublicErrorV1(StrictProtocolSchema):
    code: str = Field(min_length=1, max_length=192)
    message: str = Field(min_length=1)
    retryable: bool
    details: JsonObject | None = Field(default=None, exclude_if=lambda value: value is None)


class ToolCallMessagePartCompletedInlineV1(ToolCallMessagePartBaseV1):
    status: Literal["complete", "incomplete"]
    result: JsonValue
    artifact_refs: tuple[ArtifactRefV1, ...] = Field(default=(), exclude_if=lambda value: not value)


class ToolCallMessagePartCompletedReferenceV1(ToolCallMessagePartBaseV1):
    status: Literal["complete", "incomplete"]
    result_ref: str = Field(min_length=1, max_length=512)
    artifact_refs: tuple[ArtifactRefV1, ...] = Field(default=(), exclude_if=lambda value: not value)


class ToolCallMessagePartFailedV1(ToolCallMessagePartBaseV1):
    status: Literal["failed"]
    error: PublicErrorV1


ToolCallMessagePartTerminalV1 = (
    ToolCallMessagePartCompletedInlineV1 | ToolCallMessagePartCompletedReferenceV1 | ToolCallMessagePartFailedV1
)


class MessagePartStartedDataV1(StrictProtocolSchema):
    message: ProjectedMessageShellV1
    part: Annotated[
        TextMessagePartStartedV1 | ToolCallMessagePartStartedV1,
        Field(discriminator="type"),
    ]


class MessagePartStartedEventV1(AgentEventEnvelopeV1):
    type: Literal["message.part.started"]
    data: MessagePartStartedDataV1


class TextAppendDeltaV1(StrictProtocolSchema):
    kind: Literal["text.append"]
    text: Annotated[VerbatimText, Field(min_length=1)]


class MessagePartDeltaDataV1(StrictProtocolSchema):
    message_id: str = Field(min_length=1, max_length=192)
    part_id: str = Field(min_length=1, max_length=192)
    delta: TextAppendDeltaV1


class MessagePartDeltaEventV1(AgentEventEnvelopeV1):
    type: Literal["message.part.delta"]
    data: MessagePartDeltaDataV1


class MessagePartCompletedDataV1(StrictProtocolSchema):
    message_id: str = Field(min_length=1, max_length=192)
    part: TextMessagePartCompletedV1 | ToolCallMessagePartTerminalV1


class MessagePartCompletedEventV1(AgentEventEnvelopeV1):
    type: Literal["message.part.completed"]
    data: MessagePartCompletedDataV1
