from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast
from uuid import uuid4

import pytest

from src.config import Settings
from src.models.agents.runtime_recovery_v1 import (
    AgentRunExecutionEffectDisposition,
    AgentRunRecoveryAction,
    AgentRunRecoveryStatus,
)
from src.models.agents.runtime_v1 import AgentExecutionModeV1, AgentMessagePartV1Record, AgentRunStatusV1
from src.models.ai.ai_budget_reservation import ReservationStatus
from src.modules.ai.runtime_event_repository import AppendableAgentRunEventV1
from src.modules.ai.runtime_execution_gateway import (
    AgentRunChatUsage,
    AgentRunExecutionCompleted,
    AgentRunExecutionInterrupted,
    AgentRunExecutionOutcome,
    AgentRunExecutionRequest,
    AgentRunResumeExecutionRequest,
)
from src.modules.ai.runtime_job_handler import (
    AgentRunExecutionEffectPort,
    AgentRunJobHandler,
    AgentRunRecoveryLifecyclePort,
)
from src.modules.ai.runtime_job_repository import AgentRunJobResumeInput, AgentRunJobState
from src.modules.ai.runtime_job_schema import AgentRunJobInput, AgentRunJobResult, AgentRunJobTarget
from src.modules.ai.runtime_recovery_schema import (
    AgentRunExecutionEffectSnapshot,
    AgentRunRecoveryExecutionSnapshot,
)
from src.modules.ai.runtime_repository_schema import (
    PersistedAgentMessage,
    PersistedAgentMessagePart,
    PersistedAgentRunEvent,
)
from src.modules.ai.runtime_settlement_repository import AgentRunSettlementProof
from src.modules.jobs.execution_errors import PermanentJobExecutionError
from src.modules.jobs.execution_registry import JobExecutionContext, JobHandledFailure, JobHandledInterruption
from src.modules.jobs.hashing import hash_json


class _FailingGateway:
    async def execute(self, *, request: AgentRunExecutionRequest) -> AgentRunExecutionCompleted:
        _ = request
        raise AssertionError("reconciliation must not call the Provider")

    async def resume(self, *, request: AgentRunResumeExecutionRequest) -> AgentRunExecutionCompleted:
        _ = request
        raise AssertionError("reconciliation must not resume the Provider")


class _Handler(AgentRunJobHandler):
    def __init__(self, *, state: AgentRunJobState) -> None:
        super().__init__(
            settings=Settings(app_env="test", database={"enabled": False}),
            execution_gateway=_FailingGateway(),
            execution_effects=cast(AgentRunExecutionEffectPort, SimpleNamespace()),
            recovery_lifecycle=cast(AgentRunRecoveryLifecyclePort, SimpleNamespace()),
        )
        self.state = state
        self.projected: AgentRunExecutionCompleted | None = None

    async def _state(
        self,
        context: JobExecutionContext[AgentRunJobTarget, AgentRunJobInput],
    ) -> AgentRunJobState:
        _ = context
        return self.state

    async def _project_execution_outcome(
        self,
        *,
        context: JobExecutionContext[AgentRunJobTarget, AgentRunJobInput],
        state: AgentRunJobState,
        outcome: AgentRunExecutionOutcome,
    ) -> AgentRunJobResult | JobHandledFailure | JobHandledInterruption:
        _ = context
        if not isinstance(outcome, AgentRunExecutionCompleted):
            raise AssertionError(f"unexpected recovery outcome: {outcome.kind}")
        self.projected = outcome
        return AgentRunJobResult(
            run_id=state.run_id,
            thread_id=state.thread_id,
            status="completed",
            last_sequence=state.last_sequence + 4,
            last_cursor="reconciled-cursor",
        )


