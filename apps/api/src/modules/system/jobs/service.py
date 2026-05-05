from __future__ import annotations

from uuid import UUID

from src.core.http.pagination import PageData, PageParams, paginate_queryset
from src.core.services import BaseService
from src.models.content.publish_job import PublishJobRecord
from src.modules.projects.publish.jobs.service import PublishJobService
from src.modules.system.jobs.schema import PublishJobListQuery, PublishJobOut


class SystemJobsService(BaseService):
    def __init__(self) -> None:
        super().__init__()
        self.publish_jobs = PublishJobService()

    async def list_jobs(self, *, params: PageParams, filters: PublishJobListQuery) -> PageData[PublishJobOut]:
        qs = PublishJobRecord.all().order_by("-created_at")
        if filters.status is not None:
            qs = qs.filter(status=filters.status)
        if filters.job_type is not None:
            qs = qs.filter(job_type=filters.job_type)
        return await paginate_queryset(qs, params=params, out_schema=PublishJobOut)

    async def retry_job(self, *, job_id: UUID) -> PublishJobOut:
        job = await self.publish_jobs.retry_publish_job(job_id=job_id)
        return PublishJobOut.model_validate(job, from_attributes=True)
