from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import Literal
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import Conflict
from src.llm.policy import RuntimeAiPolicy
from src.models.agents.runtime_recovery_v1 import (
    AgentRunExecutionEffectDisposition,
    AgentRunRecoveryAction,
)
from src.models.agents.runtime_v1 import AgentRunStatusV1
from src.models.jobs.background_job import (
    JobAuthorityMode,
    JobFailureClassification,
    JobInternalStatus,
    JobRetryClass,
    JobWorkloadClass,
)
from src.modules.ai.runtime_job_schema import AGENT_RUN_JOB_TYPE, AGENT_RUN_JOB_TYPE_VERSION
from src.modules.ai.runtime_platform_recovery_actions import AgentRunPlatformRecoveryActionPort
from src.modules.ai.runtime_platform_recovery_schema import (
    PlatformAIRecoveryAction,
    PlatformAIRecoveryAuthority,
    PlatformAIRecoveryCommand,
)
from src.modules.ai.runtime_recovery_protocol_schema import RunRecoveryRequestedEventV1
from src.modules.analytics.audit import ActivityAuditPayload
from src.modules.jobs.schema import BackgroundJobCreate


class _RecoveryRepository:
    def __init__(self, *, run: SimpleNamespace, source_job: SimpleNamespace, attempt: SimpleNamespace) -> None:
        self.run = run
        self.source_job = source_job
        self.attempt = attempt
        self.replay: SimpleNamespace | None = None
        self.created: list[SimpleNamespace] = []

    async def get_run_for_update(self, **kwargs) -> SimpleNamespace:  # type: ignore[no-untyped-def]
        _ = kwargs
        return self.run

    async def get_job_for_update(self, **kwargs) -> SimpleNamespace:  # type: ignore[no-untyped-def]
        _ = kwargs
        return self.source_job

    async def get_by_idempotency_hash_for_update(self, **kwargs) -> SimpleNamespace | None:  # type: ignore[no-untyped-def]
        _ = kwargs
        return self.replay

    async def latest_attempt_for_job_for_update(self, **kwargs) -> SimpleNamespace:  # type: ignore[no-untyped-def]
        _ = kwargs
        return self.attempt

    async def next_generation(self, **kwargs) -> int:  # type: ignore[no-untyped-def]
        _ = kwargs
        return len(self.created) + 1

    async def create_recovery(self, **kwargs) -> SimpleNamespace:  # type: ignore[no-untyped-def]
        recovery = SimpleNamespace(
            id=uuid4(),
            run_id=kwargs["run"].id,
            source_job_id=kwargs["source_job"].id,
            recovery_job_id=None,
            action=kwargs["action"],
            idempotency_key_hash=kwargs["idempotency_key_hash"],
            request_fingerprint=kwargs["request_fingerprint"],
        )
        self.created.append(recovery)
        return recovery

    async def bind_recovery_job(self, **kwargs) -> None:  # type: ignore[no-untyped-def]
        kwargs["recovery"].recovery_job_id = kwargs["job"].id


class _EffectRepository:
    def __init__(self, effect: SimpleNamespace | None) -> None:
        self.effect = effect

    async def latest_for_job_for_update(self, **kwargs) -> SimpleNamespace | None:  # type: ignore[no-untyped-def]
        _ = kwargs
        return self.effect


class _RuntimeRepository:
    def __init__(self) -> None:
        self.events: list[RunRecoveryRequestedEventV1] = []

    async def append_event_in_transaction(self, **kwargs) -> object:  # type: ignore[no-untyped-def]
        event = kwargs["event"]
        if not isinstance(event, RunRecoveryRequestedEventV1):
            raise AssertionError(f"unexpected recovery event: {event}")
        self.events.append(event)
        return object()


class _ActorAuthorizer:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def authorize(self, **kwargs) -> None:  # type: ignore[no-untyped-def]
        self.calls.append(kwargs)


class _JobService:
    def __init__(self, recovery_job: SimpleNamespace) -> None:
        self.recovery_job = recovery_job
        self.commands: list[BackgroundJobCreate] = []
        self.published: list[object] = []
        self.registry = SimpleNamespace(require=lambda **kwargs: _definition())

    async def create_job_in_transaction(self, **kwargs) -> SimpleNamespace:  # type: ignore[no-untyped-def]
        self.commands.append(kwargs["command"])
        return SimpleNamespace(job=self.recovery_job, created=True)

    async def publish_created_after_commit(self, result: object) -> None:
        self.published.append(result)


