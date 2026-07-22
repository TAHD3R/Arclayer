from __future__ import annotations

from collections.abc import Callable
from typing import cast

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobAttemptStatus,
    JobInternalStatus,
)
from src.modules.jobs.execution_errors import (
    JobExecutionErrorContractError,
    JobExecutionResultContractError,
)
from src.modules.jobs.execution_registry import (
    JobExecutionRegistry,
    JobHandledInterruption,
    JobTypeRegistration,
)
from src.modules.jobs.execution_repository import JobExecutionRepository
from src.modules.jobs.execution_retry_dispatch import create_retry_dispatch
from src.modules.jobs.execution_schema import (
    JobExecutionLease,
    JobExecutionTerminalOutcome,
    JobSuccessCancellationDisposition,
)
from src.modules.jobs.execution_terminal_state import (
    JobExecutionTerminalInvariantError,
    TerminalExecutionError,
    build_failure_projection,
    cancellation_job_fields,
    failure_job_fields,
    interruption_job_fields,
    interruption_outcome,
    replay_cancellation,
    replay_failure,
    replay_interruption,
    replay_success,
    success_job_fields,
    success_outcome,
)
from src.modules.jobs.execution_validation import validate_execution_fence
from src.modules.jobs.registry import JobResultSemanticContext


class BackgroundJobTerminalService(BaseService):
    """Fenced success, failure, retry, and cancellation projections."""

    def __init__(
        self,
        settings: Settings,
        *,
        repository: JobExecutionRepository,
        executions: JobExecutionRegistry,
        retry_jitter: Callable[[], float],
    ) -> None:
        super().__init__(settings, event_publisher=None, default_event_source="job-terminal")
        self.repository = repository
        self.executions = executions
        self.retry_jitter = retry_jitter

    async def complete_success(
        self,
        *,
        lease: JobExecutionLease,
        result: BaseSchema,
        cancellation_disposition: JobSuccessCancellationDisposition,
    ) -> JobExecutionTerminalOutcome:
        registration = self.executions.require(
            job_type=lease.job_type,
            job_type_version=lease.job_type_version,
        )
        validated_result, result_reference = self._validate_result_reference(
            registration=registration,
            result=result,
        )
        async with self.tx() as conn:
            job, attempt = await self._load_records(lease=lease, conn=conn)
            replay = replay_success(
                job=job,
                attempt=attempt,
                lease=lease,
                result_reference=result_reference,
                cancellation_disposition=cancellation_disposition,
            )
            if replay is not None:
                self._validate_result_semantics(
                    registration=registration,
                    job=job,
                    result=validated_result,
                )
                return replay
            database_now = await self.repository.get_database_time(conn=conn)
            validate_execution_fence(job=job, attempt=attempt, lease=lease, observed_at=database_now)
            if (
                cancellation_disposition == JobSuccessCancellationDisposition.REQUIRE_NONE
                and job.cancel_requested_at is not None
            ):
                raise JobExecutionTerminalInvariantError(
                    "success required no cancellation request, but the locked Job contains one"
                )
            self._validate_result_semantics(
                registration=registration,
                job=job,
                result=validated_result,
            )
            outcome = success_outcome(
                job=job,
                attempt=attempt,
                completed_at=database_now,
                result_reference=result_reference,
            )
            await self.repository.finish_attempt_succeeded(
                attempt=attempt,
                completed_at=database_now,
                result_reference=result_reference,
                conn=conn,
            )
            await self.repository.update_job_fields(
                job=job,
                fields=success_job_fields(
                    job=job,
                    outcome=outcome,
                    cancellation_disposition=cancellation_disposition,
                ),
                conn=conn,
            )
            return outcome

    async def complete_failure(
        self,
        *,
        lease: JobExecutionLease,
        error: TerminalExecutionError,
    ) -> JobExecutionTerminalOutcome:
        async with self.tx() as conn:
            job, attempt = await self._load_records(lease=lease, conn=conn)
            replay = replay_failure(job=job, attempt=attempt, lease=lease, error=error)
            if replay is not None:
                registration = self.executions.require(
                    job_type=job.job_type,
                    job_type_version=job.job_type_version,
                )
                self._validate_terminal_error_contract(registration=registration, error=error)
                return replay
            database_now = await self.repository.get_database_time(conn=conn)
            validate_execution_fence(job=job, attempt=attempt, lease=lease, observed_at=database_now)
            registration = self.executions.require(
                job_type=job.job_type,
                job_type_version=job.job_type_version,
            )
            self._validate_terminal_error_contract(registration=registration, error=error)
            projection = build_failure_projection(
                job=job,
                attempt=attempt,
                error=error,
                database_now=database_now,
                retry_jitter=self.retry_jitter,
            )
            await self.repository.finish_attempt(
                attempt=attempt,
                status=JobAttemptStatus.FAILED,
                completed_at=database_now,
                failure=projection.failure,
                conn=conn,
            )
            await self.repository.update_job_fields(
                job=job,
                fields=failure_job_fields(projection.outcome),
                conn=conn,
            )
            if projection.retry_schedule is not None:
                await create_retry_dispatch(
                    repository=self.repository,
                    job=job,
                    dispatch_sequence=attempt.attempt_number + 1,
                    available_at=projection.retry_schedule.retry_at,
                    conn=conn,
                )
            return projection.outcome

    async def acknowledge_cancellation(
        self,
        *,
        lease: JobExecutionLease,
    ) -> JobExecutionTerminalOutcome:
        async with self.tx() as conn:
            job, attempt = await self._load_records(lease=lease, conn=conn)
            replay = replay_cancellation(job=job, attempt=attempt, lease=lease)
            if replay is not None:
                return replay
            database_now = await self.repository.get_database_time(conn=conn)
            validate_execution_fence(job=job, attempt=attempt, lease=lease, observed_at=database_now)
            if job.cancel_requested_at is None:
                raise Conflict(
                    message=t("errors", "BACKGROUND_JOB_CANCELLATION_NOT_REQUESTED"),
                    error="BACKGROUND_JOB_CANCELLATION_NOT_REQUESTED",
                )
            outcome = JobExecutionTerminalOutcome(
                job_id=job.id,
                attempt_id=attempt.id,
                internal_status=JobInternalStatus.CANCELLED,
                completed_at=database_now,
            )
            await self.repository.finish_attempt(
                attempt=attempt,
                status=JobAttemptStatus.CANCELLED,
                completed_at=database_now,
                failure=None,
                conn=conn,
            )
            await self.repository.update_job_fields(
                job=job,
                fields=cancellation_job_fields(outcome=outcome),
                conn=conn,
            )
            return outcome

    async def interrupt_for_user(
        self,
        *,
        lease: JobExecutionLease,
        interruption: JobHandledInterruption,
    ) -> JobExecutionTerminalOutcome:
        async with self.tx() as conn:
            job, attempt = await self._load_records(lease=lease, conn=conn)
            replay = replay_interruption(
                job=job,
                attempt=attempt,
                lease=lease,
                interruption=interruption,
            )
            if replay is not None:
                return replay
            database_now = await self.repository.get_database_time(conn=conn)
            validate_execution_fence(job=job, attempt=attempt, lease=lease, observed_at=database_now)
            outcome = interruption_outcome(
                job=job,
                attempt=attempt,
                interruption=interruption,
            )
            await self.repository.finish_attempt(
                attempt=attempt,
                status=JobAttemptStatus.INTERRUPTED,
                completed_at=database_now,
                failure=None,
                conn=conn,
            )
            await self.repository.update_job_fields(
                job=job,
                fields=interruption_job_fields(interruption=interruption),
                conn=conn,
            )
            return outcome

    def _validate_result_reference(
        self,
        *,
        registration: JobTypeRegistration,
        result: BaseSchema,
    ) -> tuple[BaseSchema, JsonObject]:
        try:
            validated = registration.result_reference_schema.model_validate(result)
        except (TypeError, ValueError) as exc:
            raise JobExecutionResultContractError() from exc
        return validated, cast(JsonObject, validated.model_dump(mode="json", by_alias=True))

    def _validate_result_semantics(
        self,
        *,
        registration: JobTypeRegistration,
        job: BackgroundJobRecord,
        result: BaseSchema,
    ) -> None:
        try:
            target = registration.target_schema.model_validate(job.target_descriptor)
            input_reference = registration.input_reference_schema.model_validate(job.input_reference)
        except (TypeError, ValueError) as exc:
            raise JobExecutionTerminalInvariantError(
                "canonical Job references violate their registered execution schemas"
            ) from exc
        try:
            registration.result_semantic_validator(
                JobResultSemanticContext(
                    job_id=job.id,
                    source_revision=job.source_revision,
                    target=target,
                    input_reference=input_reference,
                    result_reference=result,
                )
            )
        except (TypeError, ValueError) as exc:
            raise JobExecutionResultContractError() from exc

    def _validate_terminal_error_contract(
        self,
        *,
        registration: JobTypeRegistration,
        error: TerminalExecutionError,
    ) -> None:
        contract = registration.resolve_terminal_error_contract(code=error.code)
        if contract is None:
            raise JobExecutionErrorContractError()

        metadata = error.metadata
        if contract.metadata_schema is None:
            if metadata is not None:
                raise JobExecutionErrorContractError()
            return

        payload = metadata or {}
        try:
            validated = contract.metadata_schema.model_validate(payload)
            canonical = cast(
                JsonObject,
                validated.model_dump(mode="json", by_alias=True, exclude_none=True),
            )
        except (TypeError, ValueError) as exc:
            raise JobExecutionErrorContractError() from exc
        if canonical != payload:
            raise JobExecutionErrorContractError()

    async def _load_records(
        self,
        *,
        lease: JobExecutionLease,
        conn: BaseDBAsyncClient,
    ) -> tuple[BackgroundJobRecord, JobAttemptRecord]:
        job = await self.repository.get_job_for_update(job_id=lease.job_id, conn=conn)
        if job is None:
            raise NotFound(
                message=t("errors", "BACKGROUND_JOB_NOT_FOUND"),
                error="BACKGROUND_JOB_NOT_FOUND",
            )
        attempt = await self.repository.get_attempt_for_update(attempt_id=lease.attempt_id, conn=conn)
        if attempt is None:
            raise NotFound(
                message=t("errors", "BACKGROUND_JOB_ATTEMPT_NOT_FOUND"),
                error="BACKGROUND_JOB_ATTEMPT_NOT_FOUND",
            )
        return job, attempt
