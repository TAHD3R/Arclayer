from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timedelta
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q
from tortoise.functions import Count, Min
from tortoise.queryset import QuerySet

from src.common.types.json_types import JsonObject
from src.core.http.pagination import PageParams
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobAttemptStatus,
    JobDispatchOutboxRecord,
    JobDispatchStatus,
    JobInternalStatus,
    JobWorkloadClass,
)
from src.modules.jobs.platform_schema import PlatformJobListQuery
from src.modules.jobs.reaper_schema import JobLeaseReapCandidate
from src.modules.jobs.registry import JobTargetScope, JobTypeDefinition
from src.modules.jobs.schema import BackgroundJobCreate, BackgroundJobFailure, JobDispatchEnvelope
from src.modules.jobs.workspace_schema import WorkspaceJobListQuery

_ACTIVE_ATTEMPT_STATUSES = (JobAttemptStatus.CLAIMED, JobAttemptStatus.RUNNING)
_PLATFORM_BACKLOG_STATUSES = (
    JobInternalStatus.PENDING_DISPATCH,
    JobInternalStatus.QUEUED,
    JobInternalStatus.RETRY_SCHEDULED,
)
_PLATFORM_OUTBOX_IN_FLIGHT_STATUSES = (
    JobDispatchStatus.PENDING,
    JobDispatchStatus.DISPATCHING,
    JobDispatchStatus.RETRY_SCHEDULED,
)


class BackgroundJobRepositoryInvariantError(RuntimeError):
    """Persisted Job state violates a repository-level execution invariant."""


class ActiveJobAttemptInvariantError(BackgroundJobRepositoryInvariantError):
    """More than one active Attempt exists for one durable Job."""

    def __init__(self, *, job_id: UUID, attempt_ids: Sequence[UUID]) -> None:
        self.job_id = job_id
        self.attempt_ids = tuple(attempt_ids)
        identifiers = ", ".join(str(attempt_id) for attempt_id in self.attempt_ids)
        super().__init__(f"Background Job {job_id} has multiple active Attempts: {identifiers}")


def _job_definition_filter(definitions: Sequence[JobTypeDefinition]) -> Q | None:
    filters: list[Q] = []
    for definition in definitions:
        item = Q(job_type=definition.job_type, job_type_version=definition.job_type_version)
        if definition.target_scope == JobTargetScope.WORKSPACE:
            item &= Q(project_id=None, site_id=None)
        elif definition.target_scope == JobTargetScope.PROJECT:
            item &= Q(project_id__isnull=False, site_id=None)
        elif definition.target_scope == JobTargetScope.RUNTIME:
            item &= Q(project_id__isnull=False, site_id__isnull=False)
        filters.append(item)
    if not filters:
        return None
    combined = filters[0]
    for item in filters[1:]:
        combined |= item
    return combined


def _workspace_visibility_filter(
    *,
    workspace_definitions: Sequence[JobTypeDefinition],
    project_definitions: Sequence[JobTypeDefinition],
    owner_definitions: Sequence[JobTypeDefinition],
    accessible_project_ids: Sequence[UUID],
    actor_user_id: UUID,
) -> Q | None:
    visibility_filters: list[Q] = []
    workspace_filter = _job_definition_filter(workspace_definitions)
    if workspace_filter is not None:
        visibility_filters.append(workspace_filter)
    project_filter = _job_definition_filter(project_definitions)
    if project_filter is not None and accessible_project_ids:
        visibility_filters.append(project_filter & Q(project_id__in=accessible_project_ids))
    owner_filter = _job_definition_filter(owner_definitions)
    if owner_filter is not None:
        visibility_filters.append(owner_filter & Q(actor_user_id=actor_user_id))
    if not visibility_filters:
        return None
    combined = visibility_filters[0]
    for item in visibility_filters[1:]:
        combined |= item
    return combined