class _Port(AgentRunPlatformRecoveryActionPort):
    @asynccontextmanager
    async def tx(self, *, conn: BaseDBAsyncClient | None = None) -> AsyncIterator[BaseDBAsyncClient]:
        if conn is not None:
            yield conn
            return
        yield BaseDBAsyncClient("agent-recovery-action-test")


def _definition() -> SimpleNamespace:
    return SimpleNamespace(
        job_type=AGENT_RUN_JOB_TYPE,
        job_type_version=AGENT_RUN_JOB_TYPE_VERSION,
        task_name="jobs:agent-io:agent-run-execute:v1",
        workload_class=JobWorkloadClass.AGENT_IO,
        authority_mode=JobAuthorityMode.ACTOR_REVALIDATED,
        required_permission=SimpleNamespace(scope="workspace", action="workspace:ai:use"),
        retry_class=JobRetryClass.TRANSIENT,
        max_attempts=3,
        timeout_seconds=300,
        lease_seconds=30,
        heartbeat_seconds=5,
        initial_status_key="AI_AGENT_RUN_STATUS_QUEUED",
    )


def _run(*, status: AgentRunStatusV1) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        workspace_id=uuid4(),
        project_id=uuid4(),
        thread_id=uuid4(),
        owner_user_id=uuid4(),
        job_id=uuid4(),
        status=status,
        last_sequence=7,
        correlation_id="agent-recovery-correlation",
    )


def _job(*, run: SimpleNamespace) -> SimpleNamespace:
    return SimpleNamespace(
        id=run.job_id,
        job_type=AGENT_RUN_JOB_TYPE,
        job_type_version=AGENT_RUN_JOB_TYPE_VERSION,
        workspace_id=run.workspace_id,
        project_id=run.project_id,
        site_id=None,
        actor_user_id=run.owner_user_id,
        internal_status=JobInternalStatus.FAILED,
        target_descriptor={"workspaceId": str(run.workspace_id)},
        input_reference={"runId": str(run.id)},
        source_revision="source-revision-1",
    )


def _command(
    *,
    run: SimpleNamespace,
    action: PlatformAIRecoveryAction = "retry",
) -> PlatformAIRecoveryCommand:
    return PlatformAIRecoveryCommand(
        task_id=run.id,
        action=action,
        authority=PlatformAIRecoveryAuthority(actor_user_id=uuid4(), correlation_id=uuid4()),
        idempotency_key="platform-ai-recovery-1",
        reason="operator requested verified recovery",
    )


def _fixture(
    *,
    action: Literal["retry", "reconcile"],
    run: SimpleNamespace,
    effect: SimpleNamespace | None = None,
    retry_limit: int | None = None,
    attempt_number: int = 1,
) -> tuple[
    _Port,
    _RecoveryRepository,
    _RuntimeRepository,
    _JobService,
    _ActorAuthorizer,
    list[ActivityAuditPayload],
]:
    source_job = _job(run=run)
    recoveries = _RecoveryRepository(
        run=run,
        source_job=source_job,
        attempt=SimpleNamespace(
            failure_classification=JobFailureClassification.TRANSIENT,
            attempt_number=attempt_number,
        ),
    )
    runtime = _RuntimeRepository()
    recovery_job = SimpleNamespace(id=uuid4())
    jobs = _JobService(recovery_job)
    authorizer = _ActorAuthorizer()
    audits: list[ActivityAuditPayload] = []

    async def audit_writer(**kwargs) -> object:  # type: ignore[no-untyped-def]
        audits.append(kwargs["payload"])
        return object()

    async def resolve_policy() -> RuntimeAiPolicy:
        return RuntimeAiPolicy(
            revision_id=None,
            sequence=None,
            allowed_models=(),
            max_tokens_per_request=0,
            max_cost_micros_per_request=0,
            max_concurrent_runs=None,
            external_data_egress_allowed=True,
            tool_allowlist=None,
            approval_required_effect_classes=frozenset(),
            retry_limit=retry_limit,
        )

    port = _Port(
        Settings(app_env="test", database={"enabled": False}),
        action=action,  # type: ignore[arg-type]
        recoveries=recoveries,  # type: ignore[arg-type]
        effects=_EffectRepository(effect),  # type: ignore[arg-type]
        runtime=runtime,  # type: ignore[arg-type]
        jobs=jobs,  # type: ignore[arg-type]
        actor_authorizer=authorizer,  # type: ignore[arg-type]
        activity_audit_writer=audit_writer,
        runtime_policy_resolver=resolve_policy,
    )
    return port, recoveries, runtime, jobs, authorizer, audits


