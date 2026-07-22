from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from threading import Event as ThreadEvent
from typing import cast
from uuid import UUID, uuid4

import pytest

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.config import Settings
from src.models.jobs.background_job import JobAuthorityMode, JobInternalStatus, JobWorkloadClass
from src.modules.assets.jobs import (
    ASSET_THUMBNAIL_PROFILE_VERSION,
    AssetThumbnailJobInput,
    AssetThumbnailJobResult,
    AssetThumbnailJobTarget,
)
from src.modules.jobs.builtin_registry import build_builtin_job_type_registry
from src.modules.jobs.execution_errors import (
    JobExecutionLeaseLostError,
    PermanentJobExecutionError,
    TransientJobExecutionError,
    UnexpectedJobExecutionError,
)
from src.modules.jobs.execution_registry import (
    JobExecutionRegistry,
    JobHandledFailure,
    JobHandledInterruption,
    JobTypeRegistration,
)
from src.modules.jobs.execution_schema import (
    JobDeliveryClaim,
    JobDeliveryCommand,
    JobDeliveryDisposition,
    JobExecutionBinding,
    JobExecutionControlSnapshot,
    JobExecutionLease,
    JobExecutionPreparation,
    JobExecutionTerminalOutcome,
    JobProgressUpdate,
    JobSuccessCancellationDisposition,
    SystemExecutionBinding,
    TenantExecutionBinding,
)
from src.modules.jobs.execution_service import BackgroundJobExecutionService
from src.modules.jobs.execution_terminal_service import BackgroundJobTerminalService
from src.modules.jobs.reaper_schema import JobLeaseReapOutcome
from src.modules.jobs.schema import JobDispatchEnvelope
from src.modules.tenancy.context import get_current_tenant_context
from src.modules.tenancy.schema import (
    TenantContext,
    TenantIdentity,
    TenantIsolationMode,
    TenantScope,
)
from src.platform.jobs.execution_context import FencedJobExecutionContext
from src.platform.jobs.executor import (
    DurableJobExecutor,
    ExactJobLeaseReaper,
    JobExecutionBoundary,
)

pytestmark = pytest.mark.unit

NOW = datetime(2026, 7, 15, 12, tzinfo=UTC)


class RecordingHandler:
    def __init__(
        self,
        *,
        reconcile_results: list[BaseSchema | None | Exception],
        execute_result: BaseSchema | Exception,
        execute_started: asyncio.Event | None = None,
        execute_release: asyncio.Event | None = None,
        execute_cancelled: asyncio.Event | None = None,
        checkpoint_after_release: bool = False,
        cancel_started: asyncio.Event | None = None,
        cancel_release: asyncio.Event | None = None,
        cancel_cancelled: asyncio.Event | None = None,
        cancel_shutdown_release: asyncio.Event | None = None,
        cancel_cancellation_error: Exception | None = None,
        cancel_error: Exception | None = None,
    ) -> None:
        self.reconcile_results = reconcile_results
        self.execute_result = execute_result
        self.execute_started = execute_started
        self.execute_release = execute_release
        self.execute_cancelled = execute_cancelled
        self.checkpoint_after_release = checkpoint_after_release
        self.cancel_started = cancel_started
        self.cancel_release = cancel_release
        self.cancel_cancelled = cancel_cancelled
        self.cancel_shutdown_release = cancel_shutdown_release
        self.cancel_cancellation_error = cancel_cancellation_error
        self.cancel_error = cancel_error
        self.calls: list[str] = []
        self.tenant_contexts: list[TenantContext | None] = []
        self.reconcile_block_call: int | None = None
        self.reconcile_call_count = 0
        self.reconcile_started: asyncio.Event | None = None
        self.reconcile_release: asyncio.Event | None = None

    async def reconcile(self, *, context) -> BaseSchema | None:  # type: ignore[no-untyped-def]
        _ = context
        self.calls.append("reconcile")
        self.tenant_contexts.append(get_current_tenant_context())
        self.reconcile_call_count += 1
        if self.reconcile_call_count == self.reconcile_block_call:
            if self.reconcile_started is not None:
                self.reconcile_started.set()
            if self.reconcile_release is not None:
                await self.reconcile_release.wait()
        result = self.reconcile_results.pop(0)
        if isinstance(result, Exception):
            raise result
        return result

    async def execute(self, *, context) -> BaseSchema:  # type: ignore[no-untyped-def]
        _ = context
        self.calls.append("execute")
        self.tenant_contexts.append(get_current_tenant_context())
        if self.execute_started is not None:
            self.execute_started.set()
        if self.execute_release is not None:
            try:
                await self.execute_release.wait()
            except asyncio.CancelledError:
                if self.execute_cancelled is not None:
                    self.execute_cancelled.set()
                raise
        if self.checkpoint_after_release:
            await context.checkpoint()
        if isinstance(self.execute_result, Exception):
            raise self.execute_result
        return self.execute_result

    async def cancel(self, *, context) -> None:  # type: ignore[no-untyped-def]
        _ = context
        self.calls.append("cancel")
        self.tenant_contexts.append(get_current_tenant_context())
        if self.cancel_started is not None:
            self.cancel_started.set()
        if self.cancel_release is not None:
            try:
                await self.cancel_release.wait()
            except asyncio.CancelledError:
                if self.cancel_cancelled is not None:
                    self.cancel_cancelled.set()
                if self.cancel_shutdown_release is not None:
                    await self.cancel_shutdown_release.wait()
                if self.cancel_cancellation_error is not None:
                    raise self.cancel_cancellation_error
                raise
        if self.cancel_error is not None:
            raise self.cancel_error


class FailureProjectingHandler(RecordingHandler):
    def __init__(self, *, handled_failure: JobHandledFailure) -> None:
        super().__init__(
            reconcile_results=[None, None],
            execute_result=RuntimeError("must not execute"),
        )
        self.handled_failure = handled_failure
        self.projected_errors: list[object] = []

    async def project_failure(self, *, context, error) -> JobHandledFailure:  # type: ignore[no-untyped-def]
        _ = context
        self.calls.append("project_failure")
        self.projected_errors.append(error)
        return self.handled_failure


class PassThroughFailureProjectingHandler(RecordingHandler):
    def __init__(self) -> None:
        super().__init__(
            reconcile_results=[None, None],
            execute_result=RuntimeError("must not execute"),
        )
        self.projected_errors: list[object] = []

    async def project_failure(self, *, context, error) -> None:  # type: ignore[no-untyped-def]
        _ = context
        self.calls.append("project_failure")
        self.projected_errors.append(error)


class FakeHandlers:
    def __init__(self, *, registration: JobTypeRegistration, handler: RecordingHandler) -> None:
        self.registration = registration
        self.handler = handler

    def require(self, *, job_type: str, job_type_version: int) -> JobTypeRegistration:
        assert (job_type, job_type_version) == self.registration.job_identity
        return self.registration

    def create_handler(self, *, job_type: str, job_type_version: int) -> RecordingHandler:
        assert (job_type, job_type_version) == self.registration.job_identity
        return self.handler


