from __future__ import annotations

from datetime import datetime
from typing import Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobAttemptStatus,
    JobDispatchOutboxRecord,
)
from src.modules.jobs.reaper_schema import JobLeaseReapCandidate
from src.modules.jobs.schema import BackgroundJobFailure, JobDispatchEnvelope


class JobExecutionRepository(Protocol):
    async def get_job_dispatch_for_update(
        self, *, job_id: UUID, dispatch_sequence: int, conn: BaseDBAsyncClient
    ) -> JobDispatchOutboxRecord | None: ...

    async def get_job_for_update(self, *, job_id: UUID, conn: BaseDBAsyncClient) -> BackgroundJobRecord | None: ...

    async def get_active_attempt_for_update(
        self, *, job_id: UUID, conn: BaseDBAsyncClient
    ) -> JobAttemptRecord | None: ...

    async def get_attempt_for_update(self, *, attempt_id: UUID, conn: BaseDBAsyncClient) -> JobAttemptRecord | None: ...

    async def get_job_attempt_for_update(
        self,
        *,
        job_id: UUID,
        attempt_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> JobAttemptRecord | None: ...

    async def get_job_dispatch(
        self,
        *,
        job_id: UUID,
        dispatch_sequence: int,
        conn: BaseDBAsyncClient,
    ) -> JobDispatchOutboxRecord | None: ...

    async def get_database_time(self, *, conn: BaseDBAsyncClient) -> datetime: ...

    async def list_expired_attempt_candidates(
        self,
        *,
        now: datetime,
        limit: int,
        conn: BaseDBAsyncClient,
    ) -> list[JobLeaseReapCandidate]: ...

    async def mark_dispatch_succeeded(
        self,
        *,
        dispatch: JobDispatchOutboxRecord,
        task_message_id: str | None,
        dispatched_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> None: ...

    async def mark_job_queued(self, *, job: BackgroundJobRecord, conn: BaseDBAsyncClient) -> None: ...

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
    ) -> JobAttemptRecord: ...

    async def mark_job_running(
        self,
        *,
        job: BackgroundJobRecord,
        started_at: datetime,
        initial_phase: str,
        conn: BaseDBAsyncClient,
    ) -> None: ...

    async def heartbeat_attempt(
        self,
        *,
        attempt: JobAttemptRecord,
        heartbeat_at: datetime,
        lease_until: datetime,
        conn: BaseDBAsyncClient,
    ) -> None: ...

    async def finish_attempt_succeeded(
        self,
        *,
        attempt: JobAttemptRecord,
        completed_at: datetime,
        result_reference: JsonObject,
        conn: BaseDBAsyncClient,
    ) -> None: ...

    async def finish_attempt(
        self,
        *,
        attempt: JobAttemptRecord,
        status: JobAttemptStatus,
        completed_at: datetime,
        failure: BackgroundJobFailure | None,
        conn: BaseDBAsyncClient,
    ) -> None: ...

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
    ) -> JobDispatchOutboxRecord: ...

    async def update_job_fields(
        self, *, job: BackgroundJobRecord, fields: dict[str, object], conn: BaseDBAsyncClient
    ) -> None: ...
