from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import Conflict
from src.models.agents.runtime_v1 import AgentRunStatusV1
from src.models.jobs.background_job import BackgroundJobRecord, JobInternalStatus, JobWorkloadClass
from src.modules.ai.runtime_cancel_repository import AgentRunCancellationRepository, AgentRunCancellationState
from src.modules.ai.runtime_event_repository import AppendableAgentRunEventV1
from src.modules.ai.runtime_platform_recovery_actions import AgentRunPlatformRecoveryActionPort
from src.modules.ai.runtime_platform_recovery_port import (
    AgentRunPlatformCancellationPort,
    AgentRunPlatformRecoveryPort,
    _cancel_requested_event,
)
from src.modules.ai.runtime_platform_recovery_schema import (
    PlatformAIRecoveryAction,
    PlatformAIRecoveryAuthority,
    PlatformAIRecoveryCommand,
    PlatformAIRecoveryReceipt,
)
from src.modules.ai.runtime_protocol_schema import RunCancelRequestedEventV1
from src.modules.ai.runtime_repository import AgentRuntimeRepository
from src.modules.ai.runtime_repository_schema import PersistedAgentRunEvent
from src.modules.ai.runtime_settlement_repository import AgentRunSettlementProof, AgentRunSettlementRepository
from src.modules.analytics.audit import ActivityAuditPayload
from src.modules.jobs.service import BackgroundJobService


