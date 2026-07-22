from __future__ import annotations

from datetime import datetime

from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.jobs.background_job import BackgroundJobRecord
from src.modules.jobs.execution_repository import JobExecutionRepository
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.schema import build_job_dispatch_envelope


async def create_retry_dispatch(
    *,
    repository: JobExecutionRepository,
    job: BackgroundJobRecord,
    dispatch_sequence: int,
    available_at: datetime,
    conn: BaseDBAsyncClient,
) -> None:
    """Persist one policy-authorized retry outbox with its canonical envelope."""

    envelope = build_job_dispatch_envelope(job=job, dispatch_sequence=dispatch_sequence)
    await repository.create_dispatch(
        job=job,
        dispatch_sequence=dispatch_sequence,
        task_name=job.task_name,
        envelope=envelope,
        envelope_hash=hash_json(envelope.model_dump(mode="json", by_alias=True)),
        available_at=available_at,
        conn=conn,
    )
