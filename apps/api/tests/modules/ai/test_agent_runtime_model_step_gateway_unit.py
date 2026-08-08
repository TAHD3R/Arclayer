from __future__ import annotations

from typing import cast
from uuid import uuid4

import pytest

from src.common.types.json_types import JsonObject
from src.llm.runtime import LLMRequestContext
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextV1
from src.modules.ai.agent_design_system_context_schema import AgentRunDesignSystemContextV1
from src.modules.ai.agent_tool_grants import (
    BUILDER_STYLE_GUIDE_GENERATE_TOOL,
    BUILDER_WIREFRAME_GENERATE_TOOL,
    HUMAN_REQUEST_INPUT_TOOL,
)
from src.modules.ai.runtime_execution_gateway import (
    AgentRunExecutionCompleted,
    AgentRunExecutionInterrupted,
    AgentRunExecutionRequest,
    AgentRunResumeExecutionRequest,
)
from src.modules.ai.runtime_model_step_gateway import ModelToolAgentRunExecutionGateway
from src.modules.ai.runtime_style_guide_tool import (
    AgentStyleGuideToolExecutionRequest,
    AgentStyleGuideToolResultV1,
)
from src.modules.ai.runtime_wireframe_tool import (
    AgentWireframeToolExecutionRequest,
    AgentWireframeToolResultV1,
)

pytestmark = pytest.mark.unit


class _ChatGateway:
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
                "id": "completion-tool-1",
                "model": "gpt-4o-mini",
                "content": "",
                "tool_calls": [
                    {
                        "id": "tool-call-audience-1",
                        "function": {
                            "name": "human_request_input",
                            "arguments": (
                                '{"question":"Who is the primary audience?",'
                                '"responseType":"single_select","options":["Design teams","Developers"]}'
                            ),
                        },
                    }
                ],
                "usage": {"prompt_tokens": 8, "completion_tokens": 4},
                "finish_reason": "tool_calls",
            }
        return {
            "id": "completion-final-1",
            "model": "gpt-4o-mini",
            "content": "The homepage is planned for design teams.",
            "tool_calls": [],
            "usage": {"prompt_tokens": 12, "completion_tokens": 7},
            "finish_reason": "stop",
        }


class _StyleGuideChatGateway:
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
                "id": "completion-style-tool-1",
                "model": "gpt-4o-mini",
                "content": "",
                "tool_calls": [
                    {
                        "id": "tool-call-style-guide-1",
                        "function": {
                            "name": "builder_style_guide_generate",
                            "arguments": (
                                '{"objective":"Create two editorial directions.","locale":"en-US","candidateCount":2}'
                            ),
                        },
                    }
                ],
                "usage": {"prompt_tokens": 8, "completion_tokens": 4},
                "finish_reason": "tool_calls",
            }
        return {
            "id": "completion-style-final-1",
            "model": "gpt-4o-mini",
            "content": "Two Style Guide concepts are queued for review.",
            "tool_calls": [],
            "usage": {"prompt_tokens": 12, "completion_tokens": 7},
            "finish_reason": "stop",
        }


class _StyleGuideExecutor:
    def __init__(self) -> None:
        self.requests: list[AgentStyleGuideToolExecutionRequest] = []

    async def execute(
        self,
        *,
        request: AgentStyleGuideToolExecutionRequest,
    ) -> AgentStyleGuideToolResultV1:
        self.requests.append(request)
        return AgentStyleGuideToolResultV1(
            generation_id=uuid4(),
            job_id=uuid4(),
            project_id=request.project_id,
            design_system_id=request.design_system_context.design_system_id,
            base_version_id=request.design_system_context.version_id,
            base_revision_id=request.builder_context.site_revision_id,
            status="queued",
        )


class _ToolPolicyAuthorizer:
    async def authorize(self, *, tool_id: str) -> None:
        _ = tool_id


class _WireframeChatGateway:
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
                "id": "completion-wireframe-tool-1",
                "model": "gpt-4o-mini",
                "content": "",
                "tool_calls": [
                    {
                        "id": "tool-call-wireframe-1",
                        "function": {
                            "name": "builder_wireframe_generate",
                            "arguments": (
                                '{"pageItemId":"' + str(_WIRE_PAGE_ID) + '",'
                                '"objective":"Create two conversion-focused compositions.",'
                                '"locale":"en-US","candidateCount":2}'
                            ),
                        },
                    }
                ],
                "usage": {"prompt_tokens": 8, "completion_tokens": 4},
                "finish_reason": "tool_calls",
            }
        return {
            "id": "completion-wireframe-final-1",
            "model": "gpt-4o-mini",
            "content": "Two Wireframe candidates are queued for review.",
            "tool_calls": [],
            "usage": {"prompt_tokens": 12, "completion_tokens": 7},
            "finish_reason": "stop",
        }


