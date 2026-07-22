from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from typing import cast
from uuid import UUID

from pydantic import ValidationError
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.common.utils.ids import uuid7
from src.config import Settings
from src.core.exceptions import Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobDispatchOutboxRecord,
    JobDispatchStatus,
    JobInternalStatus,
)
from src.modules.jobs.dispatch_validation import validate_dispatch_envelope, validate_job_envelope
from src.modules.jobs.execution_errors import (
    JobExecutionCancellationRequestedError,
    JobExecutionStateInvariantError,
)
from src.modules.jobs.execution_registry import JobExecutionRegistry
from src.modules.jobs.execution_repository import JobExecutionRepository
from src.modules.jobs.execution_schema import (
    JobDeliveryClaim,
    JobDeliveryCommand,
    JobDeliveryDisposition,
    JobExecutionControlSnapshot,
    JobExecutionLease,
    JobExecutionPreparation,
    JobProgressUpdate,
)
from src.modules.jobs.execution_validation import (
    attempt_is_expired,
    build_execution_control_snapshot,
    build_terminal_duplicate,
    envelope_mismatch,
    not_claimable,
    to_execution_lease,
    validate_execution_binding,
)
from src.modules.jobs.registry import JobTypeRegistry

_TERMINAL_JOB_STATUSES = frozenset({
    JobInternalStatus.SUCCEEDED,
    JobInternalStatus.FAILED,
    JobInternalStatus.DEAD_LETTERED,
    JobInternalStatus.CANCELLED,
})
_DELIVERABLE_JOB_STATUSES = frozenset({
    JobInternalStatus.PENDING_DISPATCH,
    JobInternalStatus.QUEUED,
    JobInternalStatus.RETRY_SCHEDULED,
})
_RECONCILABLE_DISPATCH_STATUSES = frozenset({
    JobDispatchStatus.DISPATCHING,
    JobDispatchStatus.RETRY_SCHEDULED,
})


