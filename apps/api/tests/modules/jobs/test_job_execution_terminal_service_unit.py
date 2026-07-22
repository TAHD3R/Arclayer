from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from pydantic import ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import Conflict
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobAttemptStatus,
    JobDispatchOutboxRecord,
    JobDispatchStatus,
    JobFailureClassification,
    JobInternalStatus,
    JobRetryDecision,
    JobRetryHintRejectionReason,
    JobRetryScheduleSource,
)
from src.modules.assets.jobs import (
    ASSET_THUMBNAIL_PROFILE_VERSION,
    ASSET_THUMBNAIL_RETRYABLE_CODES,
    AssetThumbnailJobInput,
    AssetThumbnailJobResult,
    AssetThumbnailJobTarget,
)
from src.modules.jobs.builtin_registry import build_builtin_job_type_registry
from src.modules.jobs.execution_errors import (
    JOB_ERROR_CONTRACT_MISMATCH_CODE,
    JobExecutionErrorContractError,
    JobExecutionLeaseLostError,
    JobExecutionResultContractError,
    PermanentJobExecutionError,
    TransientJobExecutionError,
    UnexpectedJobExecutionError,
)
from src.modules.jobs.execution_registry import (
    JobExecutionContext,
    JobExecutionRegistry,
    JobHandledInterruption,
    JobTypeRegistration,
)
from src.modules.jobs.execution_repository import JobExecutionRepository
from src.modules.jobs.execution_schema import (
    JobExecutionLease,
    JobSuccessCancellationDisposition,
)
from src.modules.jobs.execution_terminal_service import BackgroundJobTerminalService
from src.modules.jobs.execution_terminal_state import JobExecutionTerminalInvariantError
from src.modules.jobs.execution_validation import to_execution_lease
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.registry import JobTypeRegistry
from src.modules.jobs.schema import BackgroundJobFailure, JobDispatchEnvelope

pytestmark = pytest.mark.unit

NOW = datetime(2026, 7, 15, 10, tzinfo=UTC)


class NoopThumbnailHandler:
    async def reconcile(
        self,
        *,
        context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
    ) -> AssetThumbnailJobResult | None:
        return None

    async def execute(
        self,
        *,
        context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
    ) -> AssetThumbnailJobResult:
        raise AssertionError("terminal service unit tests do not execute handlers")

    async def cancel(
        self,
        *,
        context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
    ) -> None:
        return None


class InvalidResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    invalid: str