class FakeExecution:
    def __init__(
        self,
        *,
        delivery: JobDeliveryClaim,
        preparation: JobExecutionPreparation,
    ) -> None:
        self.delivery = delivery
        self.preparation = preparation
        self.checkpoint_controls: list[JobExecutionControlSnapshot | Exception] = [preparation.control]
        self.checkpoint_observed: asyncio.Queue[None] = asyncio.Queue()
        self.calls: list[str] = []
        self.progress_updates: list[JobProgressUpdate] = []

    async def accept_delivery(self, command: JobDeliveryCommand) -> JobDeliveryClaim:
        _ = command
        self.calls.append("accept")
        return self.delivery

    async def prepare_execution(self, *, lease: JobExecutionLease) -> JobExecutionPreparation:
        assert lease == self.preparation.lease
        self.calls.append("prepare")
        return self.preparation

    async def checkpoint_execution(
        self,
        *,
        lease: JobExecutionLease,
        progress: JobProgressUpdate | None = None,
    ) -> JobExecutionControlSnapshot:
        assert lease == self.preparation.lease
        self.calls.append("checkpoint")
        if progress is not None:
            self.progress_updates.append(progress)
        self.checkpoint_observed.put_nowait(None)
        control = self.checkpoint_controls.pop(0)
        if isinstance(control, Exception):
            raise control
        return control


