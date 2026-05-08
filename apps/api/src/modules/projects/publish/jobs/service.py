from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.i18n import t
from src.core.logging import get_logger
from src.core.services import BaseService
from src.models.content._enums import ContentReleaseStatus, PublishJobStatus, PublishJobType
from src.models.content.publish_job import PublishJobRecord
from src.models.content.release import ContentReleaseRecord
from src.models.sites.site import SiteRecord
from src.models.system.notification import NotificationCategory
from src.models.tenancy.workspace_tenant import WorkspaceTenantRecord
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.organization.workspaces.repository import OrganizationWorkspaceRepository
from src.modules.projects.publish.schema import PublishArtifactsOut
from src.modules.projects.publish.service import ProjectPublishService
from src.modules.projects.releases.repository import ProjectReleasesRepository
from src.modules.system.admin.notifications.catalog import create_notification_record
from src.modules.tenancy.database import TenantDatabaseRouter
from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode, TenantScope

logger = get_logger(__name__)

ProjectReleasesRepositoryFactory = Callable[[TenantContext], ProjectReleasesRepository]
ProjectPublishServiceFactory = Callable[[TenantContext], ProjectPublishService]


def default_releases_repository_factory(tenant_context: TenantContext) -> ProjectReleasesRepository:
    return ProjectReleasesRepository(tenant_context)


def default_publish_service_factory(tenant_context: TenantContext) -> ProjectPublishService:
    return ProjectPublishService(tenant_context)


