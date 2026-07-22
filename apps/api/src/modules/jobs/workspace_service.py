from __future__ import annotations

from math import ceil
from typing import NoReturn
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.events import events
from src.core.exceptions import Conflict, NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.i18n import t
from src.core.services import BaseService, DomainEventPublisher
from src.models.jobs.background_job import BackgroundJobRecord, JobInternalStatus
from src.modules.jobs.registry import (
    JobPermissionScope,
    JobTypeDefinition,
    JobTypeRegistry,
    JobVisibility,
    get_job_type_registry,
)
from src.modules.jobs.repository import BackgroundJobRepository
from src.modules.jobs.workspace_schema import (
    JobPublicStatus,
    WorkspaceJobCancelRequest,
    WorkspaceJobListQuery,
    WorkspaceJobOut,
)
from src.modules.projects.authz.router_helpers import ensure_project_permission_granted
from src.modules.projects.http.service import get_project_context
from src.modules.projects.repository import ProjectRepository
from src.modules.workspaces.authz.http.service import ensure_workspace_permission_granted
from src.modules.workspaces.http.schema import WorkspaceContext

_TERMINAL_INTERNAL_STATUSES = frozenset({
    JobInternalStatus.SUCCEEDED,
    JobInternalStatus.FAILED,
    JobInternalStatus.DEAD_LETTERED,
    JobInternalStatus.CANCELLED,
})
_PUBLIC_STATUS_INTERNALS: dict[JobPublicStatus, tuple[JobInternalStatus, ...]] = {
    JobPublicStatus.QUEUED: (
        JobInternalStatus.PENDING_DISPATCH,
        JobInternalStatus.QUEUED,
        JobInternalStatus.RETRY_SCHEDULED,
    ),
    JobPublicStatus.RUNNING: (JobInternalStatus.RUNNING,),
    JobPublicStatus.WAITING_FOR_USER: (JobInternalStatus.WAITING_FOR_USER,),
    JobPublicStatus.SUCCEEDED: (JobInternalStatus.SUCCEEDED,),
    JobPublicStatus.FAILED: (JobInternalStatus.FAILED, JobInternalStatus.DEAD_LETTERED),
    JobPublicStatus.CANCELLED: (JobInternalStatus.CANCELLED,),
}