@pytest.mark.asyncio
async def test_retry_creates_a_new_job_event_audit_and_workspace_receipt_atomically() -> None:
    run = _run(status=AgentRunStatusV1.FAILED)
    port, recoveries, runtime, jobs, authorizer, audits = _fixture(action="retry", run=run)

    receipt = await port(command=_command(run=run))

    assert receipt.workspace_id == run.workspace_id
    assert receipt.source_job_id == run.job_id
    assert receipt.job_id == jobs.recovery_job.id
    assert receipt.disposition == "accepted"
    assert jobs.commands[0].retry_of_job_id == run.job_id
    assert jobs.commands[0].idempotency_key == f"platform-ai-recovery:{recoveries.created[0].id}"
    assert runtime.events[0].type == "run.recovery.requested"
    assert runtime.events[0].data.recovery_job_id == str(jobs.recovery_job.id)
    assert authorizer.calls[0]["actor_user_id"] == run.owner_user_id
    assert audits[0].workspace_id == run.workspace_id
    assert jobs.published


@pytest.mark.asyncio
async def test_retry_replay_returns_the_original_receipt_without_recreating_side_effects() -> None:
    run = _run(status=AgentRunStatusV1.FAILED)
    port, recoveries, runtime, jobs, _, audits = _fixture(action="retry", run=run)
    command = _command(run=run)

    accepted = await port(command=command)
    recoveries.replay = recoveries.created[0]
    replayed = await port(command=command)

    assert accepted.disposition == "accepted"
    assert replayed.disposition == "already_applied"
    assert replayed.job_id == accepted.job_id
    assert len(recoveries.created) == 1
    assert len(runtime.events) == 1
    assert len(audits) == 1
    assert len(jobs.published) == 1


@pytest.mark.asyncio
async def test_retry_reloads_policy_and_rejects_a_removed_retry_capability() -> None:
    run = _run(status=AgentRunStatusV1.FAILED)
    port, *_ = _fixture(
        action="retry",
        run=run,
        retry_limit=1,
        attempt_number=2,
    )

    with pytest.raises(Conflict) as rejected:
        await port(command=_command(run=run))

    assert rejected.value.error == "AI_PLATFORM_TASK_RETRY_POLICY_BLOCKED"


@pytest.mark.asyncio
async def test_retry_is_rejected_after_the_execution_effect_boundary() -> None:
    run = _run(status=AgentRunStatusV1.FAILED)
    effect = SimpleNamespace(id=uuid4(), disposition=AgentRunExecutionEffectDisposition.ACTIVE)
    port, recoveries, runtime, jobs, _, audits = _fixture(action="retry", run=run, effect=effect)

    with pytest.raises(Conflict, match="AI_PLATFORM_TASK_RETRY_EFFECT_ALREADY_CROSSED"):
        await port(command=_command(run=run))

    assert recoveries.created == []
    assert runtime.events == []
    assert jobs.commands == []
    assert audits == []


@pytest.mark.asyncio
async def test_reconcile_requires_and_carries_a_committed_source_receipt() -> None:
    run = _run(status=AgentRunStatusV1.COMPLETED)
    effect = SimpleNamespace(id=uuid4(), disposition=AgentRunExecutionEffectDisposition.COMMITTED)
    port, _, runtime, jobs, _, audits = _fixture(action="reconcile", run=run, effect=effect)

    receipt = await port(command=_command(run=run, action="reconcile"))

    assert receipt.action == AgentRunRecoveryAction.RECONCILE
    assert runtime.events[0].data.action == "reconcile"
    assert jobs.commands[0].retry_of_job_id == run.job_id
    assert audits[0].properties["source_effect_id"] == str(effect.id)
