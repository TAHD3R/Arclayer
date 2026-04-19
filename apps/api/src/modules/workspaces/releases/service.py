from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from src.core.exceptions import NotFound
from src.core.i18n import t
from src.core.logging import get_logger
from src.models.content.release import ContentReleaseRecord
from src.modules.workspaces.publish.service import WorkspacePublishService
from src.modules.workspaces.releases.repository import WorkspaceReleasesRepository
from src.modules.workspaces.releases.schema import (
    ReleaseDryRunOut,
    ReleaseLineageOut,
    ReleaseListOut,
    ReleaseOut,
    ReleasePublishOut,
    ReleaseRollbackOut,
)

logger = get_logger(__name__)


class WorkspaceReleasesService:
    def __init__(self) -> None:
        self.repo = WorkspaceReleasesRepository()
        self.publish_service = WorkspacePublishService()

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
    ) -> ReleasePublishOut:
        release, artifacts = await self.publish_service.publish_release(
            workspace_id=workspace_id,
            site_id=site_id,
            actor_user_id=actor_user_id,
        )
        logger.info(
            "Workspace release published",
            actor_user_id=str(actor_user_id),
            graph_nodes=artifacts.graph_nodes,
            release_id=str(release.id),
            release_number=release.release_number,
            site_id=str(site_id),
            workspace_id=str(workspace_id),
        )
        return ReleasePublishOut(
            release=await self._to_out(release),
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
    ) -> ReleaseRollbackOut:
        row = await self.repo.get_release(workspace_id=workspace_id, site_id=site_id, release_id=release_id)
        release = self._require_release(row)
        activated, previous_active_release_id = await self.repo.activate_release(
            workspace_id=workspace_id,
            site_id=site_id,
            release=release,
            activated_at=datetime.now(tz=UTC),
        )
        logger.info(
            "Workspace release rolled back",
            previous_active_release_id=str(previous_active_release_id)
            if previous_active_release_id is not None
            else None,
            release_id=str(activated.id),
            release_number=activated.release_number,
            site_id=str(site_id),
            workspace_id=str(workspace_id),
        )
        return ReleaseRollbackOut(
            release=await self._to_out(activated),
            previous_active_release_id=previous_active_release_id,
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
            created_by_user_id=release.created_by_user_id,
            activated_at=release.activated_at,
            selection_count=release.selection_count,
            lineage=ReleaseLineageOut(
                parent_release_id=release.lineage_parent_release_id,
                parent_release_number=lineage_parent_number,
            ),
            created_at=release.created_at,
            updated_at=release.updated_at,
        )
