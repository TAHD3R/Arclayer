from __future__ import annotations

from uuid import uuid4

import pytest

from src.agents.checkpointing import memory_agent_checkpointer
from src.llm.runtime import LLMRequestContext
from src.modules.ai.runtime_execution_gateway import (
    AgentRunChatUsage,
    AgentRunExecutionCompleted,
    AgentRunExecutionInterrupted,
    AgentRunExecutionRequest,
    AgentRunResumeExecutionRequest,
)
from src.modules.ai.runtime_langgraph_gateway import LangGraphAgentRunExecutionGateway

pytestmark = pytest.mark.unit


class _InterruptingStepGateway:
    def __init__(self) -> None:
        self.execute_requests: list[AgentRunExecutionRequest] = []
        self.resume_requests: list[AgentRunResumeExecutionRequest] = []

    async def execute(self, *, request: AgentRunExecutionRequest) -> AgentRunExecutionInterrupted:
        self.execute_requests.append(request)
        return AgentRunExecutionInterrupted(
            interrupt_id="placeholder-interrupt",
            checkpoint_id="placeholder-checkpoint",
            reason="human_tool_input",
            tool_call_id="tool-call-audience-1",
            tool_id="human.request_input",
            tool_version="1",
            tool_name="human.request_input",
            args={"questionKey": "agents.questions.chooseAudience"},
        )

    async def resume(self, *, request: AgentRunResumeExecutionRequest) -> AgentRunExecutionCompleted:
        self.resume_requests.append(request)
        return AgentRunExecutionCompleted(
            completion_id="completion-after-human-1",
            model="gpt-4o-mini",
            content="The site is now tailored for design teams.",
            usage=AgentRunChatUsage(prompt_tokens=14, completion_tokens=9),
            finish_reason="stop",
        )


@pytest.mark.asyncio
async def test_langgraph_gateway_checkpoints_interrupt_and_resumes_without_reexecuting_step() -> None:
    step = _InterruptingStepGateway()
    gateway = LangGraphAgentRunExecutionGateway(
        step_gateway=step,
        checkpointer_factory=memory_agent_checkpointer,
    )
    run_id = uuid4()
    request = AgentRunExecutionRequest(
        messages=({"role": "user", "content": "Build a portfolio."},),
        context=LLMRequestContext(
            workspace_id=uuid4(),
            project_id=uuid4(),
            agent_run_id=run_id,
            user_id=uuid4(),
            source="agent",
        ),
        execution_mode="plan",
        tool_grants=("human.request_input",),
        model="gpt-4o-mini",
    )

    interrupted = await gateway.execute(request=request)

    assert isinstance(interrupted, AgentRunExecutionInterrupted)
    assert interrupted.interrupt_id != "placeholder-interrupt"
    assert interrupted.checkpoint_id != "placeholder-checkpoint"
    completed = await gateway.resume(
        request=AgentRunResumeExecutionRequest(
            **request.model_dump(),
            checkpoint_id=interrupted.checkpoint_id,
            response_kind="human_result",
            resume={"result": {"audience": "design teams"}},
        )
    )

    assert isinstance(completed, AgentRunExecutionCompleted)
    assert completed.content == "The site is now tailored for design teams."
    assert len(step.execute_requests) == 1
    assert len(step.resume_requests) == 1
    assert step.resume_requests[0].checkpoint_id == interrupted.checkpoint_id
    assert step.resume_requests[0].resume == {"result": {"audience": "design teams"}}
