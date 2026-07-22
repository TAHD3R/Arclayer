from __future__ import annotations

from datetime import datetime, timedelta
from typing import Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.utils.ids import uuid7
from src.config import Settings
from src.core.events import events
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService, DomainEventPublisher
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobDispatchOutboxRecord,
    JobDispatchStatus,
    JobInternalStatus,
)
from src.modules.jobs.dispatch_validation import validate_dispatch_envelope, validate_job_envelope
from src.modules.jobs.repository import BackgroundJobRepository
from src.modules.jobs.schema import JobDispatchEnvelope, JobDispatchPolicy


class JobTransportDispatcher(Protocol):
    async def dispatch(self, *, task_name: str, envelope: JobDispatchEnvelope) -> str: ...


class JobDispatchService(BaseService):
    def __init__(
        self,
        settings: Settings | None = None,
        *,
        repository: BackgroundJobRepository | None = None,
        event_publisher: DomainEventPublisher | None = events,
    ) -> None:
        super().__init__(settings, event_publisher=event_publisher, default_event_source="job-dispatcher")
        self.repository = repository or BackgroundJobRepository()

    async def claim_due_dispatches(
        self,
        *,
        dispatcher_id: str,
        limit: int,
        policy: JobDispatchPolicy,
    ) -> list[JobDispatchOutboxRecord]:
        normalized_dispatcher_id = dispatcher_id.strip()
        if not normalized_dispatcher_id:
            raise BadRequest(
                message=t("errors", "BACKGROUND_JOB_DISPATCHER_ID_REQUIRED"),
                error="BACKGROUND_JOB_DISPATCHER_ID_REQUIRED",
            )
        if limit < 1:
            raise BadRequest(
                message=t("errors", "BACKGROUND_JOB_DISPATCH_LIMIT_INVALID"),
                error="BACKGROUND_JOB_DISPATCH_LIMIT_INVALID",
            )

        async with self.tx() as conn:
            selection_time = await self.repository.get_database_time(conn=conn)
            dispatches = await self.repository.list_due_dispatches_for_update(
                now=selection_time,
                limit=limit,
                conn=conn,
            )
            claimed: list[JobDispatchOutboxRecord] = []
            for dispatch in dispatches:
                job = await self.repository.get_job_for_update(job_id=dispatch.job_id, conn=conn)
                if job is None:
                    raise NotFound(
                        message=t("errors", "BACKGROUND_JOB_NOT_FOUND"),
                        error="BACKGROUND_JOB_NOT_FOUND",
                    )
                envelope = JobDispatchEnvelope.model_validate(dispatch.envelope)
                validate_dispatch_envelope(dispatch=dispatch, envelope=envelope)
                validate_job_envelope(job=job, task_name=dispatch.task_name, envelope=envelope)
                _validate_job_dispatch_claim(job=job, dispatch=dispatch)
                claimed_at = await self.repository.get_database_time(conn=conn)
                if dispatch.dispatch_attempt_count >= policy.max_attempts:
                    await self._mark_dispatch_exhausted(
                        dispatch=dispatch,
                        job=job,
                        error_message=t("errors", "BACKGROUND_JOB_DISPATCH_EXHAUSTED"),
                        completed_at=claimed_at,
                        conn=conn,
                    )
                    continue
                if job.internal_status == JobInternalStatus.RETRY_SCHEDULED:
                    await self.repository.update_job_fields(
                        job=job,
                        fields={"internal_status": JobInternalStatus.PENDING_DISPATCH},
                        conn=conn,
                    )
                await self.repository.claim_dispatch(
                    dispatch=dispatch,
                    dispatcher_id=normalized_dispatcher_id,
                    claim_token=uuid7(),
                    claimed_at=claimed_at,
                    lease_until=claimed_at + timedelta(seconds=policy.lease_seconds),
                    conn=conn,
                )
                claimed.append(dispatch)
        return claimed

    async def dispatch_claimed(
        self,
        *,
        dispatch_id: UUID,
        claim_token: UUID,
        transport: JobTransportDispatcher,
        policy: JobDispatchPolicy,
    ) -> JobDispatchOutboxRecord:
        dispatch = await self.repository.get_dispatch(dispatch_id=dispatch_id)
        if dispatch is None:
            raise NotFound(
                message=t("errors", "BACKGROUND_JOB_DISPATCH_NOT_FOUND"),
                error="BACKGROUND_JOB_DISPATCH_NOT_FOUND",
            )
        _validate_dispatch_claim(dispatch=dispatch, claim_token=claim_token)
        envelope = JobDispatchEnvelope.model_validate(dispatch.envelope)
        validate_dispatch_envelope(dispatch=dispatch, envelope=envelope)
        try:
            task_message_id = await transport.dispatch(task_name=dispatch.task_name, envelope=envelope)
        except Exception as exc:
            reconciled = await self._record_dispatch_failure(
                dispatch_id=dispatch.id,
                claim_token=claim_token,
                envelope=envelope,
                error_message=str(exc)[:4000],
                policy=policy,
            )
            if reconciled is not None:
                return reconciled
            raise

        async with self.tx() as conn:
            locked = await self._get_dispatch_for_update(dispatch_id=dispatch.id, conn=conn)
            validate_dispatch_envelope(dispatch=locked, envelope=envelope)
            job = await self.repository.get_job_for_update(job_id=locked.job_id, conn=conn)
            if job is None:
                raise NotFound(
                    message=t("errors", "BACKGROUND_JOB_NOT_FOUND"),
                    error="BACKGROUND_JOB_NOT_FOUND",
                )
            database_now = await self.repository.get_database_time(conn=conn)
            if locked.status != JobDispatchStatus.DISPATCHED:
                _validate_dispatch_claim(dispatch=locked, claim_token=claim_token)
                await self.repository.mark_dispatch_succeeded(
                    dispatch=locked,
                    task_message_id=task_message_id,
                    dispatched_at=database_now,
                    conn=conn,
                )
            if job.internal_status == JobInternalStatus.PENDING_DISPATCH:
                await self.repository.mark_job_queued(job=job, conn=conn)
        return locked

    async def _record_dispatch_failure(
        self,
        *,
        dispatch_id: UUID,
        claim_token: UUID,
        envelope: JobDispatchEnvelope,
        error_message: str,
        policy: JobDispatchPolicy,
    ) -> JobDispatchOutboxRecord | None:
        async with self.tx() as conn:
            dispatch = await self._get_dispatch_for_update(dispatch_id=dispatch_id, conn=conn)
            validate_dispatch_envelope(dispatch=dispatch, envelope=envelope)
            job = await self.repository.get_job_for_update(job_id=dispatch.job_id, conn=conn)
            if job is None:
                raise NotFound(
                    message=t("errors", "BACKGROUND_JOB_NOT_FOUND"),
                    error="BACKGROUND_JOB_NOT_FOUND",
                )
            database_now = await self.repository.get_database_time(conn=conn)
            if dispatch.status == JobDispatchStatus.DISPATCHED:
                # An exact worker reconciliation is durable proof that the broker accepted the message.
                if job.internal_status == JobInternalStatus.PENDING_DISPATCH:
                    await self.repository.mark_job_queued(job=job, conn=conn)
                return dispatch

            _validate_dispatch_claim(dispatch=dispatch, claim_token=claim_token)

            if dispatch.dispatch_attempt_count >= policy.max_attempts:
                await self._mark_dispatch_exhausted(
                    dispatch=dispatch,
                    job=job,
                    error_message=error_message,
                    completed_at=database_now,
                    conn=conn,
                )
                return None

            await self.repository.mark_dispatch_failed(
                dispatch=dispatch,
                error_message=error_message,
                next_attempt_at=database_now + timedelta(seconds=policy.retry_delay_seconds),
                conn=conn,
            )
        return None

    async def _mark_dispatch_exhausted(
        self,
        *,
        dispatch: JobDispatchOutboxRecord,
        job: BackgroundJobRecord,
        error_message: str,
        completed_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self.repository.mark_dispatch_dead_lettered(
            dispatch=dispatch,
            error_message=error_message,
            conn=conn,
        )
        await self.repository.update_job_fields(
            job=job,
            fields={
                "internal_status": JobInternalStatus.DEAD_LETTERED,
                "completed_at": completed_at,
                "error_code": "BACKGROUND_JOB_DISPATCH_EXHAUSTED",
                "error_message": error_message,
            },
            conn=conn,
        )

    async def _get_dispatch_for_update(
        self,
        *,
        dispatch_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> JobDispatchOutboxRecord:
        dispatch = await self.repository.get_dispatch_for_update(dispatch_id=dispatch_id, conn=conn)
        if dispatch is None:
            raise NotFound(
                message=t("errors", "BACKGROUND_JOB_DISPATCH_NOT_FOUND"),
                error="BACKGROUND_JOB_DISPATCH_NOT_FOUND",
            )
        return dispatch


def _validate_dispatch_claim(*, dispatch: JobDispatchOutboxRecord, claim_token: UUID) -> None:
    if dispatch.status != JobDispatchStatus.DISPATCHING or dispatch.claim_token != claim_token:
        raise Conflict(
            message=t("errors", "BACKGROUND_JOB_DISPATCH_CLAIM_STALE"),
            error="BACKGROUND_JOB_DISPATCH_CLAIM_STALE",
        )


def _validate_job_dispatch_claim(
    *,
    job: BackgroundJobRecord,
    dispatch: JobDispatchOutboxRecord,
) -> None:
    if (
        job.internal_status not in {JobInternalStatus.PENDING_DISPATCH, JobInternalStatus.RETRY_SCHEDULED}
        or dispatch.dispatch_sequence != job.attempt_count + 1
    ):
        raise Conflict(
            message=t("errors", "BACKGROUND_JOB_DISPATCH_NOT_READY"),
            error="BACKGROUND_JOB_DISPATCH_NOT_READY",
        )