class FakeCancellationRepository(AgentRunCancellationRepository):
    def __init__(self, states: dict[UUID, AgentRunCancellationState]) -> None:
        self.states = states
        self.requested_run_ids: list[UUID] = []

    async def get_platform_state_for_update(
        self,
        *,
        run_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentRunCancellationState:
        _ = conn
        self.requested_run_ids.append(run_id)
        return self.states[run_id]


class FakeRuntimeRepository(AgentRuntimeRepository):
    def __init__(self) -> None:
        self.events: list[RunCancelRequestedEventV1] = []

    async def append_event_in_transaction(
        self,
        *,
        event: AppendableAgentRunEventV1,
        run_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> PersistedAgentRunEvent:
        _ = run_id, conn
        if not isinstance(event, RunCancelRequestedEventV1):
            raise AssertionError(f"unexpected runtime event: {event.type}")
        self.events.append(event)
        return PersistedAgentRunEvent(
            event_id=event.event_id,
            sequence=event.sequence,
            cursor=event.cursor,
            payload={"type": event.type},
        )


class FakeSettlementRepository(AgentRunSettlementRepository):
    async def get_terminal_proof_in_transaction(
        self,
        *,
        run_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentRunSettlementProof:
        _ = conn
        raise AssertionError(f"immediate settlement must not run for {run_id}")


class FakeJobService(BackgroundJobService):
    def __init__(self, jobs: dict[UUID, BackgroundJobRecord]) -> None:
        self.jobs = jobs
        self.requests: list[tuple[UUID, UUID | None, str | None]] = []
        self.published: list[tuple[UUID, bool]] = []

    async def request_cancellation_in_transaction(
        self,
        *,
        job_id: UUID,
        requested_by_user_id: UUID | None,
        reason: str | None,
        requested_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> tuple[BackgroundJobRecord, bool]:
        _ = requested_at, conn
        self.requests.append((job_id, requested_by_user_id, reason))
        job = self.jobs[job_id]
        if job.cancel_requested_at is not None:
            return job, False
        job.cancel_requested_by_user_id = requested_by_user_id
        job.cancel_requested_at = datetime.now(UTC)
        return job, True

    async def publish_cancellation_requested_after_commit(
        self,
        *,
        job: BackgroundJobRecord,
        requested: bool,
    ) -> None:
        self.published.append((job.id, requested))


class FakeCancellationPort(AgentRunPlatformCancellationPort):
    @asynccontextmanager
    async def tx(self, *, conn: BaseDBAsyncClient | None = None) -> AsyncIterator[BaseDBAsyncClient]:
        if conn is not None:
            yield conn
            return
        yield BaseDBAsyncClient("platform-recovery-test")


def _state(
    *,
    workspace_id: UUID,
    job_id: UUID,
    status: AgentRunStatusV1 = AgentRunStatusV1.RUNNING,
    pending_approval: object | None = None,
) -> AgentRunCancellationState:
    return AgentRunCancellationState.model_construct(
        run_id=uuid4(),
        job_id=job_id,
        workspace_id=workspace_id,
        thread_id=uuid4(),
        owner_user_id=uuid4(),
        status=status,
        correlation_id="platform-recovery-test",
        last_sequence=4,
        last_cursor="cursor-4",
        running_part_ids=("part-1",),
        reservation_statuses=(),
        pending_approval=pending_approval,
        pending_approval_part_id=None,
    )


def _job(*, state: AgentRunCancellationState) -> BackgroundJobRecord:
    job_id = _job_id(state)
    return BackgroundJobRecord(
        id=job_id,
        job_type="agent.run.execute",
        job_type_version=1,
        task_name="jobs:agent-io:agent-run-execute:v1",
        workload_class=JobWorkloadClass.AGENT_IO,
        workspace_id=state.workspace_id,
        actor_user_id=state.owner_user_id,
        internal_status=JobInternalStatus.RUNNING,
        target_descriptor={"runId": str(state.run_id)},
        retry_policy={"maxAttempts": 1, "initialDelaySeconds": 1, "multiplier": 1, "maximumDelaySeconds": 1},
        request_fingerprint="a" * 64,
    )


def _command(
    *,
    task_id: UUID,
    action: PlatformAIRecoveryAction = "cancel",
) -> PlatformAIRecoveryCommand:
    return PlatformAIRecoveryCommand(
        task_id=task_id,
        action=action,
        authority=PlatformAIRecoveryAuthority(actor_user_id=uuid4(), correlation_id=uuid4()),
        idempotency_key="platform-recovery-key",
        reason="operator investigation",
    )


def _job_id(state: AgentRunCancellationState) -> UUID:
    if state.job_id is None:
        raise AssertionError("test state must include a background job")
    return state.job_id


@dataclass(frozen=True)
class FakeCancellationPortFixture:
    port: FakeCancellationPort
    cancellation_repository: FakeCancellationRepository
    runtime_repository: FakeRuntimeRepository
    job_service: FakeJobService


def _port(
    *,
    states: dict[UUID, AgentRunCancellationState],
    jobs: dict[UUID, BackgroundJobRecord],
    audits: list[ActivityAuditPayload],
    replay: RunCancelRequestedEventV1 | None = None,
) -> FakeCancellationPortFixture:
    async def audit_writer(
        *,
        settings: Settings,
        conn: BaseDBAsyncClient | None,
        payload: ActivityAuditPayload,
    ) -> object:
        _ = settings, conn
        audits.append(payload)
        return object()

    async def replay_reader(
        *,
        event_id: str,
        conn: BaseDBAsyncClient,
    ) -> RunCancelRequestedEventV1 | None:
        _ = event_id, conn
        return replay

    cancellation_repository = FakeCancellationRepository(states)
    runtime_repository = FakeRuntimeRepository()
    job_service = FakeJobService(jobs)
    port = FakeCancellationPort(
        Settings(app_env="test", database={"enabled": False}),
        cancellation_repository=cancellation_repository,
        runtime_repository=runtime_repository,
        settlement_repository=FakeSettlementRepository(),
        job_service=job_service,
        activity_audit_writer=audit_writer,
        replay_reader=replay_reader,
    )
    return FakeCancellationPortFixture(
        port=port,
        cancellation_repository=cancellation_repository,
        runtime_repository=runtime_repository,
        job_service=job_service,
    )


@pytest.mark.asyncio
async def test_platform_cancellation_isolated_to_the_selected_workspace_run_and_audited() -> None:
    workspace_one, workspace_two = uuid4(), uuid4()
    first = _state(workspace_id=workspace_one, job_id=uuid4())
    second = _state(workspace_id=workspace_two, job_id=uuid4())
    jobs = {_job_id(first): _job(state=first), _job_id(second): _job(state=second)}
    audits: list[ActivityAuditPayload] = []
    fixture = _port(states={first.run_id: first, second.run_id: second}, jobs=jobs, audits=audits)

    receipt = await fixture.port(command=_command(task_id=first.run_id))

    assert receipt == PlatformAIRecoveryReceipt(
        task_id=first.run_id,
        action="cancel",
        disposition="accepted",
        workspace_id=workspace_one,
        job_id=first.job_id,
    )
    assert jobs[_job_id(first)].cancel_requested_by_user_id == audits[0].actor_user_id
    assert jobs[_job_id(first)].cancel_requested_at is not None
    assert jobs[_job_id(second)].cancel_requested_at is None
    assert fixture.cancellation_repository.requested_run_ids == [first.run_id]
    assert len(fixture.runtime_repository.events) == 1
    assert fixture.runtime_repository.events[0].data.requested_by_actor_id == str(audits[0].actor_user_id)
    assert audits[0].workspace_id == workspace_one
    assert audits[0].source == "platform"


@pytest.mark.asyncio
async def test_platform_cancellation_replay_does_not_repeat_the_run_event_or_audit() -> None:
    state = _state(workspace_id=uuid4(), job_id=uuid4(), status=AgentRunStatusV1.CANCELLATION_REQUESTED)
    job = _job(state=state)
    job.cancel_requested_at = datetime.now(UTC)
    audits: list[ActivityAuditPayload] = []
    command = _command(task_id=state.run_id)
    replay = _cancel_requested_event(
        state=state,
        sequence=state.last_sequence,
        occurred_at=datetime.now(UTC),
        actor_user_id=command.authority.actor_user_id,
        idempotency_key=command.idempotency_key,
        reason=command.reason,
    )
    fixture = _port(states={state.run_id: state}, jobs={job.id: job}, audits=audits, replay=replay)

    receipt = await fixture.port(command=command)

    assert receipt.disposition == "already_applied"
    assert fixture.runtime_repository.events == []
    assert audits == []


@pytest.mark.asyncio
async def test_platform_cancellation_has_no_authority_over_workspace_approval() -> None:
    state = _state(
        workspace_id=uuid4(),
        job_id=uuid4(),
        status=AgentRunStatusV1.INTERRUPTED,
        pending_approval=object(),
    )
    audits: list[ActivityAuditPayload] = []
    fixture = _port(states={state.run_id: state}, jobs={_job_id(state): _job(state=state)}, audits=audits)

    with pytest.raises(Conflict, match="AI_PLATFORM_TASK_WORKSPACE_APPROVAL_NON_AUTHORITY"):
        await fixture.port(command=_command(task_id=state.run_id))

    assert fixture.runtime_repository.events == []
    assert fixture.job_service.requests == []
    assert audits == []


@pytest.mark.asyncio
async def test_platform_cancellation_rejects_completed_or_failed_runs_instead_of_claiming_replay() -> None:
    state = _state(workspace_id=uuid4(), job_id=uuid4(), status=AgentRunStatusV1.FAILED)
    audits: list[ActivityAuditPayload] = []
    fixture = _port(states={state.run_id: state}, jobs={_job_id(state): _job(state=state)}, audits=audits)

    with pytest.raises(Conflict, match="AI_PLATFORM_TASK_CANCEL_NOT_ELIGIBLE"):
        await fixture.port(command=_command(task_id=state.run_id))

    assert fixture.runtime_repository.events == []
    assert fixture.job_service.requests == []
    assert audits == []


@pytest.mark.asyncio
async def test_platform_cancellation_rejects_a_different_actor_reusing_the_same_idempotency_key() -> None:
    state = _state(workspace_id=uuid4(), job_id=uuid4(), status=AgentRunStatusV1.CANCELLATION_REQUESTED)
    initial = _command(task_id=state.run_id)
    replay = _cancel_requested_event(
        state=state,
        sequence=state.last_sequence,
        occurred_at=datetime.now(UTC),
        actor_user_id=initial.authority.actor_user_id,
        idempotency_key=initial.idempotency_key,
        reason=initial.reason,
    )
    command = initial.model_copy(
        update={"authority": PlatformAIRecoveryAuthority(actor_user_id=uuid4(), correlation_id=uuid4())}
    )
    audits: list[ActivityAuditPayload] = []
    fixture = _port(
        states={state.run_id: state},
        jobs={_job_id(state): _job(state=state)},
        audits=audits,
        replay=replay,
    )

    with pytest.raises(Conflict, match="AI_PLATFORM_TASK_IDEMPOTENCY_CONFLICT"):
        await fixture.port(command=command)

    assert fixture.runtime_repository.events == []
    assert audits == []


@pytest.mark.asyncio
async def test_run_job_cancellation_repair_is_audited_and_reported_as_accepted() -> None:
    state = _state(workspace_id=uuid4(), job_id=uuid4())
    job = _job(state=state)
    job.cancel_requested_at = datetime.now(UTC)
    audits: list[ActivityAuditPayload] = []
    fixture = _port(states={state.run_id: state}, jobs={job.id: job}, audits=audits)

    receipt = await fixture.port(command=_command(task_id=state.run_id))

    assert receipt.disposition == "accepted"
    assert len(fixture.runtime_repository.events) == 1
    assert len(audits) == 1


class FakeRecoveryActionPort:
    def __init__(self, receipt: PlatformAIRecoveryReceipt) -> None:
        self.receipt = receipt
        self.commands: list[PlatformAIRecoveryCommand] = []

    async def __call__(self, *, command: PlatformAIRecoveryCommand) -> PlatformAIRecoveryReceipt:
        self.commands.append(command)
        return self.receipt


@pytest.mark.asyncio
async def test_retry_replay_is_delegated_to_the_injected_original_effect_protocol() -> None:
    task_id, workspace_id = uuid4(), uuid4()
    retry = FakeRecoveryActionPort(
        PlatformAIRecoveryReceipt(
            task_id=task_id,
            action="retry",
            disposition="already_applied",
            workspace_id=workspace_id,
            job_id=uuid4(),
        )
    )
    port = AgentRunPlatformRecoveryPort(Settings(app_env="test", database={"enabled": False}), retry_port=retry)
    command = _command(task_id=task_id, action="retry")

    assert await port.execute(command=command) == retry.receipt
    assert retry.commands == [command]


def test_partial_or_unknown_reconciliation_uses_the_default_owned_protocol() -> None:
    port = AgentRunPlatformRecoveryPort(Settings(app_env="test", database={"enabled": False}))

    assert isinstance(port._port_for(action="reconcile"), AgentRunPlatformRecoveryActionPort)