class _AtomicProjectionRepository:
    def __init__(self) -> None:
        self.calls: list[tuple[AppendableAgentRunEventV1, ...]] = []
        self.fail_once = True

    async def append_events_atomically(
        self,
        *,
        run_id,
        events: tuple[AppendableAgentRunEventV1, ...],
    ) -> tuple[PersistedAgentRunEvent, ...]:
        _ = run_id
        if self.fail_once:
            self.fail_once = False
            raise RuntimeError("simulated worker loss before completion projection commit")
        self.calls.append(events)
        return tuple(
            PersistedAgentRunEvent(
                event_id=event.event_id,
                sequence=event.sequence,
                cursor=event.cursor,
                payload=event.model_dump(mode="json", by_alias=True),
            )
            for event in events
        )


class _ProjectionContext:
    async def checkpoint(self):  # type: ignore[no-untyped-def]
        return None

    async def report_progress(self, update):  # type: ignore[no-untyped-def]
        _ = update
        return None


class _ProjectionSettlementRepository:
    async def get_terminal_proof(self, *, run_id):
        _ = run_id
        return AgentRunSettlementProof(
            outcome="committed",
            reservation_count=0,
            credit_reservation_count=0,
            actual_cost_micros=0,
            credits_committed=0,
            credits_released=0,
        )


class _ConversationRepository:
    def __init__(self, messages: list[PersistedAgentMessage]) -> None:
        self.messages = messages

    async def list_messages(self, *, thread_id):
        _ = thread_id
        return self.messages


class _ConversationHandler(AgentRunJobHandler):
    def __init__(self, *, messages: list[PersistedAgentMessage]) -> None:
        super().__init__(
            settings=Settings(app_env="test", database={"enabled": False}),
            runtime_repository=cast(Any, _ConversationRepository(messages)),
            execution_gateway=_FailingGateway(),
        )

    async def _system_prompt(self, state, *, skill_context, knowledge_context):  # type: ignore[no-untyped-def]
        _ = state, skill_context, knowledge_context
        return "agent system prompt"


class _ProjectionHandler(AgentRunJobHandler):
    def __init__(self, *, state: AgentRunJobState, runtime_repository: _AtomicProjectionRepository) -> None:
        super().__init__(
            settings=Settings(app_env="test", database={"enabled": False}),
            execution_gateway=_FailingGateway(),
            runtime_repository=cast(Any, runtime_repository),
            execution_effects=cast(AgentRunExecutionEffectPort, SimpleNamespace()),
            recovery_lifecycle=cast(AgentRunRecoveryLifecyclePort, SimpleNamespace()),
            settlement_repository=cast(Any, _ProjectionSettlementRepository()),
        )
        self.state = state

    async def _state(
        self,
        context: JobExecutionContext[AgentRunJobTarget, AgentRunJobInput],
    ) -> AgentRunJobState:
        _ = context
        return self.state


def _completed_effect() -> tuple[AgentRunExecutionEffectSnapshot, AgentRunExecutionCompleted]:
    completed = AgentRunExecutionCompleted(
        completion_id="completion-receipt-1",
        model="gpt-5",
        content="Durably returned answer",
        usage=AgentRunChatUsage(prompt_tokens=12, completion_tokens=8),
        finish_reason="stop",
    )
    outcome = completed.model_dump(mode="json", by_alias=True)
    now = datetime.now(UTC)
    effect = AgentRunExecutionEffectSnapshot(
        id=uuid4(),
        run_id=uuid4(),
        job_id=uuid4(),
        owner_attempt_id=uuid4(),
        effect_key="agent-provider-execute",
        request_hash="a" * 64,
        disposition=AgentRunExecutionEffectDisposition.COMMITTED,
        outcome=outcome,
        outcome_hash=hash_json(outcome),
        error_code=None,
        registered_at=now,
        settled_at=now,
    )
    return effect, completed


