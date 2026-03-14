from __future__ import annotations

from uuid import UUID

from apps.api.src.core.exceptions import NotFound
from apps.api.src.modules.workspaces.publish.schema import PublishExportContractOut
from apps.api.src.modules.workspaces.publish.storage import WorkspacePublishArtifactStorage


class WorkspacePublishPreviewService:
    def __init__(self, storage: WorkspacePublishArtifactStorage | None = None) -> None:
        self._storage = storage or WorkspacePublishArtifactStorage()

    async def build_preview_contract(self, *, workspace_id: UUID, site_id: UUID) -> PublishExportContractOut:
        try:
            return await self._storage.build_publish_contract(workspace_id=workspace_id, site_id=site_id)
        except NotFound as exc:
            raise NotFound(
                "Preview artifacts are required before preview contract can be read",
                error="PUBLISH_PREVIEW_ARTIFACTS_MISSING",
                meta=exc.meta,
            ) from exc
