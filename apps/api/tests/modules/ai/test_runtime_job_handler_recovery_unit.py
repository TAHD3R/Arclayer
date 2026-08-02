from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest

from src.config import Settings
from src.models.agents.runtime_recovery_v1 import (
    AgentRunExecutionEffectDisposition,
    AgentRunRecoveryAction,
    AgentRunRecoveryStatus,
)
from src.models.agents.runtime_v1 import AgentExecutionModeV1, AgentRunStatusV1
from src.modules.ai.runtime_execution_gateway import (
    AgentRunChatUsage,
    AgentRunExecutionCompleted,
    AgentRunExecutionOutcome,
    AgentRunExecutionRequest,
    AgentRunResumeExecutionRequest,
)
from src.modules.ai.runtime_job_handler import (
    AgentRunExecutionEffectPort,
    AgentRunJobHandler,
    AgentRunRecoveryLifecyclePort,
)
from src.modules.ai.runtime_job_repository import AgentRunJobState
from src.modules.ai.runtime_job_schema import AgentRunJobInput, AgentRunJobResult, AgentRunJobTarget
from src.modules.ai.runtime_recovery_schema import (
    AgentRunExecutionEffectSnapshot,
    AgentRunRecoveryExecutionSnapshot,
)
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
        reservation_statuses=(),
        error_code=None,
        interrupt_id=None,
        checkpoint_id=None,
        interrupt_reason=None,
        interrupt_approval_id=None,
        interrupt_tool_call_id=None,
        resume_input=None,
        execution_effect=effect,
        recovery=recovery,
    )


def _context() -> JobExecutionContext[AgentRunJobTarget, AgentRunJobInput]:
    return cast(JobExecutionContext[AgentRunJobTarget, AgentRunJobInput], SimpleNamespace())


@pytest.mark.asyncio
async def test_job_reconciliation_replays_a_committed_current_job_receipt_without_provider_call() -> None:
    effect, completed = _completed_effect()
    handler = _Handler(state=_state(effect=effect))

    result = await handler.reconcile(context=_context())

    assert isinstance(result, AgentRunJobResult)
    assert handler.projected == completed


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


def test_committed_effect_receipt_contains_no_raw_request_or_workspace_prompt() -> None:
    effect, _ = _completed_effect()
    serialized = effect.model_dump_json()

    assert "hidden workspace prompt" not in serialized
    assert "messages" not in serialized
    assert effect.outcome is not None
