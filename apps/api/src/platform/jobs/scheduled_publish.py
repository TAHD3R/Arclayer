from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from src.core.logging import get_logger
from src.models.content._enums import PublishJobStatus, PublishJobType
from src.models.content.publish_job import PublishJobRecord
from src.modules.projects.publish.jobs.service import PublishJobService

logger = get_logger(__name__)


async def check_scheduled_publishes() -> int:
    now = datetime.now(tz=UTC)
    jobs = (
        await PublishJobRecord
        .filter(
            job_type=PublishJobType.SCHEDULED_PUBLISH,
            status=PublishJobStatus.PENDING,
            scheduled_at__not_isnull=True,
            scheduled_at__lte=now,
        )
        .order_by("scheduled_at", "id")
        .all()
    )
    for job in jobs:
        if job.release_id is None:
            continue
        await execute_scheduled_publish(job.release_id)
    return len(jobs)


async def execute_scheduled_publish(release_id: UUID) -> None:
    service = PublishJobService()
    await service.execute_scheduled_release(release_id=release_id)
    logger.info("Scheduled publish task completed", release_id=str(release_id))