class _WireframeExecutor:
    def __init__(self) -> None:
        self.requests: list[AgentWireframeToolExecutionRequest] = []

    async def execute(
        self,
        *,
        request: AgentWireframeToolExecutionRequest,
    ) -> AgentWireframeToolResultV1:
        self.requests.append(request)
        return AgentWireframeToolResultV1(
            generation_id=uuid4(),
            job_id=uuid4(),
            project_id=request.project_id,
            base_revision_id=request.builder_context.site_revision_id,
            target_stage="wireframe",
            selected_page_id=request.args.page_item_id,
            status="queued",
        )


_WIRE_PAGE_ID = uuid4()


@pytest.mark.asyncio
async def test_model_step_turns_function_call_into_human_interrupt_and_consumes_result() -> None:
    chat = _ChatGateway()
    gateway = ModelToolAgentRunExecutionGateway(chat_service=chat)
    request = AgentRunExecutionRequest(
        messages=({"role": "user", "content": "Build a homepage."},),
        context=LLMRequestContext(
            workspace_id=uuid4(),
            capability_key="ai.agents",
            project_id=uuid4(),
            agent_run_id=uuid4(),
            user_id=uuid4(),
            source="agent",
        ),
        execution_mode="plan",
        tool_grants=(HUMAN_REQUEST_INPUT_TOOL,),
        model="gpt-4o-mini",
    )

    interrupted = await gateway.execute(request=request)

    assert isinstance(interrupted, AgentRunExecutionInterrupted)
    repeated = await ModelToolAgentRunExecutionGateway(chat_service=_ChatGateway()).execute(request=request)
    assert isinstance(repeated, AgentRunExecutionInterrupted)
    assert interrupted.tool_call_id != "tool-call-audience-1"
    assert repeated.tool_call_id != interrupted.tool_call_id
    assert interrupted.tool_name == "human.request_input"
    assert interrupted.args["responseType"] == "single_select"
    completed = await gateway.resume(
        request=AgentRunResumeExecutionRequest(
            **request.model_dump(),
            checkpoint_id="checkpoint-audience-1",
            response_kind="human_result",
            resume={"result": {"audience": "Design teams"}},
            interrupted=interrupted,
        )
    )

    assert isinstance(completed, AgentRunExecutionCompleted)
    assert completed.content == "The homepage is planned for design teams."
    assert chat.calls[0][1] is not None
    assert chat.calls[1][1] == {
        "tools": [],
        "tool_choice": "none",
        "response_format": {"type": "text"},
    }
    resumed_messages = chat.calls[1][0]
    assert resumed_messages[-1]["role"] == "user"
    assert '"audience":"Design teams"' in resumed_messages[-1]["content"]
    assert "without asking that question again" in resumed_messages[-1]["content"]
    assert all("tool_calls" not in message for message in resumed_messages)


@pytest.mark.asyncio
async def test_style_guide_tool_requires_approval_then_returns_durable_generation_reference() -> None:
    chat = _StyleGuideChatGateway()
    executor = _StyleGuideExecutor()
    gateway = ModelToolAgentRunExecutionGateway(
        chat_service=chat,
        style_guide_executor=executor,
        tool_policy_authorizer=_ToolPolicyAuthorizer(),
    )
    request = _style_guide_request()

    interrupted = await gateway.execute(request=request)

    assert isinstance(interrupted, AgentRunExecutionInterrupted)
    assert interrupted.reason == "approval_required"
    assert interrupted.tool_name == BUILDER_STYLE_GUIDE_GENERATE_TOOL
    assert interrupted.approval is not None
    assert interrupted.approval.risk.side_effect_class == "draft_write"
    assert interrupted.approval.risk.summary_params["candidateCount"] == 2
    assert executor.requests == []

    completed = await gateway.resume(
        request=AgentRunResumeExecutionRequest(
            **request.model_dump(exclude={"design_system_context", "builder_context"}),
            design_system_context=request.design_system_context,
            builder_context=request.builder_context,
            checkpoint_id="checkpoint-style-guide-1",
            response_kind="approval",
            resume={"approved": True, "optionId": "allow_once", "reason": None},
            interrupted=interrupted,
        )
    )

    assert isinstance(completed, AgentRunExecutionCompleted)
    assert len(executor.requests) == 1
    assert completed.tool_completion is not None
    assert completed.tool_completion.tool_name == BUILDER_STYLE_GUIDE_GENERATE_TOOL
    tool_result = completed.tool_completion.result
    assert isinstance(tool_result, dict)
    assert tool_result["status"] == "queued"
    assert completed.content == "Two Style Guide concepts are queued for review."
    first_tools = chat.calls[0][1]
    assert first_tools is not None
    tools = first_tools["tools"]
    assert isinstance(tools, list)
    provider_names: set[str] = set()
    for tool in tools:
        assert isinstance(tool, dict)
        function = cast(dict[str, object], tool).get("function")
        assert isinstance(function, dict)
        name = cast(dict[str, object], function).get("name")
        assert isinstance(name, str)
        provider_names.add(name)
    assert provider_names == {"human_request_input", "builder_style_guide_generate"}


