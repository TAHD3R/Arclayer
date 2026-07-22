from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from src.common.types.json_types import JsonValue
from src.common.types.public_uuid import PublicUUID
from src.modules.ai.runtime_protocol_schema import StrictProtocolSchema


class AgentToolResponseRequestBaseV1(StrictProtocolSchema):
    checkpoint_id: str = Field(min_length=1, max_length=192)


class AgentApprovalResponseRequestV1(AgentToolResponseRequestBaseV1):
    kind: Literal["approval"]
    approval_id: str = Field(min_length=1, max_length=192)
    approval_version: int = Field(ge=1)
    approved: bool
    option_id: str | None = Field(default=None, min_length=1, max_length=192)
    reason: str | None = Field(default=None, max_length=1000)


class AgentHumanToolResultRequestV1(AgentToolResponseRequestBaseV1):
    kind: Literal["human_result"]
    result: JsonValue


AgentToolResponseRequestV1 = Annotated[
    AgentApprovalResponseRequestV1 | AgentHumanToolResultRequestV1,
    Field(discriminator="kind"),
]


class AgentToolResponseV1(StrictProtocolSchema):
    protocol_version: Literal[1] = 1
    response_id: PublicUUID
    tool_call_id: str
    checkpoint_id: str
    response_kind: Literal["approval", "human_result"]
    expected_sequence: int = Field(ge=1)


class ResumeAgentRunRequestV1(StrictProtocolSchema):
    response_id: PublicUUID
    checkpoint_id: str = Field(min_length=1, max_length=192)
    expected_sequence: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=192)


class AgentRunCommandResponseV1(StrictProtocolSchema):
    protocol_version: Literal[1] = 1
    run_id: PublicUUID
    status: Literal["queued", "running"]
    last_sequence: int = Field(ge=1)
    last_cursor: str