class BackgroundJobExecutionService(BaseService):
    """Atomic worker-side delivery and fenced execution control."""

    def __init__(
        self,
        settings: Settings,
        *,
        repository: JobExecutionRepository,
        job_types: JobTypeRegistry,
        executions: JobExecutionRegistry,
    ) -> None:
        super().__init__(settings, event_publisher=None, default_event_source="job-executor")
        self.repository = repository
        self.job_types = job_types
        self.executions = executions

    async def accept_delivery(self, command: JobDeliveryCommand) -> JobDeliveryClaim:
        async with self.tx() as conn:
            job, dispatch = await self._load_delivery_records(command=command, conn=conn)
            dispatch_sequence = command.envelope.dispatch_sequence
            active_attempt = await self.repository.get_active_attempt_for_update(job_id=job.id, conn=conn)
            if job.internal_status in _TERMINAL_JOB_STATUSES:
                if active_attempt is not None:
                    raise JobExecutionStateInvariantError(
                        f"Terminal Job {job.id} still owns active Attempt {active_attempt.id}"
                    )
                return build_terminal_duplicate(job=job, dispatch_sequence=dispatch_sequence)

            database_now = await self.repository.get_database_time(conn=conn)
            active_claim = await self._active_delivery_claim(
                job=job,
                attempt=active_attempt,
                dispatch_sequence=dispatch_sequence,
                database_now=database_now,
            )
            if active_claim is not None:
                return active_claim

            if dispatch_sequence <= job.attempt_count:
                return JobDeliveryClaim(
                    job_id=job.id,
                    dispatch_sequence=dispatch_sequence,
                    disposition=JobDeliveryDisposition.STALE_DELIVERY,
                )
            if dispatch_sequence != job.attempt_count + 1:
                raise envelope_mismatch()
            if job.internal_status not in _DELIVERABLE_JOB_STATUSES:
                raise not_claimable()
            return await self._claim_new_attempt(
                job=job,
                dispatch=dispatch,
                command=command,
                database_now=database_now,
                conn=conn,
            )

    async def prepare_execution(
        self,
        *,
        lease: JobExecutionLease,
    ) -> JobExecutionPreparation:
        async with self.tx() as conn:
            job = await self._get_job(job_id=lease.job_id, conn=conn)
            attempt = await self._get_attempt(attempt_id=lease.attempt_id, conn=conn)
            control = await self._locked_execution_control(
                job=job,
                attempt=attempt,
                lease=lease,
                conn=conn,
            )
            try:
                preparation = JobExecutionPreparation(
                    lease=lease,
                    target_descriptor=cast(JsonObject, job.target_descriptor),
                    input_reference=cast(JsonObject, job.input_reference),
                    source_revision=job.source_revision,
                    request_fingerprint=job.request_fingerprint,
                    correlation_id=job.correlation_id,
                    actor_user_id=job.actor_user_id,
                    authority_mode=job.authority_mode,
                    phase=job.phase,
                    control=control,
                )
            except ValidationError as exc:
                raise JobExecutionStateInvariantError(f"Job {job.id} canonical execution snapshot is invalid") from exc
            await self._renew_attempt(attempt=attempt, control=control, conn=conn)
        return preparation

    async def _load_delivery_records(
        self,
        *,
        command: JobDeliveryCommand,
        conn: BaseDBAsyncClient,
    ) -> tuple[BackgroundJobRecord, JobDispatchOutboxRecord]:
        envelope = command.envelope
        dispatch = await self._get_dispatch(
            job_id=envelope.job_id,
            dispatch_sequence=envelope.dispatch_sequence,
            conn=conn,
        )
        job = await self._get_job(job_id=envelope.job_id, conn=conn)
        registration = self.executions.require(
            job_type=job.job_type,
            job_type_version=job.job_type_version,
        )
        validate_execution_binding(
            registration=registration,
            job=job,
            dispatch=dispatch,
            task_name=command.task_name,
            envelope=envelope,
        )
        validate_job_envelope(job=job, task_name=command.task_name, envelope=envelope)
        validate_dispatch_envelope(dispatch=dispatch, envelope=envelope)
        return job, dispatch

    async def _claim_new_attempt(
        self,
        *,
        job: BackgroundJobRecord,
        dispatch: JobDispatchOutboxRecord,
        command: JobDeliveryCommand,
        database_now: datetime,
        conn: BaseDBAsyncClient,
    ) -> JobDeliveryClaim:
        dispatch_sequence = command.envelope.dispatch_sequence
        await self._reconcile_dispatch(
            job=job,
            dispatch=dispatch,
            command=command,
            database_now=database_now,
            conn=conn,
        )
        if job.cancel_requested_at is not None and job.attempt_count == 0:
            await self.repository.update_job_fields(
                job=job,
                fields={
                    "internal_status": JobInternalStatus.CANCELLED,
                    "completed_at": database_now,
                    "cancellation_acknowledged_at": database_now,
                },
                conn=conn,
            )
            return JobDeliveryClaim(
                job_id=job.id,
                dispatch_sequence=dispatch_sequence,
                disposition=JobDeliveryDisposition.CANCELLED_BEFORE_ATTEMPT,
                terminal_status=JobInternalStatus.CANCELLED,
            )
        if job.attempt_count >= job.max_attempts:
            raise not_claimable()

        lease_until = database_now + timedelta(seconds=job.lease_seconds)
        if job.timeout_seconds is not None:
            lease_until = min(
                lease_until,
                database_now + timedelta(seconds=job.timeout_seconds),
            )
        attempt = await self.repository.create_attempt(
            job=job,
            dispatch=dispatch,
            fencing_token=uuid7(),
            worker_id=command.worker_id,
            started_at=database_now,
            lease_until=lease_until,
            conn=conn,
        )
        definition = self.job_types.require(
            job_type=job.job_type,
            job_type_version=job.job_type_version,
        )
        await self.repository.mark_job_running(
            job=job,
            started_at=database_now,
            initial_phase=definition.initial_phase,
            conn=conn,
        )
        lease = to_execution_lease(job=job, attempt=attempt, dispatch_sequence=dispatch_sequence)
        return JobDeliveryClaim(
            job_id=job.id,
            dispatch_sequence=dispatch_sequence,
            disposition=JobDeliveryDisposition.CLAIMED,
            lease=lease,
        )

    async def checkpoint_execution(
        self,
        *,
        lease: JobExecutionLease,
        progress: JobProgressUpdate | None = None,
    ) -> JobExecutionControlSnapshot:
        async with self.tx() as conn:
            job = await self._get_job(job_id=lease.job_id, conn=conn)
            attempt = await self._get_attempt(attempt_id=lease.attempt_id, conn=conn)
            control = await self._locked_execution_control(
                job=job,
                attempt=attempt,
                lease=lease,
                conn=conn,
            )
            if progress is not None:
                self._validate_progress(job=job, progress=progress)
                await self.repository.update_job_fields(
                    job=job,
                    fields={
                        "phase": progress.phase,
                        "status_key": progress.status_key,
                        "progress_completed": progress.progress_completed,
                        "progress_total": progress.progress_total
                        if progress.progress_total is not None
                        else job.progress_total,
                    },
                    conn=conn,
                )
            await self._renew_attempt(attempt=attempt, control=control, conn=conn)

        return control

    async def run_fenced_domain_commit[ResultT](
        self,
        *,
        lease: JobExecutionLease,
        operation: Callable[[], Awaitable[ResultT]],
    ) -> tuple[ResultT, JobExecutionControlSnapshot]:
        async with self.tx() as conn:
            job = await self._get_job(job_id=lease.job_id, conn=conn)
            attempt = await self._get_attempt(attempt_id=lease.attempt_id, conn=conn)
            control = await self._locked_execution_control(
                job=job,
                attempt=attempt,
                lease=lease,
                conn=conn,
            )
            if control.cancellation_requested:
                raise JobExecutionCancellationRequestedError(control=control)
            await self._renew_attempt(attempt=attempt, control=control, conn=conn)
            result = await operation()
        return result, control

    async def _locked_execution_control(
        self,
        *,
        job: BackgroundJobRecord,
        attempt: JobAttemptRecord,
        lease: JobExecutionLease,
        conn: BaseDBAsyncClient,
    ) -> JobExecutionControlSnapshot:
        return build_execution_control_snapshot(
            job=job,
            attempt=attempt,
            lease=lease,
            observed_at=await self.repository.get_database_time(conn=conn),
        )

    async def _renew_attempt(
        self,
        *,
        attempt: JobAttemptRecord,
        control: JobExecutionControlSnapshot,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self.repository.heartbeat_attempt(
            attempt=attempt,
            heartbeat_at=control.observed_at,
            lease_until=control.lease_until,
            conn=conn,
        )

    async def _active_delivery_claim(
        self,
        *,
        job: BackgroundJobRecord,
        attempt: JobAttemptRecord | None,
        dispatch_sequence: int,
        database_now: datetime,
    ) -> JobDeliveryClaim | None:
        if job.internal_status != JobInternalStatus.RUNNING:
            if attempt is not None:
                raise not_claimable()
            return None
        if attempt is None:
            raise not_claimable()
        if dispatch_sequence < attempt.attempt_number:
            return JobDeliveryClaim(
                job_id=job.id,
                dispatch_sequence=dispatch_sequence,
                disposition=JobDeliveryDisposition.STALE_DELIVERY,
            )
        if dispatch_sequence != attempt.attempt_number:
            raise envelope_mismatch()
        disposition = (
            JobDeliveryDisposition.LEASE_REAP_REQUIRED
            if attempt_is_expired(attempt=attempt, observed_at=database_now)
            else JobDeliveryDisposition.ACTIVE_ATTEMPT_DUPLICATE
        )
        return JobDeliveryClaim(
            job_id=job.id,
            dispatch_sequence=dispatch_sequence,
            disposition=disposition,
            active_attempt_id=attempt.id,
        )

    async def _reconcile_dispatch(
        self,
        *,
        job: BackgroundJobRecord,
        dispatch: JobDispatchOutboxRecord,
        command: JobDeliveryCommand,
        database_now: datetime,
        conn: BaseDBAsyncClient,
    ) -> None:
        if dispatch.status in _RECONCILABLE_DISPATCH_STATUSES:
            await self.repository.mark_dispatch_succeeded(
                dispatch=dispatch,
                task_message_id=command.transport_message_id,
                dispatched_at=database_now,
                conn=conn,
            )
        elif dispatch.status != JobDispatchStatus.DISPATCHED:
            raise Conflict(
                message=t("errors", "BACKGROUND_JOB_DISPATCH_NOT_READY"),
                error="BACKGROUND_JOB_DISPATCH_NOT_READY",
            )
        if job.internal_status == JobInternalStatus.PENDING_DISPATCH:
            await self.repository.mark_job_queued(job=job, conn=conn)

    async def _get_job(self, *, job_id: UUID, conn: BaseDBAsyncClient) -> BackgroundJobRecord:
        job = await self.repository.get_job_for_update(job_id=job_id, conn=conn)
        if job is None:
            raise NotFound(message=t("errors", "BACKGROUND_JOB_NOT_FOUND"), error="BACKGROUND_JOB_NOT_FOUND")
        return job

    async def _get_dispatch(
        self, *, job_id: UUID, dispatch_sequence: int, conn: BaseDBAsyncClient
    ) -> JobDispatchOutboxRecord:
        dispatch = await self.repository.get_job_dispatch_for_update(
            job_id=job_id,
            dispatch_sequence=dispatch_sequence,
            conn=conn,
        )
        if dispatch is None:
            raise NotFound(
                message=t("errors", "BACKGROUND_JOB_DISPATCH_NOT_FOUND"),
                error="BACKGROUND_JOB_DISPATCH_NOT_FOUND",
            )
        return dispatch

    async def _get_attempt(self, *, attempt_id: UUID, conn: BaseDBAsyncClient) -> JobAttemptRecord:
        attempt = await self.repository.get_attempt_for_update(attempt_id=attempt_id, conn=conn)
        if attempt is None:
            raise NotFound(
                message=t("errors", "BACKGROUND_JOB_ATTEMPT_NOT_FOUND"),
                error="BACKGROUND_JOB_ATTEMPT_NOT_FOUND",
            )
        return attempt

    def _validate_progress(self, *, job: BackgroundJobRecord, progress: JobProgressUpdate) -> None:
        definition = self.job_types.require(job_type=job.job_type, job_type_version=job.job_type_version)
        if progress.phase not in definition.phases:
            raise not_claimable()
        if progress.progress_completed < job.progress_completed:
            raise not_claimable()
        effective_total = progress.progress_total if progress.progress_total is not None else job.progress_total
        if effective_total is not None and progress.progress_completed > effective_total:
            raise not_claimable()
        if job.progress_total is not None and (
            progress.progress_total is not None and progress.progress_total != job.progress_total
        ):
            raise not_claimable()