def _state(
    *,
    effect: AgentRunExecutionEffectSnapshot | None = None,
    recovery: AgentRunRecoveryExecutionSnapshot | None = None,
    resume_input: AgentRunJobResumeInput | None = None,
    reservation_statuses: tuple[ReservationStatus, ...] = (),
) -> AgentRunJobState:
    return AgentRunJobState.model_construct(
        run_id=uuid4(),
        job_id=uuid4(),
        workspace_id=uuid4(),
        project_id=uuid4(),
        thread_id=uuid4(),
        owner_user_id=uuid4(),
        status=AgentRunStatusV1.QUEUED,
        execution_mode=AgentExecutionModeV1.BUILD,
        lead_agent_id=str(uuid4()),
        lead_agent_version_id=uuid4(),
        lead_agent_assignment_id=uuid4(),
        mentioned_agent_ids=(),
        mentioned_agent_version_ids=(),
        mentioned_agent_assignment_ids=(),
        skill_snapshot_count=0,
        knowledge_context=None,
        knowledge_source_snapshot_count=0,
        design_system_context=None,
        builder_context=None,
        correlation_id="recovery-unit",
        last_sequence=8,
        last_cursor="cursor-8",
        prompt="hidden workspace prompt",
        running_part_ids=(),
        reservation_statuses=reservation_statuses,
        error_code=None,
        interrupt_id=None,
        checkpoint_id=None,
        interrupt_reason=None,
        interrupt_approval_id=None,
        interrupt_tool_call_id=None,
        resume_input=resume_input,
        execution_effect=effect,
        recovery=recovery,
    )


def _context(*, attempt_id=None) -> JobExecutionContext[AgentRunJobTarget, AgentRunJobInput]:
    return cast(
        JobExecutionContext[AgentRunJobTarget, AgentRunJobInput],
        SimpleNamespace(lease=SimpleNamespace(attempt_id=attempt_id or uuid4())),
    )


def _human_resume_input() -> AgentRunJobResumeInput:
    return AgentRunJobResumeInput(
        checkpoint_id="checkpoint-human-1",
        response_kind="human_result",
        resume={"result": {"answer": "A sustainable home-goods store."}},
        message_id=uuid4(),
        part_id=uuid4(),
        tool_call_id="tool-call-human-1",
        tool_id="human.request_input",
        tool_version="1",
        tool_name="human.request_input",
        args={"question": "What type of website?", "responseType": "text", "options": []},
        args_text='{"options":[],"question":"What type of website?","responseType":"text"}',
        approval=None,
    )


@pytest.mark.asyncio
async def test_job_reconciliation_replays_a_committed_current_job_receipt_without_provider_call() -> None:
    effect, completed = _completed_effect()
    handler = _Handler(state=_state(effect=effect))

    result = await handler.reconcile(context=_context(attempt_id=effect.owner_attempt_id))

    assert isinstance(result, AgentRunJobResult)
    assert handler.projected == completed


@pytest.mark.asyncio
async def test_job_reconciliation_ignores_a_previous_attempt_receipt_when_resuming_human_input() -> None:
    stale_effect, _ = _completed_effect()
    handler = _Handler(
        state=_state(
            effect=stale_effect,
            resume_input=_human_resume_input(),
            reservation_statuses=(ReservationStatus.COMMITTED,),
        )
    )

    result = await handler.reconcile(context=_context())

    assert result is None
    assert handler.projected is None


@pytest.mark.asyncio
async def test_platform_reconciliation_replays_only_the_committed_source_job_receipt() -> None:
    effect, completed = _completed_effect()
    recovery = AgentRunRecoveryExecutionSnapshot(
        recovery_id=uuid4(),
        action=AgentRunRecoveryAction.RECONCILE,
        status=AgentRunRecoveryStatus.RUNNING,
        source_job_id=effect.job_id,
        source_effect=effect,
    )
    handler = _Handler(state=_state(recovery=recovery))

    result = await handler.reconcile(context=_context())

    assert isinstance(result, AgentRunJobResult)
    assert handler.projected == completed


@pytest.mark.asyncio
async def test_platform_reconciliation_rejects_missing_source_receipt_explicitly() -> None:
    recovery = AgentRunRecoveryExecutionSnapshot(
        recovery_id=uuid4(),
        action=AgentRunRecoveryAction.RECONCILE,
        status=AgentRunRecoveryStatus.RUNNING,
        source_job_id=uuid4(),
        source_effect=None,
    )
    handler = _Handler(state=_state(recovery=recovery))

    with pytest.raises(PermanentJobExecutionError) as rejected:
        await handler.reconcile(context=_context())

    assert rejected.value.metadata == {"publicErrorCode": "AGENT_RUN_RECONCILIATION_RECEIPT_MISSING"}


