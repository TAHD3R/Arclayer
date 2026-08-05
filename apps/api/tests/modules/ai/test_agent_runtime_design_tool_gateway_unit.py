from __future__ import annotations

from typing import cast
from uuid import uuid4

import pytest

from src.common.types.json_types import JsonObject
from src.common.utils.public_ids import encode_uuid
from src.llm.runtime import LLMRequestContext
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextV1
from src.modules.ai.agent_tool_grants import BUILDER_DESIGN_GENERATE_TOOL, HUMAN_REQUEST_INPUT_TOOL
from src.modules.ai.runtime_design_tool import AgentDesignToolExecutionRequest, AgentDesignToolResultV1
from src.modules.ai.runtime_execution_gateway import (
    AgentRunChatGateway,
    AgentRunExecutionCompleted,
    AgentRunExecutionInterrupted,
    AgentRunExecutionRequest,
    AgentRunResumeExecutionRequest,
)
from src.modules.ai.runtime_model_step_gateway import ModelToolAgentRunExecutionGateway

pytestmark = pytest.mark.unit

PAGE_ID = uuid4()


class _ChatGateway:
    def __init__(self) -> None:
        self.calls: list[dict[str, object] | None] = []

    async def chat(
        self,
        _messages: list[dict[str, str]],
        *,
        context: LLMRequestContext,
        model: str | None = None,
        provider_params: dict[str, object] | None = None,
    ) -> JsonObject:
        _ = context, model
        self.calls.append(provider_params)
        if len(self.calls) == 1:
            return {
                "id": "design-tool-call",
                "model": "gpt-4o-mini",
                "content": "",
                "tool_calls": [
                    {
                        "id": "tool-call-design-1",
                        "function": {
                            "name": "builder_design_generate",
                            "arguments": (
                                f'{{"pageItemId":"{PAGE_ID}",'
                                '"objective":"Create two restrained visual directions.",'
                                '"locale":"en-US","candidateCount":2}'
                            ),
                        },
                    }
                ],
                "usage": {"prompt_tokens": 8, "completion_tokens": 4},
                "finish_reason": "tool_calls",
            }
        return {
            "id": "design-tool-complete",
            "model": "gpt-4o-mini",
            "content": "Two Design directions are queued for review.",
            "tool_calls": [],
            "usage": {"prompt_tokens": 10, "completion_tokens": 6},
            "finish_reason": "stop",
        }


class _Executor:
    def __init__(self) -> None:
        self.requests: list[AgentDesignToolExecutionRequest] = []

    async def execute(self, *, request: AgentDesignToolExecutionRequest) -> AgentDesignToolResultV1:
        self.requests.append(request)
        return AgentDesignToolResultV1(
            generation_id=uuid4(),
            job_id=uuid4(),
            project_id=request.project_id,
            base_revision_id=request.builder_context.site_revision_id,
            selected_page_id=request.args.page_item_id,
            status="queued",
        )


@pytest.mark.asyncio
async def test_design_tool_requires_approval_then_returns_durable_generation_reference() -> None:
    chat, executor = _ChatGateway(), _Executor()
    gateway = ModelToolAgentRunExecutionGateway(
        chat_service=cast(AgentRunChatGateway, chat),
        design_executor=executor,
    )
    request = _request()

    interrupted = await gateway.execute(request=request)

    assert isinstance(interrupted, AgentRunExecutionInterrupted)
    assert interrupted.tool_name == BUILDER_DESIGN_GENERATE_TOOL
    assert interrupted.approval is not None
    assert interrupted.approval.policy_version == "design-generation-v1"
    assert executor.requests == []
    completed = await gateway.resume(
        request=AgentRunResumeExecutionRequest(
            **request.model_dump(exclude={"builder_context"}),
            builder_context=request.builder_context,
            checkpoint_id="checkpoint-design-1",
            response_kind="approval",
            resume={"approved": True, "optionId": "allow_once", "reason": None},
            interrupted=interrupted,
        )
    )

    assert isinstance(completed, AgentRunExecutionCompleted)
    assert len(executor.requests) == 1
    assert completed.tool_completion is not None
    result = completed.tool_completion.result
    assert isinstance(result, dict)
    assert result["targetStage"] == "design"
    assert result["selectedPageId"] == encode_uuid(PAGE_ID)


def _request() -> AgentRunExecutionRequest:
    workspace_id, project_id, revision_id = uuid4(), uuid4(), uuid4()
    return AgentRunExecutionRequest(
        messages=({"role": "user", "content": "Create Design directions for the homepage."},),
        context=LLMRequestContext(
            workspace_id=workspace_id,
            capability_key="ai.agents",
            project_id=project_id,
            agent_run_id=uuid4(),
            user_id=uuid4(),
            source="agent",
        ),
        execution_mode="build",
        tool_grants=(HUMAN_REQUEST_INPUT_TOOL, BUILDER_DESIGN_GENERATE_TOOL),
        builder_context=AgentRunBuilderContextV1.model_construct(
            workspace_id=workspace_id,
            project_id=project_id,
            site_revision_id=revision_id,
        ),
        model="gpt-4o-mini",
    )