class BackgroundJobRepository(TortoiseORMRepository):
    def __init__(self) -> None:
        super().__init__(BackgroundJobRecord)

    async def get_by_idempotency_hash(
        self,
        *,
        idempotency_key_hash: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> BackgroundJobRecord | None:
        query = BackgroundJobRecord.filter(idempotency_key_hash=idempotency_key_hash)
        return await self.using_db(query, conn).first()

    async def get_job_for_update(
        self,
        *,
        job_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> BackgroundJobRecord | None:
        return await BackgroundJobRecord.filter(id=job_id).using_db(conn).select_for_update().first()

    async def get_database_time(self, *, conn: BaseDBAsyncClient) -> datetime:
        rows = await conn.execute_query_dict("SELECT clock_timestamp() AS database_time")
        if len(rows) != 1:
            raise BackgroundJobRepositoryInvariantError(f"Expected one PostgreSQL clock row, received {len(rows)}")
        database_time = rows[0].get("database_time")
        if not isinstance(database_time, datetime) or database_time.utcoffset() is None:
            raise BackgroundJobRepositoryInvariantError(
                "PostgreSQL clock_timestamp() must return a timezone-aware datetime"
            )
        return database_time

    async def list_expired_attempt_candidates(
        self,
        *,
        now: datetime,
        limit: int,
        conn: BaseDBAsyncClient,
    ) -> list[JobLeaseReapCandidate]:
        query = (
            JobAttemptRecord
            .filter(
                status__in=_ACTIVE_ATTEMPT_STATUSES,
                lease_until__lte=now,
            )
            .order_by("lease_until", "created_at", "id")
            .limit(limit)
        )
        attempts = await query.using_db(conn)
        return [
            JobLeaseReapCandidate(
                job_id=attempt.job_id,
                attempt_id=attempt.id,
                lease_until=attempt.lease_until,
            )
            for attempt in attempts
        ]

    async def list_workspace_jobs(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        accessible_project_ids: Sequence[UUID],
        workspace_definitions: Sequence[JobTypeDefinition],
        project_definitions: Sequence[JobTypeDefinition],
        owner_definitions: Sequence[JobTypeDefinition],
        internal_statuses: Sequence[JobInternalStatus] | None,
        filters: WorkspaceJobListQuery,
        params: PageParams,
    ) -> tuple[list[BackgroundJobRecord], int]:
        visibility_filter = _workspace_visibility_filter(
            workspace_definitions=workspace_definitions,
            project_definitions=project_definitions,
            owner_definitions=owner_definitions,
            accessible_project_ids=accessible_project_ids,
            actor_user_id=actor_user_id,
        )
        if visibility_filter is None:
            return [], 0

        query = BackgroundJobRecord.filter(workspace_id=workspace_id).filter(visibility_filter)
        query = self._apply_workspace_filters(
            query=query,
            filters=filters,
            internal_statuses=internal_statuses,
        )
        total = int(await query.count())
        rows = await query.order_by("-created_at", "-id").offset(params.offset).limit(params.limit)
        return list(rows), total

    async def get_visible_workspace_job(
        self,
        *,
        workspace_id: UUID,
        job_id: UUID,
        actor_user_id: UUID,
        accessible_project_ids: Sequence[UUID],
        workspace_definitions: Sequence[JobTypeDefinition],
        project_definitions: Sequence[JobTypeDefinition],
        owner_definitions: Sequence[JobTypeDefinition],
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> BackgroundJobRecord | None:
        visibility_filter = _workspace_visibility_filter(
            workspace_definitions=workspace_definitions,
            project_definitions=project_definitions,
            owner_definitions=owner_definitions,
            accessible_project_ids=accessible_project_ids,
            actor_user_id=actor_user_id,
        )
        if visibility_filter is None:
            return None
        query = BackgroundJobRecord.filter(id=job_id, workspace_id=workspace_id).filter(visibility_filter)
        query = self.using_db(query, conn)
        if for_update:
            query = query.select_for_update()
        return await query.first()

    @staticmethod
    def _apply_workspace_filters(
        *,
        query: QuerySet[BackgroundJobRecord],
        filters: WorkspaceJobListQuery,
        internal_statuses: Sequence[JobInternalStatus] | None,
    ) -> QuerySet[BackgroundJobRecord]:
        if internal_statuses is not None:
            query = query.filter(internal_status__in=internal_statuses)
        if filters.job_type is not None:
            query = query.filter(job_type=filters.job_type)
        if filters.workload is not None:
            query = query.filter(workload_class=filters.workload)
        if filters.project_id is not None:
            query = query.filter(project_id=filters.project_id)
        if filters.created_from is not None:
            query = query.filter(created_at__gte=filters.created_from)
        if filters.created_to is not None:
            query = query.filter(created_at__lte=filters.created_to)
        return query

    async def create_job(
        self,
        *,
        command: BackgroundJobCreate,
        definition: JobTypeDefinition,
        idempotency_scope_key: str,
        idempotency_key_hash: str,
        request_fingerprint: str,
        conn: BaseDBAsyncClient,
    ) -> BackgroundJobRecord:
        return await self.create_record(
            BackgroundJobRecord,
            conn=conn,
            job_type=command.job_type,
            job_type_version=command.job_type_version,
            task_name=command.task_name,
            workload_class=command.workload_class,
            retry_class=command.retry_class,
            authority_mode=command.authority_mode,
            workspace_id=command.workspace_id,
            project_id=command.project_id,
            site_id=command.site_id,
            actor_user_id=command.actor_user_id,
            target_descriptor=command.target_descriptor,
            input_reference=command.input_reference,
            idempotency_scope_key=idempotency_scope_key,
            idempotency_key_hash=idempotency_key_hash,
            request_fingerprint=request_fingerprint,
            source_revision=command.source_revision,
            correlation_id=command.correlation_id,
            trace_id=command.trace_id,
            retry_policy=definition.retry_policy.model_dump(mode="json", by_alias=True),
            timeout_seconds=command.timeout_seconds,
            lease_seconds=command.lease_seconds,
            heartbeat_seconds=command.heartbeat_seconds,
            retry_of_job_id=command.retry_of_job_id,
            phase=definition.initial_phase,
            status_key=definition.initial_status_key or command.status_key,
        )

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
        return await self.create_record(
            JobDispatchOutboxRecord,
            conn=conn,
            job_id=job.id,
            dispatch_sequence=dispatch_sequence,
            task_name=task_name,
            message_schema_version=envelope.message_schema_version,
            envelope=envelope.model_dump(mode="json", by_alias=True),
            envelope_hash=envelope_hash,
            workload_class=job.workload_class,
            available_at=available_at,
        )

    async def get_job_dispatch_for_update(
        self,
        *,
        job_id: UUID,
        dispatch_sequence: int,
        conn: BaseDBAsyncClient,
    ) -> JobDispatchOutboxRecord | None:
        query = JobDispatchOutboxRecord.filter(job_id=job_id, dispatch_sequence=dispatch_sequence)
        return await query.using_db(conn).select_for_update().first()

    async def get_job_dispatch(
        self,
        *,
        job_id: UUID,
        dispatch_sequence: int,
        conn: BaseDBAsyncClient,
    ) -> JobDispatchOutboxRecord | None:
        query = JobDispatchOutboxRecord.filter(job_id=job_id, dispatch_sequence=dispatch_sequence)
        return await query.using_db(conn).first()

    async def get_dispatch_for_update(
        self,
        *,
        dispatch_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> JobDispatchOutboxRecord | None:
        query = JobDispatchOutboxRecord.filter(id=dispatch_id)
        return await query.using_db(conn).select_for_update().first()

    async def list_due_dispatches_for_update(
        self,
        *,
        now: datetime,
        limit: int,
        conn: BaseDBAsyncClient,
    ) -> list[JobDispatchOutboxRecord]:
        pending_or_retry_due = Q(
            status__in=[JobDispatchStatus.PENDING, JobDispatchStatus.RETRY_SCHEDULED],
            available_at__lte=now,
        ) & (Q(next_dispatch_at=None) | Q(next_dispatch_at__lte=now))
        expired_claim = Q(
            status=JobDispatchStatus.DISPATCHING,
            lease_until__lte=now,
        )
        query = (
            JobDispatchOutboxRecord
            .filter(pending_or_retry_due | expired_claim)
            .order_by("available_at", "created_at", "id")
            .limit(limit)
        )
        return await query.using_db(conn).select_for_update(skip_locked=True)

    async def claim_dispatch(
        self,
        *,
        dispatch: JobDispatchOutboxRecord,
        dispatcher_id: str,
        claim_token: UUID,
        claimed_at: datetime,
        lease_until: datetime,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self.update_fields(
            dispatch,
            fields={
                "status": JobDispatchStatus.DISPATCHING,
                "dispatch_attempt_count": dispatch.dispatch_attempt_count + 1,
                "dispatcher_id": dispatcher_id,
                "claim_token": claim_token,
                "lease_until": lease_until,
                "heartbeat_at": claimed_at,
                "next_dispatch_at": None,
            },
            conn=conn,
        )

    async def get_dispatch(self, *, dispatch_id: UUID) -> JobDispatchOutboxRecord | None:
        return await JobDispatchOutboxRecord.filter(id=dispatch_id).first()

    async def mark_dispatch_succeeded(
        self,
        *,
        dispatch: JobDispatchOutboxRecord,
        task_message_id: str | None,
        dispatched_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self.update_fields(
            dispatch,
            fields={
                "status": JobDispatchStatus.DISPATCHED,
                "dispatched_at": dispatched_at,
                "task_message_id": task_message_id,
                "last_error": None,
                "dispatcher_id": None,
                "claim_token": None,
                "lease_until": None,
                "heartbeat_at": None,
            },
            conn=conn,
        )

    async def mark_dispatch_failed(
        self,
        *,
        dispatch: JobDispatchOutboxRecord,
        error_message: str,
        next_attempt_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self.update_fields(
            dispatch,
            fields={
                "status": JobDispatchStatus.RETRY_SCHEDULED,
                "next_dispatch_at": next_attempt_at,
                "last_error": error_message,
                "dispatcher_id": None,
                "claim_token": None,
                "lease_until": None,
                "heartbeat_at": None,
            },
            conn=conn,
        )

    async def mark_dispatch_dead_lettered(
        self,
        *,
        dispatch: JobDispatchOutboxRecord,
        error_message: str,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self.update_fields(
            dispatch,
            fields={
                "status": JobDispatchStatus.DEAD_LETTERED,
                "last_error": error_message,
                "dispatcher_id": None,
                "claim_token": None,
                "lease_until": None,
                "heartbeat_at": None,
            },
            conn=conn,
        )

    async def mark_job_queued(
        self,
        *,
        job: BackgroundJobRecord,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self.update_fields(
            job,
            fields={"internal_status": JobInternalStatus.QUEUED},
            conn=conn,
        )

    async def get_active_attempt_for_update(
        self,
        *,
        job_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> JobAttemptRecord | None:
        query = (
            JobAttemptRecord
            .filter(job_id=job_id, status__in=_ACTIVE_ATTEMPT_STATUSES)
            .order_by("attempt_number", "id")
            .limit(2)
        )
        attempts = await query.using_db(conn).select_for_update()
        if len(attempts) > 1:
            raise ActiveJobAttemptInvariantError(
                job_id=job_id,
                attempt_ids=[attempt.id for attempt in attempts],
            )
        return attempts[0] if attempts else None

    async def create_attempt(
        self,
        *,
        job: BackgroundJobRecord,
        dispatch: JobDispatchOutboxRecord,
        fencing_token: UUID,
        worker_id: str,
        started_at: datetime,
        lease_until: datetime,
        conn: BaseDBAsyncClient,
    ) -> JobAttemptRecord:
        return await self.create_record(
            JobAttemptRecord,
            conn=conn,
            job_id=job.id,
            dispatch_id=dispatch.id,
            attempt_number=job.attempt_count + 1,
            fencing_token=fencing_token,
            status=JobAttemptStatus.RUNNING,
            worker_id=worker_id,
            handler_version=job.job_type_version,
            claimed_at=started_at,
            lease_until=lease_until,
            heartbeat_at=started_at,
            timeout_at=(
                started_at + timedelta(seconds=job.timeout_seconds) if job.timeout_seconds is not None else None
            ),
            started_at=started_at,
        )

    async def mark_job_running(
        self,
        *,
        job: BackgroundJobRecord,
        started_at: datetime,
        initial_phase: str,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self.update_fields(
            job,
            fields={
                "internal_status": JobInternalStatus.RUNNING,
                "attempt_count": job.attempt_count + 1,
                "started_at": job.started_at or started_at,
                "next_attempt_at": None,
                "phase": initial_phase,
                "status_key": None,
                "progress_completed": 0,
                "error_code": None,
                "error_message": None,
                "error_metadata": None,
            },
            conn=conn,
        )

    async def finish_attempt(
        self,
        *,
        attempt: JobAttemptRecord,
        status: JobAttemptStatus,
        completed_at: datetime,
        failure: BackgroundJobFailure | None,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self.update_fields(
            attempt,
            fields={
                "status": status,
                "completed_at": completed_at,
                "result_reference": None,
                "error_code": failure.error_code if failure is not None else None,
                "error_message": failure.error_message if failure is not None else None,
                "error_metadata": failure.error_metadata if failure is not None else None,
                "failure_classification": (failure.failure_classification if failure is not None else None),
                "retry_decision": failure.retry_decision if failure is not None else None,
                "retry_at": failure.retry_at if failure is not None else None,
                "retry_schedule_source": (failure.retry_schedule_source if failure is not None else None),
                "retry_delay_seconds": (failure.retry_delay_seconds if failure is not None else None),
                "retry_hint_rejection_reason": (failure.retry_hint_rejection_reason if failure is not None else None),
            },
            conn=conn,
        )

    async def finish_attempt_succeeded(
        self,
        *,
        attempt: JobAttemptRecord,
        completed_at: datetime,
        result_reference: JsonObject,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self.update_fields(
            attempt,
            fields={
                "status": JobAttemptStatus.SUCCEEDED,
                "completed_at": completed_at,
                "result_reference": result_reference,
                "error_code": None,
                "error_message": None,
                "error_metadata": None,
                "failure_classification": None,
                "retry_decision": None,
                "retry_at": None,
                "retry_schedule_source": None,
                "retry_delay_seconds": None,
                "retry_hint_rejection_reason": None,
            },
            conn=conn,
        )

    async def get_attempt_for_update(
        self,
        *,
        attempt_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> JobAttemptRecord | None:
        query = JobAttemptRecord.filter(id=attempt_id)
        return await query.using_db(conn).select_for_update().first()

    async def get_job_attempt_for_update(
        self,
        *,
        job_id: UUID,
        attempt_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> JobAttemptRecord | None:
        query = JobAttemptRecord.filter(id=attempt_id, job_id=job_id)
        return await query.using_db(conn).select_for_update().first()

    async def heartbeat_attempt(
        self,
        *,
        attempt: JobAttemptRecord,
        heartbeat_at: datetime,
        lease_until: datetime,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self.update_fields(
            attempt,
            fields={"heartbeat_at": heartbeat_at, "lease_until": lease_until},
            conn=conn,
        )

    async def update_job_fields(
        self,
        *,
        job: BackgroundJobRecord,
        fields: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> None:
        await self.update_fields(job, fields=fields, conn=conn)

    async def list_platform_jobs(
        self,
        *,
        filters: PlatformJobListQuery,
        params: PageParams,
    ) -> tuple[list[BackgroundJobRecord], int]:
        query = BackgroundJobRecord.all()
        if filters.status is not None:
            query = query.filter(internal_status=filters.status)
        if filters.workload is not None:
            query = query.filter(workload_class=filters.workload)
        if filters.job_type is not None:
            query = query.filter(job_type=filters.job_type)
        if filters.workspace_id is not None:
            query = query.filter(workspace_id=filters.workspace_id)
        if filters.project_id is not None:
            query = query.filter(project_id=filters.project_id)
        if filters.error_code is not None:
            query = query.filter(error_code=filters.error_code)
        if filters.created_from is not None:
            query = query.filter(created_at__gte=filters.created_from)
        if filters.created_to is not None:
            query = query.filter(created_at__lte=filters.created_to)
        total = int(await query.count())
        rows = await query.order_by("-created_at", "-id").offset(params.offset).limit(params.limit)
        return list(rows), total

    async def get_platform_job(self, *, job_id: UUID) -> BackgroundJobRecord | None:
        return await BackgroundJobRecord.filter(id=job_id).first()

    async def list_platform_job_attempts(self, *, job_id: UUID) -> list[JobAttemptRecord]:
        rows = await JobAttemptRecord.filter(job_id=job_id).order_by("-attempt_number", "-id")
        return list(rows)

    async def count_platform_jobs_by_workload_status(
        self,
    ) -> dict[tuple[JobWorkloadClass, JobInternalStatus], int]:
        rows = (
            await BackgroundJobRecord
            .annotate(item_count=Count("id"))
            .group_by("workload_class", "internal_status")
            .values("workload_class", "internal_status", "item_count")
        )
        return {(row["workload_class"], row["internal_status"]): int(row["item_count"]) for row in rows}

    async def count_platform_terminal_failures_by_workload(
        self,
        *,
        since: datetime,
    ) -> dict[tuple[JobWorkloadClass, JobInternalStatus], int]:
        rows = (
            await BackgroundJobRecord
            .filter(
                internal_status__in=[JobInternalStatus.FAILED, JobInternalStatus.DEAD_LETTERED],
                completed_at__gte=since,
            )
            .annotate(item_count=Count("id"))
            .group_by("workload_class", "internal_status")
            .values("workload_class", "internal_status", "item_count")
        )
        return {(row["workload_class"], row["internal_status"]): int(row["item_count"]) for row in rows}

    async def count_platform_outbox_by_workload_status(
        self,
    ) -> dict[tuple[JobWorkloadClass, JobDispatchStatus], int]:
        rows = (
            await JobDispatchOutboxRecord
            .annotate(item_count=Count("id"))
            .group_by("workload_class", "status")
            .values("workload_class", "status", "item_count")
        )
        return {(row["workload_class"], row["status"]): int(row["item_count"]) for row in rows}

    async def platform_backlog_extremes_by_workload(
        self,
    ) -> dict[JobWorkloadClass, tuple[datetime | None, datetime | None]]:
        rows = (
            await BackgroundJobRecord
            .filter(internal_status__in=_PLATFORM_BACKLOG_STATUSES)
            .annotate(
                oldest_created=Min("created_at"),
                oldest_next_attempt=Min("next_attempt_at"),
            )
            .group_by("workload_class")
            .values("workload_class", "oldest_created", "oldest_next_attempt")
        )
        return {row["workload_class"]: (row["oldest_created"], row["oldest_next_attempt"]) for row in rows}
