from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from src.core.exceptions import NotFound
from src.core.i18n import t
from src.models.content.release import ContentReleaseRecord
from src.modules.workspaces.publish.service import WorkspacePublishService
from src.modules.workspaces.releases.repository import WorkspaceReleasesRepository
from src.modules.workspaces.releases.schema import ReleaseListOut, ReleaseOut, ReleasePublishOut, ReleaseRollbackOut


class WorkspaceReleasesService:
    def __init__(self) -> None:
        self.repo = WorkspaceReleasesRepository()
        self.publish_service = WorkspacePublishService()

    async def list_releases_out(self, *, workspace_id: UUID, site_id: UUID) -> ReleaseListOut:
        rows = await self.repo.list_releases(workspace_id=workspace_id, site_id=site_id)
        return ReleaseListOut(items=[self._to_out(row) for row in rows])

    async def get_release_out(self, *, workspace_id: UUID, site_id: UUID, release_id: UUID) -> ReleaseOut:
        row = await self.repo.get_release(workspace_id=workspace_id, site_id=site_id, release_id=release_id)
        return self._to_out(self._require_release(row))

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
        return ReleasePublishOut(
            release=self._to_out(release),
            graph_nodes=artifacts.graph_nodes,
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
        return ReleaseRollbackOut(
            release=self._to_out(activated),
            previous_active_release_id=previous_active_release_id,
        )

    @staticmethod
    def _require_release(release: ContentReleaseRecord | None) -> ContentReleaseRecord:
        if release is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="RELEASE_NOT_FOUND")
        return release

    @staticmethod
    def _to_out(release: ContentReleaseRecord) -> ReleaseOut:
        return ReleaseOut.model_validate(release, from_attributes=True)