@pytest.mark.asyncio
async def test_rejected_style_guide_approval_does_not_create_generation() -> None:
    chat = _StyleGuideChatGateway()
    executor = _StyleGuideExecutor()
    gateway = ModelToolAgentRunExecutionGateway(
        chat_service=chat,
        style_guide_executor=executor,
    )
    request = _style_guide_request()
    interrupted = await gateway.execute(request=request)
    assert isinstance(interrupted, AgentRunExecutionInterrupted)

    completed = await gateway.resume(
        request=AgentRunResumeExecutionRequest(
            **request.model_dump(exclude={"design_system_context", "builder_context"}),
            design_system_context=request.design_system_context,
            builder_context=request.builder_context,
            checkpoint_id="checkpoint-style-guide-rejected",
            response_kind="approval",
            resume={"approved": False, "optionId": "reject_once", "reason": "Keep the current direction."},
            interrupted=interrupted,
        )
    )

    assert isinstance(completed, AgentRunExecutionCompleted)
    assert executor.requests == []
    assert completed.tool_completion is not None
    result = completed.tool_completion.result
    assert isinstance(result, dict)
    assert result == {
        "approved": False,
        "code": "AGENT_APPROVAL_REJECTED",
        "reason": "Keep the current direction.",
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("execution_mode", "tool_grants"),
    [
        ("plan", (HUMAN_REQUEST_INPUT_TOOL, BUILDER_STYLE_GUIDE_GENERATE_TOOL)),
        ("build", (HUMAN_REQUEST_INPUT_TOOL,)),
    ],
)
async def test_style_guide_tool_is_rejected_when_run_mode_or_grant_is_missing(
    execution_mode: str,
    tool_grants: tuple[str, ...],
) -> None:
    request = _style_guide_request().model_copy(update={"execution_mode": execution_mode, "tool_grants": tool_grants})
    chat = _StyleGuideChatGateway()
    gateway = ModelToolAgentRunExecutionGateway(
        chat_service=chat,
        style_guide_executor=_StyleGuideExecutor(),
    )

    with pytest.raises(ValueError, match="unsupported Tool call"):
        await gateway.execute(request=request)

    provider_params = chat.calls[0][1]
    assert provider_params is not None
    tools = provider_params["tools"]
    assert isinstance(tools, list)
    assert len(tools) == 1


@pytest.mark.asyncio
async def test_wireframe_tool_requires_approval_then_returns_durable_generation_reference() -> None:
    chat = _WireframeChatGateway()
    executor = _WireframeExecutor()
    gateway = ModelToolAgentRunExecutionGateway(
        chat_service=chat,
        wireframe_executor=executor,
        tool_policy_authorizer=_ToolPolicyAuthorizer(),
    )
    request = _wireframe_request()

    interrupted = await gateway.execute(request=request)

    assert isinstance(interrupted, AgentRunExecutionInterrupted)
    assert interrupted.reason == "approval_required"
    assert interrupted.tool_name == BUILDER_WIREFRAME_GENERATE_TOOL
    assert interrupted.approval is not None
    assert interrupted.approval.policy_version == "wireframe-generation-v1"
    assert interrupted.approval.risk.side_effect_class == "draft_write"
    assert interrupted.approval.risk.summary_params["pageItemId"] == interrupted.args["pageItemId"]
    assert executor.requests == []

    completed = await gateway.resume(
        request=AgentRunResumeExecutionRequest(
            **request.model_dump(exclude={"design_system_context", "builder_context"}),
            design_system_context=request.design_system_context,
            builder_context=request.builder_context,
            checkpoint_id="checkpoint-wireframe-1",
            response_kind="approval",
            resume={"approved": True, "optionId": "allow_once", "reason": None},
            interrupted=interrupted,
        )
    )

    assert isinstance(completed, AgentRunExecutionCompleted)
    assert len(executor.requests) == 1
    assert completed.tool_completion is not None
    assert completed.tool_completion.tool_name == BUILDER_WIREFRAME_GENERATE_TOOL
    tool_result = completed.tool_completion.result
    assert isinstance(tool_result, dict)
    assert tool_result["targetStage"] == "wireframe"
    assert tool_result["selectedPageId"] == interrupted.args["pageItemId"]
    assert tool_result["status"] == "queued"
    assert completed.content == "Two Wireframe candidates are queued for review."
    first_provider_params = chat.calls[0][1]
    assert first_provider_params is not None
    tools = first_provider_params["tools"]
    assert isinstance(tools, list)
    provider_names = {cast(dict[str, object], cast(dict[str, object], tool)["function"])["name"] for tool in tools}
    assert provider_names == {
        "human_request_input",
        "builder_style_guide_generate",
        "builder_wireframe_generate",
    }


