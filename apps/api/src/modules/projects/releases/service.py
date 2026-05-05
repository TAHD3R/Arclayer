from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.core.exceptions import NotFound
from src.core.i18n import t
from src.core.logging import get_logger
from src.core.services import BaseService
from src.models.content._enums import ContentReleaseStatus
from src.models.content.release import ContentReleaseRecord
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.projects.deployments.service import ProjectDeploymentsService
from src.modules.projects.publish.jobs.service import PublishJobService
from src.modules.projects.publish.schema import PublishArtifactsOut
from src.modules.projects.publish.service import ProjectPublishService
from src.modules.projects.releases.repository import ProjectReleasesRepository
from src.modules.projects.releases.schema import (
    ReleaseCancelScheduledOut,
    ReleaseDryRunOut,
    ReleaseLineageOut,
    ReleaseListOut,
    ReleaseOut,
    ReleasePublishOut,
    ReleaseRollbackOut,
)
from src.modules.tenancy.schema import TenantContext

logger = get_logger(__name__)


class ProjectReleasesService(BaseService):
    def __init__(self, tenant_context: TenantContext) -> None:
        super().__init__()
        self._tenant_context = tenant_context
        self.repo = ProjectReleasesRepository(tenant_context)
        self.publish_service = ProjectPublishService(tenant_context)
        self.publish_job_service = PublishJobService(tenant_context)
        self.deployments_service = ProjectDeploymentsService(tenant_context)

    async def list_releases_out(self, *, workspace_id: UUID, site_id: UUID) -> ReleaseListOut:
        rows = await self.repo.list_releases(workspace_id=workspace_id, site_id=site_id)
        return ReleaseListOut(items=[await self._to_out(row) for row in rows])

    async def get_release_out(self, *, workspace_id: UUID, site_id: UUID, release_id: UUID) -> ReleaseOut:
        row = await self.repo.get_release(workspace_id=workspace_id, site_id=site_id, release_id=release_id)
        return await self._to_out(self._require_release(row))

    async def get_release_dry_run_out(self, *, workspace_id: UUID, site_id: UUID) -> ReleaseDryRunOut:
        impact = await self.publish_service.preview_impact(workspace_id=workspace_id, site_id=site_id)
        return ReleaseDryRunOut(readiness_summary=impact.readiness_summary, impact=impact)

    async def publish_release_out(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        actor_user_id: UUID,
        scheduled_at: datetime | None = None,
    ) -> ReleasePublishOut:
        if scheduled_at is not None:
            now = datetime.now(tz=UTC)
            normalized_scheduled_at = scheduled_at if scheduled_at.tzinfo else scheduled_at.replace(tzinfo=UTC)
            if normalized_scheduled_at <= now:
                from src.core.exceptions import BadRequest

                raise BadRequest(
                    message=t("errors", "BAD_REQUEST"),
                    error="SCHEDULED_PUBLISH_MUST_BE_FUTURE",
                )
            release, job, artifacts = await self.publish_job_service.create_scheduled_publish(
                workspace_id=workspace_id,
                site_id=site_id,
                actor_user_id=actor_user_id,
                scheduled_at=normalized_scheduled_at,
            )
            logger.info(
                "Project release scheduled",
                actor_user_id=str(actor_user_id),
                job_id=str(job.id),
                release_id=str(release.id),
                release_number=release.release_number,
                scheduled_at=normalized_scheduled_at.isoformat(),
                site_id=str(site_id),
                workspace_id=str(workspace_id),
            )
            from src.modules.system.jobs.schema import PublishJobOut

            return ReleasePublishOut(
                release=await self._to_out(release),
                job=PublishJobOut.model_validate(job, from_attributes=True),
                graph_nodes=artifacts.graph_nodes,
                selection_count=artifacts.selection_count,
                impact=artifacts.impact,
            )

        release, artifacts = await self.publish_service.publish_release(
            workspace_id=workspace_id,
            site_id=site_id,
            actor_user_id=actor_user_id,
            after_release_created=lambda release, artifacts, conn: self._write_published_activity_event(
                release=release,
                artifacts=artifacts,
                actor_user_id=actor_user_id,
                conn=conn,
            ),
        )
        logger.info(
            "Project release published",
            actor_user_id=str(actor_user_id),
            graph_nodes=artifacts.graph_nodes,
            release_id=str(release.id),
            release_number=release.release_number,
            site_id=str(site_id),
            workspace_id=str(workspace_id),
        )
        await self.deployments_service.record_release_publication(
            site_id=site_id,
            release_id=release.id,
            actor_user_id=actor_user_id,
        )
        return ReleasePublishOut(
            release=await self._to_out(release),
            job=None,
            graph_nodes=artifacts.graph_nodes,
            selection_count=artifacts.selection_count,
            impact=artifacts.impact,
        )

    async def rollback_release_out(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        release_id: UUID,
        actor_user_id: UUID,
    ) -> ReleaseRollbackOut:
        row = await self.repo.get_release(workspace_id=workspace_id, site_id=site_id, release_id=release_id)
        release = self._require_release(row)
        async with self.repo.connection() as conn:
            activated, previous_active_release_id = await self.repo.activate_release(
                workspace_id=workspace_id,
                site_id=site_id,
                release=release,
                activated_at=datetime.now(tz=UTC),
                conn=conn,
            )
            await self._write_release_activity_event(
                conn=conn,
                event_name="release.rolled_back",
                actor_user_id=actor_user_id,
                release=activated,
                previous_active_release_id=previous_active_release_id,
                properties={
                    "outcome": "rolled_back",
                    "previous_active_release_id": (
                        str(previous_active_release_id) if previous_active_release_id is not None else None
                    ),
                    "project_id": str(self._tenant_context.project_id) if self._tenant_context.project_id else None,
                    "release_number": activated.release_number,
                    "site_id": str(site_id),
                },
            )
        logger.info(
            "Project release rolled back",
            previous_active_release_id=str(previous_active_release_id)
            if previous_active_release_id is not None
            else None,
            release_id=str(activated.id),
            release_number=activated.release_number,
            site_id=str(site_id),
            workspace_id=str(workspace_id),
        )
        await self.deployments_service.record_release_rollback(
            site_id=site_id,
            release_id=activated.id,
            actor_user_id=actor_user_id,
        )
        return ReleaseRollbackOut(
            release=await self._to_out(activated),
            previous_active_release_id=previous_active_release_id,
        )

    async def _write_published_activity_event(
        self,
        *,
        release: ContentReleaseRecord,
        artifacts: PublishArtifactsOut,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._write_release_activity_event(
            conn=conn,
            event_name="release.published",
            actor_user_id=actor_user_id,
            release=release,
            previous_active_release_id=release.lineage_parent_release_id,
            properties={
                "graph_nodes": artifacts.graph_nodes,
                "outcome": "published",
                "previous_active_release_id": (
                    str(release.lineage_parent_release_id) if release.lineage_parent_release_id is not None else None
                ),
                "project_id": str(self._tenant_context.project_id) if self._tenant_context.project_id else None,
                "release_number": release.release_number,
                "selection_count": artifacts.selection_count,
                "site_id": str(release.site_id),
            },
        )

    async def _write_release_activity_event(
        self,
        *,
        conn: BaseDBAsyncClient,
        event_name: str,
        actor_user_id: UUID,
        release: ContentReleaseRecord,
        previous_active_release_id: UUID | None,
        properties: JsonObject,
    ) -> None:
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=event_name,
                actor_user_id=actor_user_id,
                organization_id=self._tenant_context.organization_id,
                workspace_id=release.workspace_id,
                entity_type="release",
                entity_id=release.id,
                source="api",
                properties={
                    **properties,
                    "previous_active_release_id": (
                        str(previous_active_release_id) if previous_active_release_id is not None else None
                    ),
                    "status": str(release.status),
                },
            ),
            conn=conn,
        )

    async def cancel_scheduled_publish_out(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        release_id: UUID,
        actor_user_id: UUID,
    ) -> ReleaseCancelScheduledOut:
        job = await self.publish_job_service.cancel_scheduled_publish(
            workspace_id=workspace_id,
            site_id=site_id,
            release_id=release_id,
            actor_user_id=actor_user_id,
        )
        release = self._require_release(
            await self.repo.get_release(workspace_id=workspace_id, site_id=site_id, release_id=release_id)
        )
        from src.modules.system.jobs.schema import PublishJobOut

        return ReleaseCancelScheduledOut(
            release=await self._to_out(release),
            job=PublishJobOut.model_validate(job, from_attributes=True),
        )

    @staticmethod
    def _require_release(release: ContentReleaseRecord | None) -> ContentReleaseRecord:
        if release is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="RELEASE_NOT_FOUND")
        return release

    async def _to_out(self, release: ContentReleaseRecord) -> ReleaseOut:
        lineage_parent_number: int | None = None
        if release.lineage_parent_release_id is not None:
            parent = await self.repo.get_release(
                workspace_id=release.workspace_id,
                site_id=release.site_id,
                release_id=release.lineage_parent_release_id,
            )
            lineage_parent_number = parent.release_number if parent is not None else None
        return ReleaseOut(
            id=release.id,
            workspace_id=release.workspace_id,
            site_id=release.site_id,
            release_number=release.release_number,
            is_active=release.is_active,
            status=ContentReleaseStatus(str(release.status)),
            created_by_user_id=release.created_by_user_id,
            activated_at=release.activated_at,
            scheduled_at=release.scheduled_at,
            selection_count=release.selection_count,
            lineage=ReleaseLineageOut(
                parent_release_id=release.lineage_parent_release_id,
                parent_release_number=lineage_parent_number,
            ),
            created_at=release.created_at,
            updated_at=release.updated_at,
        )
