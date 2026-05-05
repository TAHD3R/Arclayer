from __future__ import annotations

from uuid import UUID

from src.core.exceptions import NotFound
from src.core.services import BaseService
from src.modules.projects.publish.schema import PublishExportContractOut
from src.modules.projects.publish.storage import ProjectPublishArtifactStorage
from src.modules.tenancy.schema import TenantContext


class ProjectPublishPreviewService(BaseService):
    def __init__(
        self,
        tenant_context: TenantContext,
        storage: ProjectPublishArtifactStorage | None = None,
    ) -> None:
        super().__init__()
        self._storage = storage or ProjectPublishArtifactStorage(tenant_context)

    async def build_preview_contract(self, *, workspace_id: UUID, site_id: UUID) -> PublishExportContractOut:
        try:
            return await self._storage.build_publish_contract(workspace_id=workspace_id, site_id=site_id, preview=True)
        except NotFound as exc:
            raise NotFound(
                "Preview artifacts are required before preview contract can be read",
                error="PUBLISH_PREVIEW_ARTIFACTS_MISSING",
                meta=exc.meta,
            ) from exc