@pytest.mark.asyncio
async def test_rejected_wireframe_approval_does_not_create_generation() -> None:
    chat = _WireframeChatGateway()
    executor = _WireframeExecutor()
    gateway = ModelToolAgentRunExecutionGateway(chat_service=chat, wireframe_executor=executor)
    request = _wireframe_request()
    interrupted = await gateway.execute(request=request)
    assert isinstance(interrupted, AgentRunExecutionInterrupted)

    completed = await gateway.resume(
        request=AgentRunResumeExecutionRequest(
            **request.model_dump(exclude={"design_system_context", "builder_context"}),
            design_system_context=request.design_system_context,
            builder_context=request.builder_context,
            checkpoint_id="checkpoint-wireframe-rejected",
            response_kind="approval",
            resume={"approved": False, "optionId": "reject_once", "reason": "Keep the current composition."},
            interrupted=interrupted,
        )
    )

    assert isinstance(completed, AgentRunExecutionCompleted)
    assert executor.requests == []
    assert completed.tool_completion is not None
    assert completed.tool_completion.result == {
        "approved": False,
        "code": "AGENT_APPROVAL_REJECTED",
        "reason": "Keep the current composition.",
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("execution_mode", "tool_grants", "expected_tool_count"),
    [
        (
            "plan",
            (
                HUMAN_REQUEST_INPUT_TOOL,
                BUILDER_STYLE_GUIDE_GENERATE_TOOL,
                BUILDER_WIREFRAME_GENERATE_TOOL,
            ),
            1,
        ),
        ("build", (HUMAN_REQUEST_INPUT_TOOL, BUILDER_STYLE_GUIDE_GENERATE_TOOL), 2),
    ],
)
async def test_wireframe_tool_is_rejected_when_run_mode_or_grant_is_missing(
    execution_mode: str,
    tool_grants: tuple[str, ...],
    expected_tool_count: int,
) -> None:
    request = _wireframe_request().model_copy(update={"execution_mode": execution_mode, "tool_grants": tool_grants})
    chat = _WireframeChatGateway()
    gateway = ModelToolAgentRunExecutionGateway(
        chat_service=chat,
        wireframe_executor=_WireframeExecutor(),
    )

    with pytest.raises(ValueError, match="unsupported Tool call"):
        await gateway.execute(request=request)

    provider_params = chat.calls[0][1]
    assert provider_params is not None
    tools = provider_params["tools"]
    assert isinstance(tools, list)
    assert len(tools) == expected_tool_count


def _style_guide_request() -> AgentRunExecutionRequest:
    workspace_id = uuid4()
    project_id = uuid4()
    design_system_id = uuid4()
    version_id = uuid4()
    revision_id = uuid4()
    return AgentRunExecutionRequest(
        messages=({"role": "user", "content": "Create a Style Guide."},),
        context=LLMRequestContext(
            workspace_id=workspace_id,
            capability_key="ai.agents",
            project_id=project_id,
            agent_run_id=uuid4(),
            user_id=uuid4(),
            source="agent",
        ),
        execution_mode="build",
        tool_grants=(HUMAN_REQUEST_INPUT_TOOL, BUILDER_STYLE_GUIDE_GENERATE_TOOL),
        design_system_context=AgentRunDesignSystemContextV1.model_construct(
            project_id=project_id,
            design_system_id=design_system_id,
            version_id=version_id,
        ),
        builder_context=AgentRunBuilderContextV1.model_construct(
            workspace_id=workspace_id,
            project_id=project_id,
            site_revision_id=revision_id,
        ),
        model="gpt-4o-mini",
    )


def _wireframe_request() -> AgentRunExecutionRequest:
    request = _style_guide_request()
    return request.model_copy(
        update={
            "messages": ({"role": "user", "content": "Create Wireframes for the homepage."},),
            "tool_grants": (
                HUMAN_REQUEST_INPUT_TOOL,
                BUILDER_STYLE_GUIDE_GENERATE_TOOL,
                BUILDER_WIREFRAME_GENERATE_TOOL,
            ),
        }
    )