class PublishJobService(BaseService):
    def __init__(
        self,
        tenant_context: TenantContext | None = None,
        *,
        releases_repository_factory: ProjectReleasesRepositoryFactory = default_releases_repository_factory,
        publish_service_factory: ProjectPublishServiceFactory = default_publish_service_factory,
        organization_workspace_repo: OrganizationWorkspaceRepository | None = None,
    ) -> None:
        super().__init__()
        self.tenant_context = tenant_context
        self.tenant_db = TenantDatabaseRouter(tenant_context) if tenant_context is not None else None
        self.publish_service = publish_service_factory(tenant_context) if tenant_context is not None else None
        self.releases_repo = releases_repository_factory(tenant_context) if tenant_context is not None else None
        self.releases_repository_factory = releases_repository_factory
        self.publish_service_factory = publish_service_factory
        self.organization_workspace_repo = organization_workspace_repo or OrganizationWorkspaceRepository()

    async def create_scheduled_publish(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        actor_user_id: UUID | None,
        scheduled_at: datetime,
    ) -> tuple[ContentReleaseRecord, PublishJobRecord, PublishArtifactsOut]:
        publish_service = self._require_publish_service()
        release, artifacts = await publish_service.create_scheduled_release(
            workspace_id=workspace_id,
            site_id=site_id,
            actor_user_id=actor_user_id,
            scheduled_at=scheduled_at,
        )
        job = await PublishJobRecord.create(
            workspace_id=workspace_id,
            site_id=site_id,
            project_id=await self._project_id_for_site(site_id=site_id),
            release_id=release.id,
            job_type=PublishJobType.SCHEDULED_PUBLISH,
            status=PublishJobStatus.PENDING,
            scheduled_at=scheduled_at,
            created_by_user_id=actor_user_id,
        )
        return release, job, artifacts

    async def cancel_scheduled_publish(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        release_id: UUID,
        actor_user_id: UUID,
    ) -> PublishJobRecord:
        tenant_db = self._require_tenant_db()
        releases_repo = self._require_releases_repo()
        async with tenant_db.connection() as conn:
            release = await releases_repo.get_release_in_connection(
                release_id=release_id,
                workspace_id=workspace_id,
                site_id=site_id,
                conn=conn,
            )
        if release is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="RELEASE_NOT_FOUND")
        if release.status != ContentReleaseStatus.SCHEDULED:
            raise Conflict("Release is not scheduled", error="RELEASE_NOT_SCHEDULED")

        job = await PublishJobRecord.get_or_none(
            release_id=release_id,
            workspace_id=workspace_id,
            site_id=site_id,
            status=PublishJobStatus.PENDING,
        )
        if job is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="PUBLISH_JOB_NOT_FOUND")

        now = datetime.now(tz=UTC)
        async with tenant_db.connection() as conn:
            release.status = ContentReleaseStatus.CANCELLED
            release.is_active = False
            await release.save(update_fields=["status", "is_active", "updated_at"], using_db=conn)

        job.status = PublishJobStatus.CANCELLED
        job.completed_at = now
        cast(Any, job).error_message = None
        await job.save(update_fields=["status", "completed_at", "error_message", "updated_at"])
        logger.info(
            "Scheduled publish cancelled",
            actor_user_id=str(actor_user_id),
            job_id=str(job.id),
            release_id=str(release_id),
            site_id=str(site_id),
            workspace_id=str(workspace_id),
        )
        return job

    async def execute_scheduled_release(self, *, release_id: UUID) -> PublishJobRecord:
        job = (
            await PublishJobRecord
            .filter(
                release_id=release_id,
                status__in=[PublishJobStatus.PENDING, PublishJobStatus.FAILED],
            )
            .order_by("-created_at")
            .first()
        )
        if job is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="PUBLISH_JOB_NOT_FOUND")

        tenant_context = await self._tenant_context_for_workspace(workspace_id=job.workspace_id)
        tenant_db = TenantDatabaseRouter(tenant_context)
        releases_repo = self.releases_repository_factory(tenant_context)
        async with tenant_db.connection() as conn:
            release = await releases_repo.get_release_in_connection(release_id=release_id, conn=conn)
        if release is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="RELEASE_NOT_FOUND")

        now = datetime.now(tz=UTC)
        if release.status != ContentReleaseStatus.SCHEDULED:
            job.status = PublishJobStatus.CANCELLED
            job.completed_at = now
            cast(Any, job).error_message = "Release is no longer scheduled."
            await job.save(update_fields=["status", "completed_at", "error_message", "updated_at"])
            return job

        job.status = PublishJobStatus.RUNNING
        job.started_at = now
        job.completed_at = None
        cast(Any, job).error_message = None
        await job.save(update_fields=["status", "started_at", "completed_at", "error_message", "updated_at"])
        try:
            await self.publish_service_factory(tenant_context).activate_scheduled_release(
                workspace_id=release.workspace_id,
                site_id=release.site_id,
                release=release,
                activated_at=now,
            )
        except Exception as exc:
            job.status = PublishJobStatus.FAILED
            job.completed_at = datetime.now(tz=UTC)
            cast(Any, job).error_message = str(exc)[:4000]
            async with self.tx() as conn:
                await job.save(update_fields=["status", "completed_at", "error_message", "updated_at"], using_db=conn)
                await self._write_publish_job_activity_event(
                    conn=conn,
                    event_name="deployment.failed",
                    actor_user_id=release.created_by_user_id,
                    job=job,
                    tenant_context=tenant_context,
                    properties={
                        "failure_kind": type(exc).__name__,
                        "job_type": str(job.job_type),
                        "project_id": str(job.project_id) if job.project_id is not None else None,
                        "release_id": str(release.id),
                        "release_number": release.release_number,
                        "site_id": str(release.site_id),
                        "status": str(job.status),
                    },
                )
            await self._notify_publish_result(job=job, release=release, success=False)
            raise

        job.status = PublishJobStatus.COMPLETED
        job.completed_at = datetime.now(tz=UTC)
        await job.save(update_fields=["status", "completed_at", "updated_at"])
        await self._notify_publish_result(job=job, release=release, success=True)
        return job

    async def retry_publish_job(self, *, job_id: UUID) -> PublishJobRecord:
        job = await PublishJobRecord.get_or_none(id=job_id)
        if job is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="PUBLISH_JOB_NOT_FOUND")
        if job.status != PublishJobStatus.FAILED or job.release_id is None:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="PUBLISH_JOB_RETRY_UNAVAILABLE")
        return await self.execute_scheduled_release(release_id=job.release_id)

    def _require_tenant_db(self) -> TenantDatabaseRouter:
        if self.tenant_db is None:
            raise RuntimeError("PROJECT_TENANT_CONTEXT_REQUIRED")
        return self.tenant_db

    def _require_publish_service(self) -> ProjectPublishService:
        if self.publish_service is None:
            raise RuntimeError("PROJECT_TENANT_CONTEXT_REQUIRED")
        return self.publish_service

    def _require_releases_repo(self) -> ProjectReleasesRepository:
        if self.releases_repo is None:
            raise RuntimeError("PROJECT_TENANT_CONTEXT_REQUIRED")
        return self.releases_repo

    async def _tenant_context_for_workspace(self, *, workspace_id: UUID) -> TenantContext:
        record = await WorkspaceTenantRecord.get_or_none(workspace_id=workspace_id)
        workspace = await self.organization_workspace_repo.get_by_id(workspace_id=workspace_id)
        if record is None or workspace is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="WORKSPACE_TENANT_NOT_FOUND")
        return TenantContext(
            identity=TenantIdentity(
                organization_id=workspace.organization_id,
                workspace_id=workspace_id,
                project_id=None,
                runtime_id=None,
                site_id=None,
                schema_name=record.schema_name,
                isolation_mode=TenantIsolationMode(str(record.isolation_mode)),
            ),
            scope=TenantScope.JOB,
        )

    async def _write_publish_job_activity_event(
        self,
        *,
        conn: BaseDBAsyncClient,
        event_name: str,
        actor_user_id: UUID | None,
        job: PublishJobRecord,
        tenant_context: TenantContext,
        properties: JsonObject,
    ) -> None:
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=event_name,
                actor_user_id=actor_user_id,
                organization_id=tenant_context.organization_id,
                workspace_id=job.workspace_id,
                entity_type="deployment",
                entity_id=job.id,
                source="job",
                properties=properties,
            ),
            conn=conn,
        )

    @staticmethod
    async def _project_id_for_site(*, site_id: UUID) -> UUID | None:
        site = await SiteRecord.get_or_none(id=site_id)
        return site.project_id if site is not None else None

    async def _notify_publish_result(
        self,
        *,
        job: PublishJobRecord,
        release: ContentReleaseRecord,
        success: bool,
    ) -> None:
        if release.created_by_user_id is None:
            return
        title = "Scheduled release published" if success else "Scheduled release failed"
        body = (
            f"Release #{release.release_number} is now active."
            if success
            else f"Release #{release.release_number} failed: {job.error_message or 'Unknown error'}"
        )
        target_to = "/content/releases"
        await create_notification_record(
            settings=self.settings,
            workspace_id=release.workspace_id,
            recipient_user_id=release.created_by_user_id,
            actor_user_id=None,
            category=NotificationCategory.TASK,
            title=title,
            body=body[:512],
            target_to=target_to,
            target_meta={"releaseId": str(release.id), "jobId": str(job.id)},
            event_name="project.release.scheduled_publish.completed"
            if success
            else "project.release.scheduled_publish.failed",
            dedupe_key=f"scheduled-publish:{job.id}",
        )
