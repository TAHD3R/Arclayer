from __future__ import annotations

from typing import cast
from uuid import uuid4

import pytest

from src.common.types.json_types import JsonObject
from src.llm.runtime import LLMRequestContext
from src.modules.ai.agent_tool_grants import HUMAN_REQUEST_INPUT_TOOL, WORKSPACE_SKILL_CREATE_TOOL
from src.modules.ai.runtime_execution_gateway import (
    AgentRunExecutionCompleted,
    AgentRunExecutionInterrupted,
    AgentRunExecutionRequest,
    AgentRunResumeExecutionRequest,
)
from src.modules.ai.runtime_model_step_gateway import ModelToolAgentRunExecutionGateway
from src.modules.ai.runtime_skill_creator_tool import (
    AgentSkillCreatorToolExecutionRequest,
    AgentSkillCreatorToolResultV1,
)

pytestmark = pytest.mark.unit


class _SkillCreatorChatGateway:
    def __init__(self) -> None:
        self.calls: list[tuple[list[dict[str, str]], dict[str, object] | None]] = []

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        context: LLMRequestContext,
        model: str | None = None,
        provider_params: dict[str, object] | None = None,
    ) -> JsonObject:
        _ = context, model
        self.calls.append((messages, provider_params))
        if len(self.calls) == 1:
            return {
                "id": "completion-skill-tool-1",
                "model": "gpt-4o-mini",
                "content": "",
                "tool_calls": [
                    {
                        "id": "tool-call-skill-1",
                        "function": {
                            "name": "workspace_skill_create",
                            "arguments": (
                                '{"slug":"editorial-brief","displayName":"Editorial Brief",'
                                '"description":"Create an editorial brief.",'
                                '"instructions":"Collect inputs and produce the brief.",'
                                '"capabilityTags":["content.planning"]}'
                            ),
                        },
                    }
                ],
                "usage": {"prompt_tokens": 8, "completion_tokens": 4},
                "finish_reason": "tool_calls",
            }
        return {
            "id": "completion-skill-final-1",
            "model": "gpt-4o-mini",
            "content": "The workspace Skill is enabled.",
            "tool_calls": [],
            "usage": {"prompt_tokens": 12, "completion_tokens": 7},
            "finish_reason": "stop",
        }


class _SkillCreatorExecutor:
    def __init__(self) -> None:
        self.requests: list[AgentSkillCreatorToolExecutionRequest] = []

    async def execute(
        self,
        *,
        request: AgentSkillCreatorToolExecutionRequest,
    ) -> AgentSkillCreatorToolResultV1:
        self.requests.append(request)
        return AgentSkillCreatorToolResultV1(
            workspace_id=request.workspace_id,
            package_id=uuid4(),
            version_id=uuid4(),
            installation_id=uuid4(),
            status="enabled",
        )


def _request() -> AgentRunExecutionRequest:
    return AgentRunExecutionRequest(
        messages=({"role": "user", "content": "/skill-creator Create an editorial brief Skill."},),
        context=LLMRequestContext(
            workspace_id=uuid4(),
            project_id=uuid4(),
            agent_run_id=uuid4(),
            user_id=uuid4(),
            source="agent",
        ),
        execution_mode="build",
        tool_grants=(HUMAN_REQUEST_INPUT_TOOL, WORKSPACE_SKILL_CREATE_TOOL),
        model="gpt-4o-mini",
    )


@pytest.mark.asyncio
async def test_skill_creator_requires_approval_then_returns_created_installation() -> None:
    chat = _SkillCreatorChatGateway()
    executor = _SkillCreatorExecutor()
    gateway = ModelToolAgentRunExecutionGateway(chat_service=chat, skill_creator_executor=executor)
    request = _request()

    interrupted = await gateway.execute(request=request)

    assert isinstance(interrupted, AgentRunExecutionInterrupted)
    assert interrupted.reason == "approval_required"
    assert interrupted.tool_name == WORKSPACE_SKILL_CREATE_TOOL
    assert interrupted.approval is not None
    assert interrupted.approval.policy_version == "skill-creator-v1"
    assert interrupted.approval.risk.side_effect_class == "draft_write"
    assert executor.requests == []

    completed = await gateway.resume(
        request=AgentRunResumeExecutionRequest(
            **request.model_dump(),
            checkpoint_id="checkpoint-skill-creator-1",
            response_kind="approval",
            resume={"approved": True, "optionId": "allow_once", "reason": None},
            interrupted=interrupted,
        )
    )

    assert isinstance(completed, AgentRunExecutionCompleted)
    assert len(executor.requests) == 1
    assert completed.tool_completion is not None
    assert completed.tool_completion.tool_name == WORKSPACE_SKILL_CREATE_TOOL
    tool_result = cast(JsonObject, completed.tool_completion.result)
    assert tool_result["status"] == "enabled"
    assert completed.content == "The workspace Skill is enabled."
    provider_params = chat.calls[0][1]
    assert provider_params is not None
    tools = cast(list[dict[str, object]], provider_params["tools"])
    provider_names = {cast(dict[str, object], tool["function"])["name"] for tool in tools}
    assert provider_names == {"human_request_input", "workspace_skill_create"}


@pytest.mark.asyncio
async def test_rejected_skill_creator_approval_does_not_write_workspace_skill() -> None:
    chat = _SkillCreatorChatGateway()
    executor = _SkillCreatorExecutor()
    gateway = ModelToolAgentRunExecutionGateway(chat_service=chat, skill_creator_executor=executor)
    request = _request()
    interrupted = await gateway.execute(request=request)
    assert isinstance(interrupted, AgentRunExecutionInterrupted)

    completed = await gateway.resume(
        request=AgentRunResumeExecutionRequest(
            **request.model_dump(),
            checkpoint_id="checkpoint-skill-creator-rejected",
            response_kind="approval",
            resume={"approved": False, "optionId": "reject_once", "reason": "Revise the workflow."},
            interrupted=interrupted,
        )
    )

    assert isinstance(completed, AgentRunExecutionCompleted)
    assert executor.requests == []
    assert completed.tool_completion is not None
    assert completed.tool_completion.result == {
        "approved": False,
        "code": "AGENT_APPROVAL_REJECTED",
        "reason": "Revise the workflow.",
    }


@pytest.mark.asyncio
async def test_skill_creator_provider_tool_is_not_exposed_without_its_grant() -> None:
    chat = _SkillCreatorChatGateway()
    request = _request().model_copy(update={"tool_grants": (HUMAN_REQUEST_INPUT_TOOL,)})
    gateway = ModelToolAgentRunExecutionGateway(
        chat_service=chat,
        skill_creator_executor=_SkillCreatorExecutor(),
    )

    with pytest.raises(ValueError, match="unsupported Tool call"):
        await gateway.execute(request=request)

    provider_params = chat.calls[0][1]
    assert provider_params is not None
    tools = cast(list[dict[str, object]], provider_params["tools"])
    assert [cast(dict[str, object], tool["function"])["name"] for tool in tools] == ["human_request_input"]