class WorkspaceJobService(BaseService):
    def __init__(
        self,
        settings: Settings | None = None,
        *,
        repository: BackgroundJobRepository | None = None,
        project_repository: ProjectRepository | None = None,
        registry: JobTypeRegistry | None = None,
        event_publisher: DomainEventPublisher | None = events,
    ) -> None:
        super().__init__(settings, event_publisher=event_publisher, default_event_source="workspace-job")
        self.repository = repository or BackgroundJobRepository()
        self.project_repository = project_repository or ProjectRepository()
        self.registry = registry or get_job_type_registry(self.settings)

    async def list_jobs(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        params: PageParams,
        filters: WorkspaceJobListQuery,
    ) -> PageData[WorkspaceJobOut]:
        accessible_project_ids = await self.project_repository.list_accessible_project_ids(
            workspace_id=workspace_id,
            user_id=actor_user_id,
        )
        workspace_definitions, project_definitions, owner_definitions = self._visibility_definitions()
        internal_statuses = _PUBLIC_STATUS_INTERNALS.get(filters.status) if filters.status is not None else None
        jobs, total = await self.repository.list_workspace_jobs(
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            accessible_project_ids=accessible_project_ids,
            workspace_definitions=workspace_definitions,
            project_definitions=project_definitions,
            owner_definitions=owner_definitions,
            internal_statuses=internal_statuses,
            filters=filters,
            params=params,
        )
        return _build_page(
            items=[_to_workspace_job_out(job) for job in jobs],
            total=total,
            params=params,
        )

    async def get_job(
        self,
        *,
        workspace_id: UUID,
        job_id: UUID,
        actor_user_id: UUID,
    ) -> WorkspaceJobOut:
        job = await self._get_visible_job(
            workspace_id=workspace_id,
            job_id=job_id,
            actor_user_id=actor_user_id,
        )
        return _to_workspace_job_out(job)

    async def request_cancellation(
        self,
        *,
        ctx: WorkspaceContext,
        job_id: UUID,
        actor_user_id: UUID,
        payload: WorkspaceJobCancelRequest,
    ) -> WorkspaceJobOut:
        accessible_project_ids = await self.project_repository.list_accessible_project_ids(
            workspace_id=ctx.workspace_id,
            user_id=actor_user_id,
        )
        workspace_definitions, project_definitions, owner_definitions = self._visibility_definitions()
        did_request = False
        async with self.tx() as conn:
            job = await self.repository.get_visible_workspace_job(
                workspace_id=ctx.workspace_id,
                job_id=job_id,
                actor_user_id=actor_user_id,
                accessible_project_ids=accessible_project_ids,
                workspace_definitions=workspace_definitions,
                project_definitions=project_definitions,
                owner_definitions=owner_definitions,
                conn=conn,
                for_update=True,
            )
            if job is None:
                _raise_job_not_found()
            definition = self.registry.require(
                job_type=job.job_type,
                job_type_version=job.job_type_version,
            )
            await self._authorize_cancellation(
                definition=definition,
                job=job,
                ctx=ctx,
                actor_user_id=actor_user_id,
            )
            if job.internal_status not in _TERMINAL_INTERNAL_STATUSES and job.cancel_requested_at is None:
                self._ensure_cancellable_phase(definition=definition, job=job)
                await self._record_cancellation_request(
                    job=job,
                    actor_user_id=actor_user_id,
                    reason=payload.reason,
                    conn=conn,
                )
                did_request = True

        if did_request:
            await self.publish_domain_event(
                name="job.cancellation_requested",
                payload={"job_id": str(job.id), "job_type": job.job_type},
                actor_user_id=actor_user_id,
            )
        return _to_workspace_job_out(job)

    async def _get_visible_job(
        self,
        *,
        workspace_id: UUID,
        job_id: UUID,
        actor_user_id: UUID,
    ) -> BackgroundJobRecord:
        accessible_project_ids = await self.project_repository.list_accessible_project_ids(
            workspace_id=workspace_id,
            user_id=actor_user_id,
        )
        workspace_definitions, project_definitions, owner_definitions = self._visibility_definitions()
        job = await self.repository.get_visible_workspace_job(
            workspace_id=workspace_id,
            job_id=job_id,
            actor_user_id=actor_user_id,
            accessible_project_ids=accessible_project_ids,
            workspace_definitions=workspace_definitions,
            project_definitions=project_definitions,
            owner_definitions=owner_definitions,
        )
        if job is None:
            _raise_job_not_found()
        return job

    async def _authorize_cancellation(
        self,
        *,
        definition: JobTypeDefinition,
        job: BackgroundJobRecord,
        ctx: WorkspaceContext,
        actor_user_id: UUID,
    ) -> None:
        if job.actor_user_id == actor_user_id:
            return
        requirement = definition.manage_permission
        if requirement is None:
            self._raise_not_cancellable()
        if requirement.scope == JobPermissionScope.WORKSPACE:
            await ensure_workspace_permission_granted(
                requirement.action,
                user_id=actor_user_id,
                ctx=ctx,
            )
            return
        if job.project_id is None:
            _raise_job_not_found()
        project_ctx = await get_project_context(project_id=job.project_id, user_id=actor_user_id)
        if project_ctx.workspace_id != ctx.workspace_id:
            _raise_job_not_found()
        await ensure_project_permission_granted(
            requirement.action,
            user_id=actor_user_id,
            ctx=project_ctx,
        )

    async def _record_cancellation_request(
        self,
        *,
        job: BackgroundJobRecord,
        actor_user_id: UUID,
        reason: str | None,
        conn: BaseDBAsyncClient,
    ) -> None:
        requested_at = await self.repository.get_database_time(conn=conn)
        await self.repository.update_job_fields(
            job=job,
            fields={
                "cancel_requested_at": requested_at,
                "cancel_requested_by_user_id": actor_user_id,
                "cancel_reason": reason,
            },
            conn=conn,
        )

    def _visibility_definitions(
        self,
    ) -> tuple[tuple[JobTypeDefinition, ...], tuple[JobTypeDefinition, ...], tuple[JobTypeDefinition, ...]]:
        return (
            self.registry.list_definitions(visibility=JobVisibility.WORKSPACE),
            self.registry.list_definitions(visibility=JobVisibility.PROJECT),
            self.registry.list_definitions(visibility=JobVisibility.OWNER_ONLY),
        )

    @staticmethod
    def _ensure_cancellable_phase(*, definition: JobTypeDefinition, job: BackgroundJobRecord) -> None:
        if job.phase not in definition.cancellable_phases:
            WorkspaceJobService._raise_not_cancellable()

    @staticmethod
    def _raise_not_cancellable() -> NoReturn:
        raise Conflict(
            message=t("errors", "BACKGROUND_JOB_NOT_CANCELLABLE"),
            error="BACKGROUND_JOB_NOT_CANCELLABLE",
        )


def _raise_job_not_found() -> NoReturn:
    raise NotFound(
        message=t("errors", "BACKGROUND_JOB_NOT_FOUND"),
        error="BACKGROUND_JOB_NOT_FOUND",
    )


def _to_public_status(internal_status: JobInternalStatus) -> JobPublicStatus:
    for public_status, internal_statuses in _PUBLIC_STATUS_INTERNALS.items():
        if internal_status in internal_statuses:
            return public_status
    raise ValueError(f"Unsupported background Job internal status: {internal_status}")


def _to_workspace_job_out(job: BackgroundJobRecord) -> WorkspaceJobOut:
    return WorkspaceJobOut(
        id=job.id,
        job_type=job.job_type,
        job_type_version=job.job_type_version,
        workload=job.workload_class,
        status=_to_public_status(job.internal_status),
        project_id=job.project_id,
        site_id=job.site_id,
        phase=job.phase,
        status_key=job.status_key,
        progress_completed=job.progress_completed,
        progress_total=job.progress_total,
        cancel_requested_at=job.cancel_requested_at,
        cancellation_acknowledged_at=job.cancellation_acknowledged_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        retry_of_job_id=job.retry_of_job_id,
        error_code=job.error_code,
        has_result=job.result_reference is not None,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


def _build_page(
    *,
    items: list[WorkspaceJobOut],
    total: int,
    params: PageParams,
) -> PageData[WorkspaceJobOut]:
    pages = ceil(total / params.size) if total else 0
    return PageData[WorkspaceJobOut](
        items=items,
        total=total,
        page=params.page,
        size=params.size,
        pages=pages,
        next=params.page + 1 if params.page < pages else None,
        prev=min(params.page - 1, pages) if pages > 0 and params.page > 1 else None,
    )