class FakeTerminalRepository:
    def __init__(self, *, job: BackgroundJobRecord, attempt: JobAttemptRecord) -> None:
        self.job = job
        self.attempt = attempt
        self.database_time = NOW + timedelta(seconds=30)
        self.dispatches: list[JobDispatchOutboxRecord] = []

    async def get_job_for_update(self, *, job_id: UUID, conn: BaseDBAsyncClient):
        _ = conn
        return self.job if self.job.id == job_id else None

    async def get_attempt_for_update(self, *, attempt_id: UUID, conn: BaseDBAsyncClient):
        _ = conn
        return self.attempt if self.attempt.id == attempt_id else None

    async def get_database_time(self, *, conn: BaseDBAsyncClient) -> datetime:
        _ = conn
        return self.database_time

    async def finish_attempt_succeeded(
        self,
        *,
        attempt: JobAttemptRecord,
        completed_at: datetime,
        result_reference: JsonObject,
        conn: BaseDBAsyncClient,
    ) -> None:
        _ = conn
        attempt.status = JobAttemptStatus.SUCCEEDED
        attempt.completed_at = completed_at
        attempt.result_reference = result_reference
        attempt.error_code = None
        cast(Any, attempt).error_message = None
        attempt.error_metadata = None
        attempt.failure_classification = None
        attempt.retry_decision = None
        attempt.retry_at = None
        attempt.retry_schedule_source = None
        attempt.retry_delay_seconds = None
        attempt.retry_hint_rejection_reason = None

    async def finish_attempt(
        self,
        *,
        attempt: JobAttemptRecord,
        status: JobAttemptStatus,
        completed_at: datetime,
        failure: BackgroundJobFailure | None,
        conn: BaseDBAsyncClient,
    ) -> None:
        _ = conn
        attempt.status = status
        attempt.completed_at = completed_at
        attempt.result_reference = None
        attempt.error_code = failure.error_code if failure is not None else None
        cast(Any, attempt).error_message = failure.error_message if failure is not None else None
        attempt.error_metadata = failure.error_metadata if failure is not None else None
        attempt.failure_classification = failure.failure_classification if failure is not None else None
        attempt.retry_decision = failure.retry_decision if failure is not None else None
        attempt.retry_at = failure.retry_at if failure is not None else None
        attempt.retry_schedule_source = failure.retry_schedule_source if failure is not None else None
        attempt.retry_delay_seconds = failure.retry_delay_seconds if failure is not None else None
        attempt.retry_hint_rejection_reason = failure.retry_hint_rejection_reason if failure is not None else None

    async def update_job_fields(
        self,
        *,
        job: BackgroundJobRecord,
        fields: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> None:
        _ = conn
        for field_name, value in fields.items():
            setattr(job, field_name, value)

    async def create_dispatch(
        self,
        *,
        job: BackgroundJobRecord,
        dispatch_sequence: int,
        task_name: str,
        envelope: JobDispatchEnvelope,
        envelope_hash: str,
        available_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> JobDispatchOutboxRecord:
        _ = conn
        dispatch = JobDispatchOutboxRecord(
            id=uuid4(),
            job_id=job.id,
            dispatch_sequence=dispatch_sequence,
            task_name=task_name,
            message_schema_version=envelope.message_schema_version,
            envelope=envelope.model_dump(mode="json", by_alias=True),
            envelope_hash=envelope_hash,
            status=JobDispatchStatus.PENDING,
            workload_class=job.workload_class,
            available_at=available_at,
            dispatch_attempt_count=0,
        )
        cast(Any, dispatch).job_id = job.id
        self.dispatches.append(dispatch)
        return dispatch


class FakeTransactionTerminalService(BackgroundJobTerminalService):
    @asynccontextmanager
    async def tx(self, *, conn=None) -> AsyncIterator[BaseDBAsyncClient]:
        if conn is not None:
            yield conn
            return
        yield cast(BaseDBAsyncClient, SimpleNamespace())


def _settings() -> Settings:
    return Settings(app_env="test", database={"enabled": False})


def _subject(
    *,
    attempt_number: int = 1,
    jitter_ratio: float = 0.5,
) -> tuple[
    FakeTransactionTerminalService,
    FakeTerminalRepository,
    AssetThumbnailJobResult,
    JobExecutionLease,
]:
    settings = _settings()
    definition = build_builtin_job_type_registry(settings).require(
        job_type="asset.thumbnail.generate",
        job_type_version=1,
    )
    job_types = JobTypeRegistry((definition,), strict_contracts=True)
    workspace_id = uuid4()
    project_id = uuid4()
    asset_id = uuid4()
    source_revision = "b" * 64
    job = BackgroundJobRecord(
        id=uuid4(),
        job_type=definition.job_type,
        job_type_version=definition.job_type_version,
        task_name=definition.task_name,
        workload_class=definition.workload_class,
        internal_status=JobInternalStatus.RUNNING,
        retry_class=definition.retry_class,
        target_descriptor=AssetThumbnailJobTarget(
            workspace_id=workspace_id,
            project_id=project_id,
            entity_id=asset_id,
        ).model_dump(mode="json", by_alias=True),
        input_reference=AssetThumbnailJobInput(
            asset_id=asset_id,
            thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
        ).model_dump(mode="json", by_alias=True),
        request_fingerprint="a" * 64,
        source_revision=source_revision,
        retry_policy=definition.retry_policy.model_dump(mode="json", by_alias=True),
        attempt_count=attempt_number,
        lease_seconds=definition.lease_seconds,
        heartbeat_seconds=definition.heartbeat_seconds,
        progress_completed=1,
        progress_total=4,
    )
    attempt = JobAttemptRecord(
        id=uuid4(),
        job_id=job.id,
        dispatch_id=uuid4(),
        attempt_number=attempt_number,
        fencing_token=uuid4(),
        status=JobAttemptStatus.RUNNING,
        worker_id="asset-worker-1",
        handler_version=job.job_type_version,
        claimed_at=NOW,
        lease_until=NOW + timedelta(seconds=90),
        heartbeat_at=NOW,
        timeout_at=NOW + timedelta(minutes=10),
        started_at=NOW,
    )
    cast(Any, attempt).job_id = job.id
    repository = FakeTerminalRepository(job=job, attempt=attempt)
    executions = JobExecutionRegistry(
        job_types=job_types,
        registrations=[
            JobTypeRegistration.from_definition(
                definition=definition,
                handler_factory=NoopThumbnailHandler,
            )
        ],
    )
    service = FakeTransactionTerminalService(
        settings,
        repository=cast(JobExecutionRepository, repository),
        executions=executions,
        retry_jitter=lambda: jitter_ratio,
    )
    lease = to_execution_lease(job=job, attempt=attempt, dispatch_sequence=attempt_number)
    result = AssetThumbnailJobResult(
        asset_id=asset_id,
        source_revision=source_revision,
        thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
        outcome_job_id=job.id,
        produced_widths=(320, 640),
    )
    return service, repository, result, lease


@pytest.mark.asyncio
async def test_success_require_none_rejects_locked_cancellation_request() -> None:
    service, repository, result, lease = _subject()
    repository.job.cancel_requested_at = NOW + timedelta(seconds=10)

    with pytest.raises(JobExecutionTerminalInvariantError):
        await service.complete_success(
            lease=lease,
            result=result,
            cancellation_disposition=JobSuccessCancellationDisposition.REQUIRE_NONE,
        )

    assert repository.job.internal_status == JobInternalStatus.RUNNING
    assert repository.job.cancellation_acknowledged_at is None
    assert repository.attempt.status == JobAttemptStatus.RUNNING


@pytest.mark.asyncio
async def test_success_acknowledge_if_present_resolves_locked_late_request() -> None:
    service, repository, result, lease = _subject()
    repository.job.cancel_requested_at = NOW + timedelta(seconds=10)

    outcome = await service.complete_success(
        lease=lease,
        result=result,
        cancellation_disposition=JobSuccessCancellationDisposition.ACKNOWLEDGE_IF_PRESENT,
    )

    assert outcome.internal_status == JobInternalStatus.SUCCEEDED
    assert repository.job.cancellation_acknowledged_at == repository.database_time


@pytest.mark.asyncio
async def test_success_acknowledge_if_present_succeeds_without_request() -> None:
    service, repository, result, lease = _subject()

    outcome = await service.complete_success(
        lease=lease,
        result=result,
        cancellation_disposition=JobSuccessCancellationDisposition.ACKNOWLEDGE_IF_PRESENT,
    )

    assert outcome.internal_status == JobInternalStatus.SUCCEEDED
    assert repository.job.cancellation_acknowledged_at is None


@pytest.mark.asyncio
async def test_success_rejects_unregistered_result_without_mutation() -> None:
    service, repository, _, lease = _subject()

    with pytest.raises(JobExecutionResultContractError):
        await service.complete_success(
            lease=lease,
            result=InvalidResult(invalid="value"),
            cancellation_disposition=JobSuccessCancellationDisposition.ACKNOWLEDGE_IF_PRESENT,
        )

    assert repository.job.internal_status == JobInternalStatus.RUNNING
    assert repository.attempt.status == JobAttemptStatus.RUNNING


@pytest.mark.parametrize("mismatch", ["asset", "job", "source", "profile"])
@pytest.mark.asyncio
async def test_success_rejects_result_not_bound_to_canonical_job_without_mutation(mismatch: str) -> None:
    service, repository, result, lease = _subject()
    if mismatch == "asset":
        updates: dict[str, object] = {"asset_id": uuid4()}
    elif mismatch == "job":
        updates = {"outcome_job_id": uuid4()}
    elif mismatch == "source":
        updates = {"source_revision": "c" * 64}
    else:
        updates = {"thumbnail_profile_version": ASSET_THUMBNAIL_PROFILE_VERSION + 1}

    with pytest.raises(JobExecutionResultContractError):
        await service.complete_success(
            lease=lease,
            result=result.model_copy(update=updates),
            cancellation_disposition=JobSuccessCancellationDisposition.ACKNOWLEDGE_IF_PRESENT,
        )

    assert repository.job.internal_status == JobInternalStatus.RUNNING
    assert repository.job.result_reference is None
    assert repository.attempt.status == JobAttemptStatus.RUNNING
    assert repository.attempt.result_reference is None


@pytest.mark.asyncio
async def test_success_validates_result_against_locked_canonical_input_reference() -> None:
    service, repository, result, lease = _subject()
    repository.job.input_reference = AssetThumbnailJobInput(
        asset_id=uuid4(),
        thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
    ).model_dump(mode="json", by_alias=True)

    with pytest.raises(JobExecutionResultContractError):
        await service.complete_success(
            lease=lease,
            result=result,
            cancellation_disposition=JobSuccessCancellationDisposition.ACKNOWLEDGE_IF_PRESENT,
        )

    assert repository.job.internal_status == JobInternalStatus.RUNNING
    assert repository.attempt.status == JobAttemptStatus.RUNNING


@pytest.mark.asyncio
async def test_success_exact_replay_returns_existing_projection() -> None:
    service, repository, result, lease = _subject()
    first = await service.complete_success(
        lease=lease,
        result=result,
        cancellation_disposition=JobSuccessCancellationDisposition.ACKNOWLEDGE_IF_PRESENT,
    )

    replay = await service.complete_success(
        lease=lease,
        result=result,
        cancellation_disposition=JobSuccessCancellationDisposition.ACKNOWLEDGE_IF_PRESENT,
    )

    assert first.is_replay is False
    assert replay.is_replay is True
    assert replay.result_reference == first.result_reference
    assert repository.dispatches == []


@pytest.mark.asyncio
async def test_interruption_ends_attempt_and_waits_without_terminalizing_job() -> None:
    service, repository, _, lease = _subject()
    interruption = JobHandledInterruption(
        reason="approval_required",
        phase="waiting_for_user",
        status_key="AI_AGENT_RUN_STATUS_WAITING_FOR_USER",
        continuation_reference={"checkpointId": "checkpoint-1", "runId": "run-1"},
    )

    outcome = await service.interrupt_for_user(lease=lease, interruption=interruption)

    assert outcome.internal_status == JobInternalStatus.WAITING_FOR_USER
    assert outcome.completed_at is None
    assert outcome.continuation_reference == interruption.continuation_reference
    assert repository.attempt.status == JobAttemptStatus.INTERRUPTED
    assert repository.attempt.completed_at == repository.database_time
    assert repository.job.internal_status == JobInternalStatus.WAITING_FOR_USER
    assert repository.job.completed_at is None
    assert repository.job.phase == "waiting_for_user"
    assert repository.job.status_key == "AI_AGENT_RUN_STATUS_WAITING_FOR_USER"
    assert repository.job.continuation_reference == interruption.continuation_reference


@pytest.mark.asyncio
async def test_interruption_exact_replay_requires_same_continuation() -> None:
    service, repository, _, lease = _subject()
    interruption = JobHandledInterruption(
        reason="approval_required",
        phase="waiting_for_user",
        status_key="AI_AGENT_RUN_STATUS_WAITING_FOR_USER",
        continuation_reference={"checkpointId": "checkpoint-1"},
    )
    first = await service.interrupt_for_user(lease=lease, interruption=interruption)

    replay = await service.interrupt_for_user(lease=lease, interruption=interruption)

    assert first.is_replay is False
    assert replay.is_replay is True
    with pytest.raises(JobExecutionTerminalInvariantError):
        await service.interrupt_for_user(
            lease=lease,
            interruption=interruption.model_copy(update={"continuation_reference": {"checkpointId": "checkpoint-2"}}),
        )
    assert repository.dispatches == []


@pytest.mark.asyncio
async def test_success_replay_requires_the_exact_cancellation_disposition() -> None:
    service, repository, result, lease = _subject()
    repository.job.cancel_requested_at = NOW + timedelta(seconds=10)
    await service.complete_success(
        lease=lease,
        result=result,
        cancellation_disposition=JobSuccessCancellationDisposition.ACKNOWLEDGE_IF_PRESENT,
    )

    with pytest.raises(JobExecutionTerminalInvariantError):
        await service.complete_success(
            lease=lease,
            result=result,
            cancellation_disposition=JobSuccessCancellationDisposition.REQUIRE_NONE,
        )


@pytest.mark.asyncio
async def test_success_replay_rejects_canonical_source_drift() -> None:
    service, repository, result, lease = _subject()
    await service.complete_success(
        lease=lease,
        result=result,
        cancellation_disposition=JobSuccessCancellationDisposition.ACKNOWLEDGE_IF_PRESENT,
    )
    repository.job.source_revision = "c" * 64

    with pytest.raises(JobExecutionResultContractError):
        await service.complete_success(
            lease=lease,
            result=result,
            cancellation_disposition=JobSuccessCancellationDisposition.ACKNOWLEDGE_IF_PRESENT,
        )

    assert repository.job.internal_status == JobInternalStatus.SUCCEEDED
    assert repository.attempt.status == JobAttemptStatus.SUCCEEDED


@pytest.mark.asyncio
async def test_declared_transient_failure_schedules_one_policy_owned_retry() -> None:
    service, repository, _, lease = _subject(jitter_ratio=0.5)
    code = "ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE"
    assert code in ASSET_THUMBNAIL_RETRYABLE_CODES
    error = TransientJobExecutionError(code=code, safe_message="Storage is temporarily unavailable")

    outcome = await service.complete_failure(lease=lease, error=error)

    assert outcome.internal_status == JobInternalStatus.RETRY_SCHEDULED
    assert outcome.next_attempt_at == repository.database_time + timedelta(seconds=2.5)
    assert outcome.completed_at is None
    assert repository.attempt.status == JobAttemptStatus.FAILED
    assert repository.attempt.failure_classification == JobFailureClassification.TRANSIENT
    assert repository.attempt.retry_decision == JobRetryDecision.SCHEDULED
    assert repository.attempt.retry_schedule_source == JobRetryScheduleSource.EXPONENTIAL_FULL_JITTER
    assert repository.attempt.retry_delay_seconds == 2.5
    assert len(repository.dispatches) == 1
    assert repository.dispatches[0].dispatch_sequence == 2
    assert repository.dispatches[0].available_at == outcome.next_attempt_at
    assert repository.dispatches[0].envelope_hash == hash_json(repository.dispatches[0].envelope)


@pytest.mark.asyncio
async def test_provider_retry_after_overrides_jitter_delay() -> None:
    service, repository, _, lease = _subject(jitter_ratio=0)
    error = TransientJobExecutionError(
        code="ASSET_THUMBNAIL_PROVIDER_RATE_LIMITED",
        safe_message="Provider rate limited the request",
        provider_retry_after_seconds=17,
    )

    outcome = await service.complete_failure(lease=lease, error=error)

    assert outcome.next_attempt_at == repository.database_time + timedelta(seconds=17)
    assert repository.attempt.retry_schedule_source == JobRetryScheduleSource.PROVIDER_RETRY_AFTER
    assert repository.attempt.retry_delay_seconds == 17
    assert repository.attempt.retry_hint_rejection_reason is None


@pytest.mark.asyncio
async def test_invalid_provider_retry_after_records_diagnostic_and_uses_jitter() -> None:
    service, repository, _, lease = _subject(jitter_ratio=0.5)
    error = TransientJobExecutionError(
        code="ASSET_THUMBNAIL_PROVIDER_RATE_LIMITED",
        safe_message="Provider returned an invalid retry hint",
        provider_retry_after_seconds=10**1000,
    )

    outcome = await service.complete_failure(lease=lease, error=error)

    assert outcome.next_attempt_at == repository.database_time + timedelta(seconds=2.5)
    assert repository.attempt.retry_schedule_source == JobRetryScheduleSource.EXPONENTIAL_FULL_JITTER
    assert repository.attempt.retry_hint_rejection_reason == JobRetryHintRejectionReason.OUT_OF_RANGE


@pytest.mark.asyncio
async def test_exhausted_declared_transient_failure_dead_letters_without_dispatch() -> None:
    service, repository, _, lease = _subject(attempt_number=3)
    error = TransientJobExecutionError(
        code="BACKGROUND_JOB_WORKER_LOST",
        safe_message="Worker execution lease expired",
    )

    outcome = await service.complete_failure(lease=lease, error=error)

    assert outcome.internal_status == JobInternalStatus.DEAD_LETTERED
    assert outcome.completed_at == repository.database_time
    assert repository.attempt.failure_classification == JobFailureClassification.TRANSIENT
    assert repository.attempt.retry_decision == JobRetryDecision.EXHAUSTED
    assert repository.dispatches == []


@pytest.mark.asyncio
async def test_permanent_and_unexpected_failures_never_retry() -> None:
    for error in (
        PermanentJobExecutionError(
            code="BACKGROUND_JOB_EXECUTION_CONTRACT_MISMATCH",
            safe_message="Canonical execution references are invalid",
        ),
        PermanentJobExecutionError(
            code="BACKGROUND_JOB_RESULT_CONTRACT_MISMATCH",
            safe_message="The handler result violates its contract",
        ),
        PermanentJobExecutionError(
            code="BACKGROUND_JOB_TARGET_NOT_FOUND",
            safe_message="The project target is no longer available",
            metadata={"projectId": str(uuid4())},
        ),
        UnexpectedJobExecutionError(
            handler="asset.thumbnail.generate",
            correlation_id="correlation-1",
        ),
    ):
        service, repository, _, lease = _subject()

        outcome = await service.complete_failure(lease=lease, error=error)

        assert outcome.internal_status == JobInternalStatus.FAILED
        assert repository.dispatches == []


@pytest.mark.parametrize(
    ("code", "metadata"),
    [
        ("BACKGROUND_JOB_TARGET_NOT_FOUND", {"projectId": str(uuid4())}),
        (
            "BACKGROUND_JOB_TARGET_INVARIANT_INVALID",
            {"workspaceId": str(uuid4()), "projectId": str(uuid4())},
        ),
        (
            "BACKGROUND_JOB_TARGET_WORKSPACE_MISMATCH",
            {"workspaceId": str(uuid4()), "projectId": str(uuid4())},
        ),
        (
            "BACKGROUND_JOB_TARGET_DISABLED",
            {
                "workspaceId": str(uuid4()),
                "projectId": str(uuid4()),
                "entityType": "project",
            },
        ),
        ("BACKGROUND_JOB_TENANT_FAILED", {"workspaceId": str(uuid4())}),
        (
            "BACKGROUND_JOB_TENANT_INVARIANT_INVALID",
            {"workspaceId": str(uuid4()), "reason": "ownership_mismatch"},
        ),
        ("BACKGROUND_JOB_TENANT_SCHEMA_INVALID", {"workspaceId": str(uuid4())}),
        (
            "BACKGROUND_JOB_TENANT_ISOLATION_UNSUPPORTED",
            {"workspaceId": str(uuid4())},
        ),
        (
            "BACKGROUND_JOB_TENANT_NOT_READY",
            {"workspaceId": str(uuid4()), "reason": "missing"},
        ),
        (
            "BACKGROUND_JOB_TENANT_NOT_READY",
            {
                "workspaceId": str(uuid4()),
                "reason": "schema_outdated",
                "currentSchemaVersion": 2,
                "requiredSchemaVersion": 3,
            },
        ),
    ],
)
@pytest.mark.asyncio
async def test_failure_accepts_registered_target_resolver_metadata(
    code: str,
    metadata: JsonObject,
) -> None:
    service, repository, _, lease = _subject()
    error_type = TransientJobExecutionError if code == "BACKGROUND_JOB_TENANT_NOT_READY" else PermanentJobExecutionError
    error = error_type(
        code=code,
        safe_message="Registered target resolution failure",
        metadata=metadata,
    )

    await service.complete_failure(lease=lease, error=error)

    assert repository.attempt.status == JobAttemptStatus.FAILED
    assert repository.attempt.error_code == code
    assert repository.attempt.error_metadata == metadata


@pytest.mark.parametrize(
    "error",
    [
        PermanentJobExecutionError(
            code="ASSET_THUMBNAIL_UNREGISTERED_FAILURE",
            safe_message="Unregistered failure",
        ),
        PermanentJobExecutionError(
            code="BACKGROUND_JOB_TARGET_NOT_FOUND",
            safe_message="Target evidence has an extra key",
            metadata={"projectId": str(uuid4()), "workspaceId": str(uuid4())},
        ),
        PermanentJobExecutionError(
            code="BACKGROUND_JOB_TARGET_NOT_FOUND",
            safe_message="Target evidence has the wrong shape",
            metadata={"projectId": "not-a-uuid"},
        ),
        TransientJobExecutionError(
            code="BACKGROUND_JOB_WORKER_LOST",
            safe_message="No metadata is allowed for worker loss",
            metadata={"workerId": "asset-worker-1"},
        ),
    ],
)
@pytest.mark.asyncio
async def test_failure_rejects_unregistered_or_invalid_error_evidence_without_mutation(
    error: PermanentJobExecutionError | TransientJobExecutionError,
) -> None:
    service, repository, _, lease = _subject()

    with pytest.raises(JobExecutionErrorContractError) as exc_info:
        await service.complete_failure(lease=lease, error=error)

    assert exc_info.value.code == JOB_ERROR_CONTRACT_MISMATCH_CODE
    assert repository.job.internal_status == JobInternalStatus.RUNNING
    assert repository.job.error_code is None
    assert repository.attempt.status == JobAttemptStatus.RUNNING
    assert repository.attempt.error_code is None
    assert repository.dispatches == []


@pytest.mark.asyncio
async def test_failure_validates_fence_before_terminal_error_contract() -> None:
    service, repository, _, lease = _subject()
    repository.database_time = repository.attempt.lease_until
    error = PermanentJobExecutionError(
        code="ASSET_THUMBNAIL_UNREGISTERED_FAILURE",
        safe_message="Unregistered failure",
    )

    with pytest.raises(JobExecutionLeaseLostError):
        await service.complete_failure(lease=lease, error=error)

    assert repository.job.internal_status == JobInternalStatus.RUNNING
    assert repository.attempt.status == JobAttemptStatus.RUNNING


@pytest.mark.asyncio
async def test_failure_exact_replay_does_not_duplicate_retry_dispatch() -> None:
    service, repository, _, lease = _subject()
    error = TransientJobExecutionError(
        code="BACKGROUND_JOB_WORKER_LOST",
        safe_message="Worker execution lease expired",
    )
    await service.complete_failure(lease=lease, error=error)

    replay = await service.complete_failure(lease=lease, error=error)

    assert replay.is_replay is True
    assert len(repository.dispatches) == 1


@pytest.mark.asyncio
async def test_cancellation_requires_request_then_terminalizes_explicitly() -> None:
    service, repository, _, lease = _subject()
    with pytest.raises(Conflict) as exc_info:
        await service.acknowledge_cancellation(lease=lease)
    assert exc_info.value.error == "BACKGROUND_JOB_CANCELLATION_NOT_REQUESTED"

    repository.job.cancel_requested_at = NOW + timedelta(seconds=10)
    outcome = await service.acknowledge_cancellation(lease=lease)

    assert outcome.internal_status == JobInternalStatus.CANCELLED
    assert repository.attempt.status == JobAttemptStatus.CANCELLED
    assert repository.job.cancellation_acknowledged_at == repository.database_time


@pytest.mark.asyncio
async def test_expired_fence_cannot_write_a_terminal_projection() -> None:
    service, repository, result, lease = _subject()
    repository.database_time = repository.attempt.lease_until
    result = result.model_copy(update={"source_revision": "c" * 64})

    with pytest.raises(JobExecutionLeaseLostError):
        await service.complete_success(
            lease=lease,
            result=result,
            cancellation_disposition=JobSuccessCancellationDisposition.ACKNOWLEDGE_IF_PRESENT,
        )

    assert repository.job.internal_status == JobInternalStatus.RUNNING
    assert repository.attempt.status == JobAttemptStatus.RUNNING
