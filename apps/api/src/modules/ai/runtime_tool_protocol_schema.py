from __future__ import annotations

import math
from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from src.common.types.json_types import JsonObject, JsonValue
from src.modules.ai.runtime_protocol_schema import (
    AgentEventEnvelopeV1,
    ArtifactRefV1,
    CanonicalToolArgsV1,
    PublicErrorV1,
    StrictProtocolSchema,
    _require_utc,
)


class ToolEventEnvelopeV1(AgentEventEnvelopeV1):
    @model_validator(mode="after")
    def require_tool_spans(self) -> Self:
        if self.span_id is None or self.parent_span_id is None:
            raise ValueError("Tool events require spanId and parentSpanId")
        return self


class ToolStartedDataV1(CanonicalToolArgsV1):
    message_id: str = Field(min_length=1, max_length=192)
    part_id: str = Field(min_length=1, max_length=192)
    tool_call_id: str = Field(min_length=1, max_length=192)
    tool_id: str = Field(min_length=1, max_length=192)
    tool_version: str = Field(min_length=1, max_length=96)
    tool_name: str = Field(min_length=1, max_length=192)
    started_at: datetime

    @model_validator(mode="after")
    def require_utc_started_at(self) -> Self:
        _require_utc(self.started_at, field_alias="startedAt")
        return self


class ToolStartedEventV1(ToolEventEnvelopeV1):
    type: Literal["tool.started"]
    data: ToolStartedDataV1


NonNegativeNumber = Annotated[int | float, Field(ge=0)]


class ToolProgressV1(StrictProtocolSchema):
    message_key: str = Field(min_length=1, max_length=256)
    message_params: JsonObject
    current: NonNegativeNumber | None = Field(default=None, exclude_if=lambda value: value is None)
    total: NonNegativeNumber | None = Field(default=None, exclude_if=lambda value: value is None)
    unit: str | None = Field(default=None, min_length=1, max_length=96, exclude_if=lambda value: value is None)

    @model_validator(mode="after")
    def require_finite_progress(self) -> Self:
        if any(value is not None and not math.isfinite(value) for value in (self.current, self.total)):
            raise ValueError("Tool progress values must be finite")
        return self


class ToolProgressDataV1(StrictProtocolSchema):
    tool_call_id: str = Field(min_length=1, max_length=192)
    progress: ToolProgressV1


class ToolProgressEventV1(ToolEventEnvelopeV1):
    type: Literal["tool.progress"]
    data: ToolProgressDataV1


class ToolCompletedDataBaseV1(StrictProtocolSchema):
    tool_call_id: str = Field(min_length=1, max_length=192)
    completed_at: datetime
    artifact_refs: tuple[ArtifactRefV1, ...] = Field(default=(), exclude_if=lambda value: not value)

    @model_validator(mode="after")
    def require_utc_completed_at(self) -> Self:
        _require_utc(self.completed_at, field_alias="completedAt")
        return self


class ToolCompletedInlineDataV1(ToolCompletedDataBaseV1):
    result: JsonValue


class ToolCompletedReferenceDataV1(ToolCompletedDataBaseV1):
    result_ref: str = Field(min_length=1, max_length=512)


class ToolCompletedEventV1(ToolEventEnvelopeV1):
    type: Literal["tool.completed"]
    data: ToolCompletedInlineDataV1 | ToolCompletedReferenceDataV1


class ToolFailedDataV1(StrictProtocolSchema):
    tool_call_id: str = Field(min_length=1, max_length=192)
    failed_at: datetime
    error: PublicErrorV1

    @model_validator(mode="after")
    def require_utc_failed_at(self) -> Self:
        _require_utc(self.failed_at, field_alias="failedAt")
        return self


class ToolFailedEventV1(ToolEventEnvelopeV1):
    type: Literal["tool.failed"]
    data: ToolFailedDataV1