class ManualHeartbeatWaiter:
    def __init__(self) -> None:
        self.intervals: list[float] = []
        self._pulses: asyncio.Queue[None] = asyncio.Queue()

    def pulse(self) -> None:
        self._pulses.put_nowait(None)

    async def __call__(self, stop: asyncio.Event, interval_seconds: float) -> bool:
        self.intervals.append(interval_seconds)
        stop_waiter = asyncio.create_task(stop.wait())
        pulse_waiter = asyncio.create_task(self._pulses.get())
        done, pending = await asyncio.wait(
            {stop_waiter, pulse_waiter},
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        return stop_waiter in done


class FailingStopHeartbeatWaiter:
    def __init__(self, *, fail_on_call: int) -> None:
        self.fail_on_call = fail_on_call
        self.calls = 0

    async def __call__(self, stop: asyncio.Event, interval_seconds: float) -> bool:
        _ = interval_seconds
        self.calls += 1
        call = self.calls
        await stop.wait()
        if call == self.fail_on_call:
            raise RuntimeError("heartbeat waiter failed while joining")
        return True


class FakeTerminal:
    def __init__(self) -> None:
        self.success_calls: list[tuple[BaseSchema, JobSuccessCancellationDisposition]] = []
        self.failure_calls: list[object] = []
        self.cancellation_calls = 0
        self.interruption_calls: list[JobHandledInterruption] = []
        self.success_failures: list[Exception] = []

    async def complete_success(
        self,
        *,
        lease: JobExecutionLease,
        result: BaseSchema,
        cancellation_disposition: JobSuccessCancellationDisposition,
    ) -> JobExecutionTerminalOutcome:
        self.success_calls.append((result, cancellation_disposition))
        if self.success_failures:
            raise self.success_failures.pop(0)
        return JobExecutionTerminalOutcome(
            job_id=lease.job_id,
            attempt_id=lease.attempt_id,
            internal_status=JobInternalStatus.SUCCEEDED,
            completed_at=NOW + timedelta(seconds=30),
            result_reference=cast(JsonObject, result.model_dump(mode="json", by_alias=True)),
        )

    async def complete_failure(
        self,
        *,
        lease: JobExecutionLease,
        error,
    ) -> JobExecutionTerminalOutcome:  # type: ignore[no-untyped-def]
        self.failure_calls.append(error)
        return JobExecutionTerminalOutcome(
            job_id=lease.job_id,
            attempt_id=lease.attempt_id,
            internal_status=JobInternalStatus.FAILED,
            completed_at=NOW + timedelta(seconds=30),
            error_code=error.code,
            error_message=error.safe_message,
            error_metadata=error.metadata,
        )

    async def acknowledge_cancellation(
        self,
        *,
        lease: JobExecutionLease,
    ) -> JobExecutionTerminalOutcome:
        self.cancellation_calls += 1
        return JobExecutionTerminalOutcome(
            job_id=lease.job_id,
            attempt_id=lease.attempt_id,
            internal_status=JobInternalStatus.CANCELLED,
            completed_at=NOW + timedelta(seconds=30),
        )

    async def interrupt_for_user(
        self,
        *,
        lease: JobExecutionLease,
        interruption: JobHandledInterruption,
    ) -> JobExecutionTerminalOutcome:
        self.interruption_calls.append(interruption)
        return JobExecutionTerminalOutcome(
            job_id=lease.job_id,
            attempt_id=lease.attempt_id,
            internal_status=JobInternalStatus.WAITING_FOR_USER,
            continuation_reference=interruption.continuation_reference,
        )


class FakeBoundary:
    def __init__(self, *, binding: JobExecutionBinding) -> None:
        self.binding = binding
        self.resolve_calls = 0
        self.authorize_calls = 0
        self.resolve_error: Exception | None = None
        self.authorize_error: Exception | None = None
        self.resolve_started: asyncio.Event | None = None
        self.resolve_release: asyncio.Event | None = None
        self.authorize_started: asyncio.Event | None = None
        self.authorize_release: asyncio.Event | None = None

    async def resolve_for_reconciliation(self, **kwargs) -> JobExecutionBinding:  # type: ignore[no-untyped-def]
        _ = kwargs
        self.resolve_calls += 1
        if self.resolve_started is not None:
            self.resolve_started.set()
        if self.resolve_release is not None:
            await self.resolve_release.wait()
        if self.resolve_error is not None:
            raise self.resolve_error
        return self.binding

    async def authorize_new_effect(self, **kwargs) -> None:  # type: ignore[no-untyped-def]
        _ = kwargs
        self.authorize_calls += 1
        if self.authorize_started is not None:
            self.authorize_started.set()
        if self.authorize_release is not None:
            await self.authorize_release.wait()
        if self.authorize_error is not None:
            raise self.authorize_error


class FakeReaper:
    def __init__(self) -> None:
        self.calls: list[tuple[UUID, UUID]] = []

    async def reap_exact(self, *, job_id: UUID, attempt_id: UUID) -> JobLeaseReapOutcome:
        self.calls.append((job_id, attempt_id))
        return JobLeaseReapOutcome(
            job_id=job_id,
            attempt_id=attempt_id,
            internal_status=JobInternalStatus.DEAD_LETTERED,
        )


def _tenant_context(*, workspace_id: UUID, project_id: UUID) -> TenantContext:
    return TenantContext(
        identity=TenantIdentity(
            organization_id=uuid4(),
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=None,
            site_id=None,
            schema_name="workspace_1234567890abcdefghij",
            isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
        ),
        scope=TenantScope.JOB,
    )


def _control(
    *,
    lease: JobExecutionLease,
    cancellation_requested: bool = False,
) -> JobExecutionControlSnapshot:
    return JobExecutionControlSnapshot(
        job_id=lease.job_id,
        attempt_id=lease.attempt_id,
        fencing_token=lease.fencing_token,
        observed_at=NOW,
        lease_until=lease.lease_until,
        timeout_at=lease.timeout_at,
        cancel_requested_at=NOW if cancellation_requested else None,
        cancel_reason="Stop" if cancellation_requested else None,
    )


def _subject(
    *,
    reconcile_results: list[BaseSchema | None | Exception],
    execute_result: BaseSchema | Exception,
    cancellation_requested: bool = False,
    disposition: JobDeliveryDisposition = JobDeliveryDisposition.CLAIMED,
    execute_started: asyncio.Event | None = None,
    execute_release: asyncio.Event | None = None,
    execute_cancelled: asyncio.Event | None = None,
    checkpoint_after_release: bool = False,
    cancel_started: asyncio.Event | None = None,
    cancel_release: asyncio.Event | None = None,
    cancel_cancelled: asyncio.Event | None = None,
    cancel_shutdown_release: asyncio.Event | None = None,
    cancel_cancellation_error: Exception | None = None,
    cancel_error: Exception | None = None,
    heartbeat_waiter: Callable[[asyncio.Event, float], Awaitable[bool]] | None = None,
    execution_binding: JobExecutionBinding | None = None,
) -> tuple[
    DurableJobExecutor,
    FakeExecution,
    FakeTerminal,
    FakeBoundary,
    FakeReaper,
    RecordingHandler,
    JobDeliveryCommand,
    AssetThumbnailJobResult,
]:
    settings = Settings(app_env="test", database={"enabled": False})
    job_types = build_builtin_job_type_registry(settings)
    definition = job_types.require(job_type="asset.thumbnail.generate", job_type_version=1)
    workspace_id = uuid4()
    project_id = uuid4()
    asset_id = uuid4()
    job_id = uuid4()
    attempt_id = uuid4()
    lease = JobExecutionLease(
        job_id=job_id,
        attempt_id=attempt_id,
        dispatch_sequence=1,
        attempt_number=1,
        worker_id="asset-worker-1",
        fencing_token=uuid4(),
        job_type=definition.job_type,
        job_type_version=definition.job_type_version,
        workload_class=JobWorkloadClass.ASSET_CPU,
        claimed_at=NOW - timedelta(seconds=1),
        lease_until=NOW + timedelta(seconds=90),
        timeout_at=NOW + timedelta(minutes=10),
    )
    if disposition == JobDeliveryDisposition.CLAIMED:
        delivery = JobDeliveryClaim(
            job_id=job_id,
            dispatch_sequence=1,
            disposition=disposition,
            lease=lease,
        )
    elif disposition == JobDeliveryDisposition.LEASE_REAP_REQUIRED:
        delivery = JobDeliveryClaim(
            job_id=job_id,
            dispatch_sequence=1,
            disposition=disposition,
            active_attempt_id=attempt_id,
        )
    else:
        terminal_status = (
            JobInternalStatus.SUCCEEDED if disposition == JobDeliveryDisposition.TERMINAL_DUPLICATE else None
        )
        delivery = JobDeliveryClaim(
            job_id=job_id,
            dispatch_sequence=1,
            disposition=disposition,
            terminal_status=terminal_status,
        )
    target = AssetThumbnailJobTarget(
        workspace_id=workspace_id,
        project_id=project_id,
        entity_id=asset_id,
    )
    input_reference = AssetThumbnailJobInput(
        asset_id=asset_id,
        thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
    )
    result = AssetThumbnailJobResult(
        asset_id=asset_id,
        source_revision="a" * 64,
        thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
        outcome_job_id=job_id,
        produced_widths=(320, 640),
    )
    preparation = JobExecutionPreparation(
        lease=lease,
        target_descriptor=target.model_dump(mode="json", by_alias=True),
        input_reference=input_reference.model_dump(mode="json", by_alias=True),
        source_revision=result.source_revision,
        request_fingerprint="b" * 64,
        correlation_id="executor-unit-test",
        actor_user_id=uuid4(),
        authority_mode=definition.authority_mode,
        phase=definition.initial_phase,
        control=_control(lease=lease, cancellation_requested=cancellation_requested),
    )
    handler = RecordingHandler(
        reconcile_results=reconcile_results,
        execute_result=execute_result,
        execute_started=execute_started,
        execute_release=execute_release,
        execute_cancelled=execute_cancelled,
        checkpoint_after_release=checkpoint_after_release,
        cancel_started=cancel_started,
        cancel_release=cancel_release,
        cancel_cancelled=cancel_cancelled,
        cancel_shutdown_release=cancel_shutdown_release,
        cancel_cancellation_error=cancel_cancellation_error,
        cancel_error=cancel_error,
    )
    registration = JobTypeRegistration.from_definition(
        definition=definition,
        handler_factory=lambda: handler,
    )
    handlers = FakeHandlers(registration=registration, handler=handler)
    execution = FakeExecution(delivery=delivery, preparation=preparation)
    terminal = FakeTerminal()
    tenant_binding = TenantExecutionBinding(
        tenant_context=_tenant_context(workspace_id=workspace_id, project_id=project_id)
    )
    boundary = FakeBoundary(binding=execution_binding if execution_binding is not None else tenant_binding)
    reaper = FakeReaper()
    executor = DurableJobExecutor(
        execution=cast(BackgroundJobExecutionService, execution),
        terminal=cast(BackgroundJobTerminalService, terminal),
        lease_reaper=cast(ExactJobLeaseReaper, reaper),
        job_types=job_types,
        handlers=cast(JobExecutionRegistry, handlers),
        boundary=cast(JobExecutionBoundary, boundary),
        heartbeat_waiter=heartbeat_waiter,
    )
    command = JobDeliveryCommand(
        task_name=definition.task_name,
        envelope=JobDispatchEnvelope(
            job_id=job_id,
            dispatch_sequence=1,
            job_type=definition.job_type,
            job_type_version=definition.job_type_version,
            workload_class=definition.workload_class,
            target_descriptor=target.model_dump(mode="json", by_alias=True),
            request_fingerprint=preparation.request_fingerprint,
        ),
        worker_id=lease.worker_id,
        transport_message_id="taskiq-message-1",
        received_at=NOW,
    )
    return executor, execution, terminal, boundary, reaper, handler, command, result


@pytest.mark.asyncio
async def test_boundary_resolution_is_renewed_without_preempting_marker_first_cancellation() -> None:
    resolve_started = asyncio.Event()
    resolve_release = asyncio.Event()
    heartbeat_waiter = ManualHeartbeatWaiter()
    subject = _subject(
        reconcile_results=[],
        execute_result=RuntimeError("must not execute"),
        heartbeat_waiter=heartbeat_waiter,
    )
    executor, execution, terminal, boundary, _, handler, command, result = subject
    handler.reconcile_results.append(result)
    boundary.resolve_started = resolve_started
    boundary.resolve_release = resolve_release
    execution.checkpoint_controls = [
        _control(lease=execution.preparation.lease, cancellation_requested=True),
    ]

    delivery = asyncio.create_task(executor.execute_delivery(command=command))
    await asyncio.wait_for(resolve_started.wait(), timeout=1)
    heartbeat_waiter.pulse()
    await asyncio.wait_for(execution.checkpoint_observed.get(), timeout=1)

    assert not delivery.done()
    assert handler.calls == []

    resolve_release.set()
    outcome = await asyncio.wait_for(delivery, timeout=1)

    assert outcome.terminal is not None
    assert outcome.terminal.internal_status == JobInternalStatus.SUCCEEDED
    assert handler.calls == ["reconcile"]
    assert boundary.authorize_calls == 0
    assert terminal.cancellation_calls == 0


@pytest.mark.asyncio
async def test_initial_reconciliation_is_renewed_before_new_effect_authorization() -> None:
    reconcile_started = asyncio.Event()
    reconcile_release = asyncio.Event()
    heartbeat_waiter = ManualHeartbeatWaiter()
    subject = _subject(
        reconcile_results=[None],
        execute_result=RuntimeError("replaced below"),
        heartbeat_waiter=heartbeat_waiter,
    )
    executor, execution, _, boundary, _, handler, command, result = subject
    handler.execute_result = result
    handler.reconcile_block_call = 1
    handler.reconcile_started = reconcile_started
    handler.reconcile_release = reconcile_release
    control = _control(lease=execution.preparation.lease)
    execution.checkpoint_controls = [control, control, control, control]

    delivery = asyncio.create_task(executor.execute_delivery(command=command))
    await asyncio.wait_for(reconcile_started.wait(), timeout=1)
    heartbeat_waiter.pulse()
    await asyncio.wait_for(execution.checkpoint_observed.get(), timeout=1)

    assert not delivery.done()
    assert boundary.authorize_calls == 0

    reconcile_release.set()
    outcome = await asyncio.wait_for(delivery, timeout=1)

    assert outcome.terminal is not None
    assert outcome.terminal.internal_status == JobInternalStatus.SUCCEEDED
    assert boundary.authorize_calls == 1


@pytest.mark.asyncio
async def test_new_effect_authorization_is_renewed_before_handler_execution() -> None:
    authorize_started = asyncio.Event()
    authorize_release = asyncio.Event()
    heartbeat_waiter = ManualHeartbeatWaiter()
    subject = _subject(
        reconcile_results=[None],
        execute_result=RuntimeError("replaced below"),
        heartbeat_waiter=heartbeat_waiter,
    )
    executor, execution, _, boundary, _, handler, command, result = subject
    handler.execute_result = result
    boundary.authorize_started = authorize_started
    boundary.authorize_release = authorize_release
    control = _control(lease=execution.preparation.lease)
    execution.checkpoint_controls = [control, control, control, control]

    delivery = asyncio.create_task(executor.execute_delivery(command=command))
    await asyncio.wait_for(authorize_started.wait(), timeout=1)
    heartbeat_waiter.pulse()
    await asyncio.wait_for(execution.checkpoint_observed.get(), timeout=1)

    assert not delivery.done()
    assert handler.calls == ["reconcile"]

    authorize_release.set()
    outcome = await asyncio.wait_for(delivery, timeout=1)

    assert outcome.terminal is not None
    assert outcome.terminal.internal_status == JobInternalStatus.SUCCEEDED
    assert handler.calls == ["reconcile", "execute"]


@pytest.mark.asyncio
async def test_failure_reconciliation_is_renewed_before_terminal_projection() -> None:
    reconcile_started = asyncio.Event()
    reconcile_release = asyncio.Event()
    heartbeat_waiter = ManualHeartbeatWaiter()
    handler_error = TransientJobExecutionError(
        code="BACKGROUND_JOB_WORKER_LOST",
        safe_message="Worker lost",
    )
    subject = _subject(
        reconcile_results=[None, None],
        execute_result=handler_error,
        heartbeat_waiter=heartbeat_waiter,
    )
    executor, execution, terminal, _, _, handler, command, _ = subject
    handler.reconcile_block_call = 2
    handler.reconcile_started = reconcile_started
    handler.reconcile_release = reconcile_release
    control = _control(lease=execution.preparation.lease)
    execution.checkpoint_controls = [control, control, control, control]

    delivery = asyncio.create_task(executor.execute_delivery(command=command))
    await asyncio.wait_for(reconcile_started.wait(), timeout=1)
    await asyncio.wait_for(execution.checkpoint_observed.get(), timeout=1)
    heartbeat_waiter.pulse()
    await asyncio.wait_for(execution.checkpoint_observed.get(), timeout=1)

    assert not delivery.done()
    assert terminal.failure_calls == []

    reconcile_release.set()
    outcome = await asyncio.wait_for(delivery, timeout=1)

    assert outcome.terminal is not None
    assert outcome.terminal.internal_status == JobInternalStatus.FAILED
    assert terminal.failure_calls == [handler_error]


@pytest.mark.asyncio
async def test_blocking_handler_is_renewed_on_the_registered_heartbeat_interval() -> None:
    execute_started = asyncio.Event()
    execute_release = asyncio.Event()
    heartbeat_waiter = ManualHeartbeatWaiter()
    subject = _subject(
        reconcile_results=[None],
        execute_result=RuntimeError("replaced below"),
        execute_started=execute_started,
        execute_release=execute_release,
        heartbeat_waiter=heartbeat_waiter,
    )
    executor, execution, terminal, _, _, handler, command, result = subject
    handler.execute_result = result
    control = _control(lease=execution.preparation.lease)
    execution.checkpoint_controls = [control, control, control]

    delivery = asyncio.create_task(executor.execute_delivery(command=command))
    await asyncio.wait_for(execute_started.wait(), timeout=1)
    await asyncio.wait_for(execution.checkpoint_observed.get(), timeout=1)

    heartbeat_waiter.pulse()
    await asyncio.wait_for(execution.checkpoint_observed.get(), timeout=1)
    heartbeat_waiter.pulse()
    await asyncio.wait_for(execution.checkpoint_observed.get(), timeout=1)

    assert not delivery.done()
    assert terminal.success_calls == []
    assert heartbeat_waiter.intervals[:2] == [30, 30]

    execute_release.set()
    outcome = await asyncio.wait_for(delivery, timeout=1)

    assert outcome.terminal is not None
    assert outcome.terminal.internal_status == JobInternalStatus.SUCCEEDED
    assert execution.calls.count("checkpoint") == 3


@pytest.mark.asyncio
async def test_keepalive_cancellation_waits_for_handler_safe_point_before_cleanup_and_ack() -> None:
    execute_started = asyncio.Event()
    execute_release = asyncio.Event()
    heartbeat_waiter = ManualHeartbeatWaiter()
    subject = _subject(
        reconcile_results=[None, None, None],
        execute_result=RuntimeError("replaced below"),
        execute_started=execute_started,
        execute_release=execute_release,
        checkpoint_after_release=True,
        heartbeat_waiter=heartbeat_waiter,
    )
    executor, execution, terminal, _, _, handler, command, result = subject
    handler.execute_result = result
    lease = execution.preparation.lease
    execution.checkpoint_controls = [
        _control(lease=lease),
        _control(lease=lease, cancellation_requested=True),
    ]

    delivery = asyncio.create_task(executor.execute_delivery(command=command))
    await asyncio.wait_for(execute_started.wait(), timeout=1)
    await asyncio.wait_for(execution.checkpoint_observed.get(), timeout=1)

    heartbeat_waiter.pulse()
    await asyncio.wait_for(execution.checkpoint_observed.get(), timeout=1)

    assert not delivery.done()
    assert handler.calls == ["reconcile", "execute"]
    assert terminal.cancellation_calls == 0

    execute_release.set()
    outcome = await asyncio.wait_for(delivery, timeout=1)

    assert outcome.terminal is not None
    assert outcome.terminal.internal_status == JobInternalStatus.CANCELLED
    assert handler.calls == ["reconcile", "execute", "reconcile", "cancel", "reconcile"]
    assert terminal.cancellation_calls == 1
    assert execution.calls.count("checkpoint") == 2


@pytest.mark.asyncio
async def test_keepalive_lease_loss_stops_cancellable_handler_without_terminal_projection() -> None:
    execute_started = asyncio.Event()
    execute_release = asyncio.Event()
    execute_cancelled = asyncio.Event()
    heartbeat_waiter = ManualHeartbeatWaiter()
    subject = _subject(
        reconcile_results=[None],
        execute_result=RuntimeError("replaced below"),
        execute_started=execute_started,
        execute_release=execute_release,
        execute_cancelled=execute_cancelled,
        heartbeat_waiter=heartbeat_waiter,
    )
    executor, execution, terminal, _, _, handler, command, result = subject
    handler.execute_result = result
    lease = execution.preparation.lease
    lease_lost = JobExecutionLeaseLostError(
        job_id=lease.job_id,
        attempt_id=lease.attempt_id,
        reason="The heartbeat fence no longer belongs to this worker",
    )
    execution.checkpoint_controls = [_control(lease=lease), lease_lost]

    delivery = asyncio.create_task(executor.execute_delivery(command=command))
    await asyncio.wait_for(execute_started.wait(), timeout=1)
    await asyncio.wait_for(execution.checkpoint_observed.get(), timeout=1)

    heartbeat_waiter.pulse()
    await asyncio.wait_for(execution.checkpoint_observed.get(), timeout=1)

    try:
        await asyncio.wait_for(execute_cancelled.wait(), timeout=1)
    except BaseException:
        delivery.cancel()
        execute_release.set()
        await asyncio.gather(delivery, return_exceptions=True)
        raise

    with pytest.raises(JobExecutionLeaseLostError) as exc_info:
        await asyncio.wait_for(delivery, timeout=1)

    assert exc_info.value is lease_lost
    assert execute_cancelled.is_set()
    assert handler.calls == ["reconcile", "execute"]
    assert terminal.success_calls == []
    assert terminal.failure_calls == []


@pytest.mark.asyncio
async def test_outer_cancellation_is_not_replaced_by_keepalive_join_failure() -> None:
    execute_started = asyncio.Event()
    execute_release = asyncio.Event()
    subject = _subject(
        reconcile_results=[None, None],
        execute_result=RuntimeError("must not execute"),
        execute_started=execute_started,
        execute_release=execute_release,
        heartbeat_waiter=FailingStopHeartbeatWaiter(fail_on_call=4),
    )
    executor, _, terminal, _, _, handler, command, _ = subject

    delivery = asyncio.create_task(executor.execute_delivery(command=command))
    await asyncio.wait_for(execute_started.wait(), timeout=1)
    delivery.cancel()

    try:
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(delivery, timeout=1)
    finally:
        execute_release.set()

    assert handler.calls == ["reconcile", "execute"]
    assert terminal.success_calls == []
    assert terminal.failure_calls == []


@pytest.mark.asyncio
async def test_repeated_outer_cancellation_waits_for_real_blocking_operation_to_settle() -> None:
    heartbeat_waiter = ManualHeartbeatWaiter()
    subject = _subject(
        reconcile_results=[],
        execute_result=RuntimeError("unused"),
        heartbeat_waiter=heartbeat_waiter,
    )
    executor, execution, _, _, _, _, _, result = subject
    preparation = execution.preparation
    context = FencedJobExecutionContext(
        execution=cast(BackgroundJobExecutionService, execution),
        idempotency_namespace="asset.thumbnail.generate",
        lease=preparation.lease,
        target=AssetThumbnailJobTarget.model_validate(preparation.target_descriptor),
        input_reference=AssetThumbnailJobInput.model_validate(preparation.input_reference),
        source_revision=preparation.source_revision,
        request_fingerprint=preparation.request_fingerprint,
        raise_on_cancellation=False,
    )
    thread_started = ThreadEvent()
    thread_release = ThreadEvent()
    thread_done = ThreadEvent()
    operation_settling = asyncio.Event()

    def _blocking_operation() -> AssetThumbnailJobResult:
        thread_started.set()
        try:
            if not thread_release.wait(timeout=5):
                raise TimeoutError("blocking test operation was not released")
            return result
        finally:
            thread_done.set()

    async def _operation() -> AssetThumbnailJobResult:
        thread_task = asyncio.create_task(asyncio.to_thread(_blocking_operation))
        try:
            return await asyncio.shield(thread_task)
        except asyncio.CancelledError:
            operation_settling.set()
            await thread_task
            raise

    delivery = asyncio.create_task(
        executor._run_with_heartbeat_evidence(
            operation=_operation(),
            context=context,
            heartbeat_seconds=30,
        )
    )
    try:
        assert await asyncio.to_thread(thread_started.wait, 1)
        delivery.cancel()
        await asyncio.wait_for(operation_settling.wait(), timeout=1)

        delivery.cancel()
        await asyncio.sleep(0.05)

        assert not delivery.done()
        assert not thread_done.is_set()
    finally:
        thread_release.set()

    with pytest.raises(asyncio.CancelledError) as exc_info:
        await asyncio.wait_for(delivery, timeout=1)
    assert thread_done.is_set()
    assert exc_info.value.__notes__ == ["operation shutdown received another cancellation while settling"]


@pytest.mark.asyncio
async def test_handler_error_wins_over_joining_keepalive_error() -> None:
    handler_error = TransientJobExecutionError(
        code="ASSET_THUMBNAIL_RENDERER_TEMPORARILY_UNAVAILABLE",
        safe_message="The thumbnail renderer is temporarily unavailable",
    )
    subject = _subject(
        reconcile_results=[None, None],
        execute_result=handler_error,
        heartbeat_waiter=FailingStopHeartbeatWaiter(fail_on_call=4),
    )
    executor, _, terminal, _, _, handler, command, _ = subject

    outcome = await executor.execute_delivery(command=command)

    assert outcome.terminal is not None
    assert outcome.terminal.internal_status == JobInternalStatus.FAILED
    assert terminal.failure_calls == [handler_error]
    assert handler_error.__notes__ == ["keepalive also failed with _JobHeartbeatUnavailableError"]
    assert handler.calls == ["reconcile", "execute", "reconcile"]
    assert terminal.success_calls == []
    assert terminal.cancellation_calls == 0


@pytest.mark.asyncio
async def test_active_heartbeat_failure_wins_when_handler_error_completes_in_same_tick(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    handler_error = TransientJobExecutionError(
        code="ASSET_THUMBNAIL_RENDERER_TEMPORARILY_UNAVAILABLE",
        safe_message="The thumbnail renderer is temporarily unavailable",
    )
    subject = _subject(reconcile_results=[], execute_result=RuntimeError("unused"))
    executor, execution, _, _, _, _, _, _ = subject
    preparation = execution.preparation
    execution.checkpoint_controls = [RuntimeError("database heartbeat unavailable")]
    context = FencedJobExecutionContext(
        execution=cast(BackgroundJobExecutionService, execution),
        idempotency_namespace="asset.thumbnail.generate",
        lease=preparation.lease,
        target=AssetThumbnailJobTarget.model_validate(preparation.target_descriptor),
        input_reference=AssetThumbnailJobInput.model_validate(preparation.input_reference),
        source_revision=preparation.source_revision,
        request_fingerprint=preparation.request_fingerprint,
        raise_on_cancellation=False,
    )
    real_wait = asyncio.wait
    wait_calls = 0

    async def _wait_for_both(tasks, *, return_when):  # type: ignore[no-untyped-def]
        nonlocal wait_calls
        wait_calls += 1
        if wait_calls == 1:
            await asyncio.gather(*tasks, return_exceptions=True)
            return set(tasks), set()
        return await real_wait(tasks, return_when=return_when)

    async def _immediate_heartbeat(_stop: asyncio.Event, _seconds: float) -> bool:
        return False

    async def _failing_operation() -> AssetThumbnailJobResult:
        raise handler_error

    monkeypatch.setattr(asyncio, "wait", _wait_for_both)
    executor.heartbeat_waiter = _immediate_heartbeat

    with pytest.raises(RuntimeError, match="heartbeat failed") as exc_info:
        await executor._run_with_heartbeat_evidence(
            operation=_failing_operation(),
            context=context,
            heartbeat_seconds=30,
        )

    assert exc_info.value is not handler_error
    assert exc_info.value.__notes__ == ["operation also failed with TransientJobExecutionError"]


@pytest.mark.asyncio
async def test_heartbeat_infrastructure_failure_stops_handler_without_terminal_projection() -> None:
    execute_started = asyncio.Event()
    execute_release = asyncio.Event()
    execute_cancelled = asyncio.Event()
    heartbeat_waiter = ManualHeartbeatWaiter()
    subject = _subject(
        reconcile_results=[None],
        execute_result=RuntimeError("must not execute"),
        execute_started=execute_started,
        execute_release=execute_release,
        execute_cancelled=execute_cancelled,
        heartbeat_waiter=heartbeat_waiter,
    )
    executor, execution, terminal, _, _, handler, command, _ = subject
    execution.checkpoint_controls = [
        _control(lease=execution.preparation.lease),
        RuntimeError("database heartbeat unavailable"),
    ]

    delivery = asyncio.create_task(executor.execute_delivery(command=command))
    await asyncio.wait_for(execute_started.wait(), timeout=1)
    await asyncio.wait_for(execution.checkpoint_observed.get(), timeout=1)
    heartbeat_waiter.pulse()
    await asyncio.wait_for(execution.checkpoint_observed.get(), timeout=1)

    try:
        await asyncio.wait_for(execute_cancelled.wait(), timeout=1)
    finally:
        execute_release.set()

    with pytest.raises(RuntimeError, match="heartbeat failed"):
        await asyncio.wait_for(delivery, timeout=1)

    assert handler.calls == ["reconcile", "execute"]
    assert terminal.success_calls == []
    assert terminal.failure_calls == []


@pytest.mark.asyncio
async def test_cancellation_cleanup_keeps_lease_and_acknowledges_only_after_release() -> None:
    cancel_started = asyncio.Event()
    cancel_release = asyncio.Event()
    heartbeat_waiter = ManualHeartbeatWaiter()
    subject = _subject(
        reconcile_results=[None, None],
        execute_result=RuntimeError("must not execute"),
        cancellation_requested=True,
        cancel_started=cancel_started,
        cancel_release=cancel_release,
        heartbeat_waiter=heartbeat_waiter,
    )
    executor, execution, terminal, _, _, handler, command, _ = subject
    execution.checkpoint_controls = [_control(lease=execution.preparation.lease, cancellation_requested=True)]

    delivery = asyncio.create_task(executor.execute_delivery(command=command))
    await asyncio.wait_for(cancel_started.wait(), timeout=1)

    try:
        heartbeat_waiter.pulse()
        await asyncio.wait_for(execution.checkpoint_observed.get(), timeout=1)

        assert not delivery.done()
        assert handler.calls == ["reconcile", "cancel"]
        assert terminal.cancellation_calls == 0
    finally:
        cancel_release.set()

    outcome = await asyncio.wait_for(delivery, timeout=1)

    assert outcome.terminal is not None
    assert outcome.terminal.internal_status == JobInternalStatus.CANCELLED
    assert handler.calls == ["reconcile", "cancel", "reconcile"]
    assert terminal.cancellation_calls == 1


@pytest.mark.asyncio
async def test_cleanup_keepalive_lease_loss_stops_cleanup_without_acknowledgement() -> None:
    cancel_started = asyncio.Event()
    cancel_release = asyncio.Event()
    cancel_cancelled = asyncio.Event()
    cleanup_error = RuntimeError("cleanup failed while surrendering the lost lease")
    heartbeat_waiter = ManualHeartbeatWaiter()
    subject = _subject(
        reconcile_results=[None],
        execute_result=RuntimeError("must not execute"),
        cancellation_requested=True,
        cancel_started=cancel_started,
        cancel_release=cancel_release,
        cancel_cancelled=cancel_cancelled,
        cancel_cancellation_error=cleanup_error,
        heartbeat_waiter=heartbeat_waiter,
    )
    executor, execution, terminal, _, _, handler, command, _ = subject
    lease = execution.preparation.lease
    lease_lost = JobExecutionLeaseLostError(
        job_id=lease.job_id,
        attempt_id=lease.attempt_id,
        reason="The cleanup heartbeat fence no longer belongs to this worker",
    )
    execution.checkpoint_controls = [lease_lost]

    delivery = asyncio.create_task(executor.execute_delivery(command=command))
    await asyncio.wait_for(cancel_started.wait(), timeout=1)
    heartbeat_waiter.pulse()
    await asyncio.wait_for(execution.checkpoint_observed.get(), timeout=1)
    await asyncio.wait_for(cancel_cancelled.wait(), timeout=1)

    with pytest.raises(JobExecutionLeaseLostError) as exc_info:
        await asyncio.wait_for(delivery, timeout=1)

    assert exc_info.value is lease_lost
    assert exc_info.value.__notes__ == ["operation shutdown also failed with RuntimeError"]
    assert handler.calls == ["reconcile", "cancel"]
    assert terminal.cancellation_calls == 0
    assert terminal.success_calls == []
    assert terminal.failure_calls == []


@pytest.mark.asyncio
async def test_cleanup_error_wins_over_joining_keepalive_error_without_acknowledgement() -> None:
    cleanup_error = RuntimeError("owned thumbnail cleanup failed")
    subject = _subject(
        reconcile_results=[None],
        execute_result=RuntimeError("must not execute"),
        cancellation_requested=True,
        cancel_error=cleanup_error,
        heartbeat_waiter=FailingStopHeartbeatWaiter(fail_on_call=3),
    )
    executor, _, terminal, _, _, handler, command, _ = subject

    with pytest.raises(RuntimeError, match="owned thumbnail cleanup failed") as exc_info:
        await executor.execute_delivery(command=command)

    assert exc_info.value is cleanup_error
    assert exc_info.value.__notes__ == ["keepalive also failed with _JobHeartbeatUnavailableError"]
    assert handler.calls == ["reconcile", "cancel"]
    assert terminal.cancellation_calls == 0
    assert terminal.success_calls == []
    assert terminal.failure_calls == []


@pytest.mark.asyncio
async def test_outer_cancellation_waits_for_cleanup_cancellation_before_propagating() -> None:
    cancel_started = asyncio.Event()
    cancel_release = asyncio.Event()
    cancel_cancelled = asyncio.Event()
    cancel_shutdown_release = asyncio.Event()
    cleanup_error = RuntimeError("cleanup failed while handling worker cancellation")
    subject = _subject(
        reconcile_results=[None],
        execute_result=RuntimeError("must not execute"),
        cancellation_requested=True,
        cancel_started=cancel_started,
        cancel_release=cancel_release,
        cancel_cancelled=cancel_cancelled,
        cancel_shutdown_release=cancel_shutdown_release,
        cancel_cancellation_error=cleanup_error,
    )
    executor, _, terminal, _, _, handler, command, _ = subject

    delivery = asyncio.create_task(executor.execute_delivery(command=command))
    await asyncio.wait_for(cancel_started.wait(), timeout=1)
    delivery.cancel()
    await asyncio.wait_for(cancel_cancelled.wait(), timeout=1)

    assert not delivery.done()
    assert handler.calls == ["reconcile", "cancel"]
    assert terminal.cancellation_calls == 0

    cancel_shutdown_release.set()
    with pytest.raises(asyncio.CancelledError) as exc_info:
        await asyncio.wait_for(delivery, timeout=1)

    assert exc_info.value.__notes__ == ["operation also failed with RuntimeError"]
    assert terminal.cancellation_calls == 0
    assert terminal.success_calls == []
    assert terminal.failure_calls == []


@pytest.mark.asyncio
async def test_marker_first_reconciliation_projects_success_without_new_effect() -> None:
    subject = _subject(reconcile_results=[], execute_result=RuntimeError("must not execute"))
    executor, _, terminal, boundary, _, handler, command, result = subject
    handler.reconcile_results.append(result)

    outcome = await executor.execute_delivery(command=command)

    assert outcome.terminal is not None
    assert outcome.terminal.internal_status == JobInternalStatus.SUCCEEDED
    assert handler.calls == ["reconcile"]
    assert boundary.authorize_calls == 0
    assert terminal.success_calls[0][1] == JobSuccessCancellationDisposition.ACKNOWLEDGE_IF_PRESENT
    assert get_current_tenant_context() is None


@pytest.mark.asyncio
async def test_handler_interruption_releases_attempt_into_waiting_for_user() -> None:
    interruption = JobHandledInterruption(
        reason="approval_required",
        phase="waiting_for_user",
        status_key="AI_AGENT_RUN_STATUS_WAITING_FOR_USER",
        continuation_reference={"checkpointId": "checkpoint-1", "runId": "run-1"},
    )
    subject = _subject(reconcile_results=[None], execute_result=interruption)
    executor, _, terminal, boundary, _, handler, command, _ = subject

    outcome = await executor.execute_delivery(command=command)

    assert outcome.terminal is not None
    assert outcome.terminal.internal_status == JobInternalStatus.WAITING_FOR_USER
    assert outcome.terminal.continuation_reference == interruption.continuation_reference
    assert handler.calls == ["reconcile", "execute"]
    assert boundary.authorize_calls == 1
    assert terminal.interruption_calls == [interruption]
    assert terminal.success_calls == []
    assert terminal.failure_calls == []


@pytest.mark.asyncio
async def test_project_definition_rejects_system_binding_without_running_handler() -> None:
    subject = _subject(
        reconcile_results=[None],
        execute_result=RuntimeError("replaced below"),
        execution_binding=SystemExecutionBinding(),
    )
    executor, _, terminal, boundary, _, handler, command, result = subject
    handler.execute_result = result

    outcome = await executor.execute_delivery(command=command)

    assert outcome.terminal is not None
    assert outcome.terminal.internal_status == JobInternalStatus.FAILED
    assert outcome.terminal.error_code == "BACKGROUND_JOB_EXECUTION_CONTRACT_MISMATCH"
    assert handler.calls == []
    assert handler.tenant_contexts == []
    assert boundary.authorize_calls == 0
    assert len(terminal.failure_calls) == 1
    assert get_current_tenant_context() is None


@pytest.mark.asyncio
async def test_initial_reconciliation_permanent_failure_projects_terminal_evidence() -> None:
    error = PermanentJobExecutionError(
        code="ASSET_THUMBNAIL_OUTCOME_INVALID",
        safe_message="The stored thumbnail outcome conflicts with the canonical Job",
    )
    subject = _subject(
        reconcile_results=[error],
        execute_result=RuntimeError("must not execute"),
    )
    executor, _, terminal, boundary, _, handler, command, _ = subject

    outcome = await executor.execute_delivery(command=command)

    assert outcome.terminal is not None
    assert outcome.terminal.internal_status == JobInternalStatus.FAILED
    assert handler.calls == ["reconcile"]
    assert boundary.authorize_calls == 0
    assert terminal.failure_calls == [error]
    assert terminal.cancellation_calls == 0


@pytest.mark.asyncio
async def test_existing_marker_wins_over_pending_cancellation() -> None:
    subject = _subject(
        reconcile_results=[],
        execute_result=RuntimeError("must not execute"),
        cancellation_requested=True,
    )
    executor, _, terminal, _, _, handler, command, result = subject
    handler.reconcile_results.append(result)

    outcome = await executor.execute_delivery(command=command)

    assert outcome.terminal is not None
    assert outcome.terminal.internal_status == JobInternalStatus.SUCCEEDED
    assert handler.calls == ["reconcile"]
    assert terminal.cancellation_calls == 0


@pytest.mark.asyncio
async def test_pending_cancellation_without_marker_runs_cleanup_then_acknowledges() -> None:
    subject = _subject(
        reconcile_results=[None, None],
        execute_result=RuntimeError("must not execute"),
        cancellation_requested=True,
    )
    executor, _, terminal, boundary, _, handler, command, _ = subject

    outcome = await executor.execute_delivery(command=command)

    assert outcome.terminal is not None
    assert outcome.terminal.internal_status == JobInternalStatus.CANCELLED
    assert handler.calls == ["reconcile", "cancel", "reconcile"]
    assert boundary.authorize_calls == 0
    assert terminal.cancellation_calls == 1


@pytest.mark.asyncio
async def test_checkpoint_cancellation_reconciles_again_before_cleanup() -> None:
    subject = _subject(reconcile_results=[None, None, None], execute_result=RuntimeError("must not execute"))
    executor, execution, terminal, boundary, _, handler, command, _ = subject
    execution.checkpoint_controls = [_control(lease=execution.preparation.lease, cancellation_requested=True)]

    outcome = await executor.execute_delivery(command=command)

    assert outcome.terminal is not None
    assert outcome.terminal.internal_status == JobInternalStatus.CANCELLED
    assert handler.calls == ["reconcile", "reconcile", "cancel", "reconcile"]
    assert boundary.authorize_calls == 1
    assert terminal.cancellation_calls == 1


@pytest.mark.asyncio
async def test_marker_committed_during_cleanup_wins_before_cancellation_acknowledgement() -> None:
    subject = _subject(
        reconcile_results=[],
        execute_result=RuntimeError("must not execute"),
        cancellation_requested=True,
    )
    executor, _, terminal, boundary, _, handler, command, result = subject
    handler.reconcile_results.extend([None, result])

    outcome = await executor.execute_delivery(command=command)

    assert outcome.terminal is not None
    assert outcome.terminal.internal_status == JobInternalStatus.SUCCEEDED
    assert handler.calls == ["reconcile", "cancel", "reconcile"]
    assert boundary.authorize_calls == 0
    assert terminal.cancellation_calls == 0
    assert terminal.success_calls == [(result, JobSuccessCancellationDisposition.ACKNOWLEDGE_IF_PRESENT)]


@pytest.mark.asyncio
async def test_handler_failure_reconciles_marker_before_failure_projection() -> None:
    error = TransientJobExecutionError(
        code="BACKGROUND_JOB_WORKER_LOST",
        safe_message="Worker lost",
    )
    subject = _subject(reconcile_results=[], execute_result=error)
    executor, _, terminal, _, _, handler, command, result = subject
    handler.reconcile_results.extend([None, result])

    outcome = await executor.execute_delivery(command=command)

    assert outcome.terminal is not None
    assert outcome.terminal.internal_status == JobInternalStatus.SUCCEEDED
    assert handler.calls == ["reconcile", "execute", "reconcile"]
    assert terminal.failure_calls == []


@pytest.mark.asyncio
async def test_handler_failure_without_marker_projects_typed_failure() -> None:
    error = PermanentJobExecutionError(
        code="ASSET_THUMBNAIL_TARGET_NOT_FOUND",
        safe_message="Asset target no longer exists",
    )
    subject = _subject(reconcile_results=[None, None], execute_result=error)
    executor, _, terminal, _, _, handler, command, _ = subject

    outcome = await executor.execute_delivery(command=command)

    assert outcome.terminal is not None
    assert outcome.terminal.internal_status == JobInternalStatus.FAILED
    assert handler.calls == ["reconcile", "execute", "reconcile"]
    assert terminal.failure_calls == [error]


@pytest.mark.asyncio
async def test_opt_in_handler_projects_boundary_failure_before_job_terminalization() -> None:
    boundary_error = PermanentJobExecutionError(
        code="BACKGROUND_JOB_ACTOR_PERMISSION_REVOKED",
        safe_message="Actor permission was revoked",
    )
    handled = JobHandledFailure(
        code="AGENT_RUN_EXECUTION_FAILED",
        safe_message="Agent run failed",
        metadata={"publicErrorCode": boundary_error.code},
    )
    subject = _subject(
        reconcile_results=[None],
        execute_result=RuntimeError("must not execute"),
    )
    executor, _, terminal, boundary, _, _, command, _ = subject
    handler = FailureProjectingHandler(handled_failure=handled)
    cast(FakeHandlers, executor.handlers).handler = handler
    boundary.authorize_error = boundary_error

    outcome = await executor.execute_delivery(command=command)

    assert outcome.terminal is not None
    assert outcome.terminal.internal_status == JobInternalStatus.FAILED
    assert outcome.terminal.error_code == handled.code
    assert handler.calls == ["reconcile", "reconcile", "project_failure"]
    assert handler.projected_errors == [boundary_error]
    assert len(terminal.failure_calls) == 1


@pytest.mark.asyncio
async def test_failure_projection_can_preserve_the_original_retry_classification() -> None:
    boundary_error = TransientJobExecutionError(
        code="BACKGROUND_JOB_WORKER_LOST",
        safe_message="Worker lost",
    )
    subject = _subject(
        reconcile_results=[None],
        execute_result=RuntimeError("must not execute"),
    )
    executor, _, terminal, boundary, _, _, command, _ = subject
    handler = PassThroughFailureProjectingHandler()
    cast(FakeHandlers, executor.handlers).handler = handler
    boundary.authorize_error = boundary_error

    outcome = await executor.execute_delivery(command=command)

    assert outcome.terminal is not None
    assert handler.calls == ["reconcile", "reconcile", "project_failure"]
    assert handler.projected_errors == [boundary_error]
    assert terminal.failure_calls == [boundary_error]


@pytest.mark.asyncio
async def test_unexpected_handler_exception_is_sanitized_after_reconciliation() -> None:
    subject = _subject(
        reconcile_results=[None, None],
        execute_result=RuntimeError("raw provider body must not persist"),
    )
    executor, _, terminal, _, _, _, command, _ = subject

    outcome = await executor.execute_delivery(command=command)

    assert outcome.terminal is not None
    assert outcome.terminal.internal_status == JobInternalStatus.FAILED
    assert len(terminal.failure_calls) == 1
    error = terminal.failure_calls[0]
    assert isinstance(error, UnexpectedJobExecutionError)
    assert "raw provider" not in error.safe_message.lower()


@pytest.mark.asyncio
async def test_ambiguous_success_projection_reconciles_and_replays_without_reexecution() -> None:
    subject = _subject(reconcile_results=[], execute_result=RuntimeError("placeholder"))
    executor, _, terminal, _, _, handler, command, result = subject
    handler.reconcile_results.extend([None, result])
    handler.execute_result = result
    terminal.success_failures.append(RuntimeError("response lost after commit"))

    outcome = await executor.execute_delivery(command=command)

    assert outcome.terminal is not None
    assert outcome.terminal.internal_status == JobInternalStatus.SUCCEEDED
    assert handler.calls == ["reconcile", "execute", "reconcile"]
    assert len(terminal.success_calls) == 2


@pytest.mark.asyncio
async def test_untyped_boundary_failure_is_deferred_without_terminal_projection() -> None:
    subject = _subject(reconcile_results=[None], execute_result=RuntimeError("must not execute"))
    executor, _, terminal, boundary, _, handler, command, _ = subject
    boundary.authorize_error = RuntimeError("database unavailable")

    with pytest.raises(RuntimeError, match="database unavailable"):
        await executor.execute_delivery(command=command)

    assert handler.calls == ["reconcile"]
    assert terminal.success_calls == []
    assert terminal.failure_calls == []
    assert get_current_tenant_context() is None


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("authority_mode", JobAuthorityMode.ACTOR_REVALIDATED),
        ("phase", "unregistered-phase"),
    ],
)
@pytest.mark.asyncio
async def test_invalid_canonical_authority_or_phase_projects_contract_failure(
    field: str,
    value: object,
) -> None:
    subject = _subject(reconcile_results=[], execute_result=RuntimeError("must not execute"))
    executor, execution, terminal, boundary, _, handler, command, _ = subject
    execution.preparation = execution.preparation.model_copy(update={field: value})

    outcome = await executor.execute_delivery(command=command)

    assert outcome.terminal is not None
    assert outcome.terminal.internal_status == JobInternalStatus.FAILED
    error = terminal.failure_calls[0]
    assert isinstance(error, PermanentJobExecutionError)
    assert error.code == "BACKGROUND_JOB_EXECUTION_CONTRACT_MISMATCH"
    assert handler.calls == []
    assert boundary.resolve_calls == 0


