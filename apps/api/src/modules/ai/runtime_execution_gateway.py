from __future__ import annotations

from typing import Annotated, Literal, Protocol

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject, JsonValue
from src.llm.runtime import LLMRequestContext
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextV1
from src.modules.ai.agent_design_system_context_schema import AgentRunDesignSystemContextV1
from src.modules.ai.runtime_approval_protocol_schema import ApprovalV1


class AgentRunChatUsage(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    prompt_tokens: int = Field(ge=0)
    completion_tokens: int = Field(ge=0)


class AgentRunToolCompletion(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    tool_call_id: str = Field(min_length=1, max_length=192)
    tool_id: str = Field(min_length=1, max_length=192)
    tool_version: str = Field(min_length=1, max_length=96)
    tool_name: str = Field(min_length=1, max_length=192)
    args: JsonObject
    result: JsonValue


class AgentRunExecutionCompleted(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["completed"] = "completed"
    completion_id: str = Field(min_length=1, max_length=192)
    model: str = Field(min_length=1, max_length=192)
    content: str
    usage: AgentRunChatUsage
    finish_reason: str = Field(min_length=1, max_length=96)
    tool_completion: AgentRunToolCompletion | None = None


class AgentRunExecutionInterrupted(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["interrupted"] = "interrupted"
    interrupt_id: str = Field(min_length=1, max_length=192)
    checkpoint_id: str = Field(min_length=1, max_length=192)
    reason: Literal["approval_required", "human_tool_input"]
    tool_call_id: str = Field(min_length=1, max_length=192)
    tool_id: str = Field(min_length=1, max_length=192)
    tool_version: str = Field(min_length=1, max_length=96)
    tool_name: str = Field(min_length=1, max_length=192)
    args: JsonObject
    approval: ApprovalV1 | None = None

    @model_validator(mode="after")
    def require_reason_specific_approval(self) -> AgentRunExecutionInterrupted:
        if self.reason == "approval_required":
            if (
                self.approval is None
                or self.approval.tool_call_id != self.tool_call_id
                or self.approval.checkpoint_id != self.checkpoint_id
            ):
                raise ValueError("approval interrupts require matching approval metadata")
            return self
        if self.approval is not None:
            raise ValueError("human Tool interrupts cannot carry approval metadata")
        return self


class AgentRunExecutionRejected(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["rejected"] = "rejected"
    error_code: str = Field(min_length=1, max_length=192)
    message: str = Field(min_length=1, max_length=4000)


AgentRunExecutionOutcome = Annotated[
    AgentRunExecutionCompleted | AgentRunExecutionInterrupted | AgentRunExecutionRejected,
    Field(discriminator="kind"),
]


class AgentRunExecutionRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    messages: tuple[dict[str, str], ...]
    context: LLMRequestContext
    execution_mode: Literal["plan", "build"]
    tool_grants: tuple[str, ...]
    design_system_context: AgentRunDesignSystemContextV1 | None = None
    builder_context: AgentRunBuilderContextV1 | None = None
    model: str | None = None


class AgentRunResumeExecutionRequest(AgentRunExecutionRequest):
    checkpoint_id: str = Field(min_length=1, max_length=192)
    response_kind: Literal["approval", "human_result"]
    resume: JsonObject
    interrupted: AgentRunExecutionInterrupted | None = None


class AgentRunExecutionGateway(Protocol):
    async def execute(self, *, request: AgentRunExecutionRequest) -> AgentRunExecutionOutcome: ...

    async def resume(self, *, request: AgentRunResumeExecutionRequest) -> AgentRunExecutionOutcome: ...


class AgentRunChatGateway(Protocol):
    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        context: LLMRequestContext,
        model: str | None = None,
        provider_params: dict[str, object] | None = None,
    ) -> JsonObject: ...


class SingleTurnAgentRunExecutionGateway:
    """Explicit single-turn gateway retained until the LangGraph gateway owns production composition."""

    def __init__(self, *, chat_service: AgentRunChatGateway) -> None:
        self._chat_service = chat_service

    async def execute(self, *, request: AgentRunExecutionRequest) -> AgentRunExecutionOutcome:
        payload = await self._chat_service.chat(
            list(request.messages),
            context=request.context,
            model=request.model,
        )
        usage = payload.get("usage")
        return AgentRunExecutionCompleted(
            completion_id=str(payload.get("id") or ""),
            model=str(payload.get("model") or ""),
            content=str(payload.get("content") or ""),
            usage=AgentRunChatUsage.model_validate(usage),
            finish_reason=str(payload.get("finish_reason") or ""),
        )

    async def resume(self, *, request: AgentRunResumeExecutionRequest) -> AgentRunExecutionOutcome:
        _ = request
        raise RuntimeError("The single-turn Agent gateway cannot resume a durable LangGraph checkpoint")