@pytest.mark.asyncio
async def test_completion_projection_retries_as_one_atomic_event_batch() -> None:
    _, completed = _completed_effect()
    state = _state()
    repository = _AtomicProjectionRepository()
    handler = _ProjectionHandler(state=state, runtime_repository=repository)
    context = cast(JobExecutionContext[AgentRunJobTarget, AgentRunJobInput], _ProjectionContext())

    with pytest.raises(RuntimeError, match="simulated worker loss"):
        await handler._project_execution_outcome(context=context, state=state, outcome=completed)

    result = await handler._project_execution_outcome(context=context, state=state, outcome=completed)

    assert isinstance(result, AgentRunJobResult)
    assert len(repository.calls) == 1
    assert [event.type for event in repository.calls[0]] == [
        "message.part.started",
        "message.part.delta",
        "message.part.completed",
        "usage.updated",
        "run.completed",
    ]


@pytest.mark.asyncio
async def test_model_context_keeps_human_tool_call_before_its_answer_on_resume() -> None:
    thread_id = uuid4()
    prompt = "create a website for me"
    messages = [
        PersistedAgentMessage(
            id=uuid4(),
            role="user",
            status="complete",
            parts=(PersistedAgentMessagePart(type="text", status="complete", text=prompt),),
        ),
        PersistedAgentMessage(
            id=uuid4(),
            role="assistant",
            status="complete",
            parts=(
                PersistedAgentMessagePart(
                    type="tool-call",
                    status="complete",
                    text=None,
                    payload={
                        "toolName": "human.request_input",
                        "args": {
                            "question": "What type of website are you building?",
                            "responseType": "single_select",
                            "options": ["E-commerce Store"],
                        },
                    },
                ),
            ),
        ),
        PersistedAgentMessage(
            id=uuid4(),
            role="user",
            status="complete",
            parts=(PersistedAgentMessagePart(type="text", status="complete", text="a pc selling"),),
        ),
    ]
    handler = _ConversationHandler(messages=messages)
    state = _state()
    state = state.model_copy(update={"thread_id": thread_id, "prompt": prompt})

    context = await handler._messages(state, skill_context=(), knowledge_context=())

    assert [(item["role"], item["content"]) for item in context[1:]] == [
        ("user", prompt),
        (
            "assistant",
            'Tool call human.request_input: {"options":["E-commerce Store"],"question":"What type of website are you building?","responseType":"single_select"}',
        ),
        ("user", "a pc selling"),
    ]


def test_committed_effect_receipt_contains_no_raw_request_or_workspace_prompt() -> None:
    effect, _ = _completed_effect()
    serialized = effect.model_dump_json()

    assert "hidden workspace prompt" not in serialized
    assert "messages" not in serialized
    assert effect.outcome is not None


@pytest.mark.asyncio
async def test_interruption_rebinds_provider_ids_without_a_database_race(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def unexpected_filter(**_: object) -> None:
        raise AssertionError("Tool-call identity allocation must not depend on a pre-insert lookup")

    monkeypatch.setattr(AgentMessagePartV1Record, "filter", unexpected_filter)
    interruption = AgentRunExecutionInterrupted(
        interrupt_id="interrupt-1",
        checkpoint_id="checkpoint-1",
        reason="human_tool_input",
        tool_call_id="provider-call-reused",
        tool_id="human.request_input",
        tool_version="1",
        tool_name="human.request_input",
        args={"question": "Which audience?", "responseType": "text", "options": []},
    )

    normalized = await asyncio.gather(
        *(AgentRunJobHandler._normalize_interruption_tool_call_id(interruption) for _ in range(32))
    )

    tool_call_ids = {item.tool_call_id for item in normalized}
    assert interruption.tool_call_id not in tool_call_ids
    assert len(tool_call_ids) == len(normalized)