@pytest.mark.asyncio
async def test_safe_duplicate_delivery_never_constructs_execution_context() -> None:
    subject = _subject(
        reconcile_results=[],
        execute_result=RuntimeError("must not execute"),
        disposition=JobDeliveryDisposition.TERMINAL_DUPLICATE,
    )
    executor, execution, terminal, boundary, _, handler, command, _ = subject

    outcome = await executor.execute_delivery(command=command)

    assert outcome.delivery.disposition == JobDeliveryDisposition.TERMINAL_DUPLICATE
    assert execution.calls == ["accept"]
    assert handler.calls == []
    assert boundary.resolve_calls == 0
    assert terminal.success_calls == []


@pytest.mark.asyncio
async def test_expired_delivery_requires_confirmed_exact_reap() -> None:
    subject = _subject(
        reconcile_results=[],
        execute_result=RuntimeError("must not execute"),
        disposition=JobDeliveryDisposition.LEASE_REAP_REQUIRED,
    )
    executor, execution, _, _, reaper, _, command, _ = subject

    outcome = await executor.execute_delivery(command=command)

    assert outcome.lease_reap is not None
    assert outcome.lease_reap.internal_status == JobInternalStatus.DEAD_LETTERED
    assert reaper.calls == [(command.envelope.job_id, execution.preparation.lease.attempt_id)]


@pytest.mark.asyncio
async def test_fenced_context_idempotency_key_is_stable_across_attempts_and_steps() -> None:
    subject = _subject(reconcile_results=[], execute_result=RuntimeError("unused"))
    _, execution, _, _, _, _, _, _ = subject
    preparation = execution.preparation
    context = FencedJobExecutionContext(
        execution=cast(BackgroundJobExecutionService, execution),
        idempotency_namespace="asset.thumbnail.generate",
        lease=preparation.lease,
        target=AssetThumbnailJobTarget.model_validate(preparation.target_descriptor),
        input_reference=AssetThumbnailJobInput.model_validate(preparation.input_reference),
        source_revision=preparation.source_revision,
        request_fingerprint=preparation.request_fingerprint,
        raise_on_cancellation=False,
    )

    first = context.idempotency_key(step="render")
    repeated = context.idempotency_key(step=" render ")
    another_step = context.idempotency_key(step="persist-marker")

    assert len(first) == 64
    assert repeated == first
    assert another_step != first
    with pytest.raises(ValueError, match="non-whitespace"):
        context.idempotency_key(step="  ")
