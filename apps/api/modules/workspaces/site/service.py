from __future__ import annotations

from uuid import UUID

from apps.api.common.services.base import BaseService
from apps.api.modules.workspaces.models.workspace import Workspace
from apps.api.modules.workspaces.site.repository import WorkspaceSiteRepository


class WorkspaceSiteService(BaseService):
    def __init__(self, settings) -> None:
        super().__init__(settings)
        self.repo = WorkspaceSiteRepository()

    async def get_or_create_site_for_workspace(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID | None,
    ):
        """
        Resolve the single site for a workspace.

        This is an admin-facing helper used to build editor URLs; it is safe to
        create a default site if the workspace has none yet.
        """

        # Best-effort: if legacy data has multiple sites, keep deterministic selection
        # at the repository layer; DB uniqueness should prevent this going forward.
        existing = await self.repo.get_site_by_workspace_id(workspace_id=workspace_id)
        if existing is not None:
            return existing

        ws = await Workspace.get_or_none(id=workspace_id)
        if ws is not None:
            ws_name = ws.name.strip() or "Workspace"
        else:
            ws_name = "Workspace"

        # Keep defaults conservative and aligned with current SiteRecord defaults.
        return await self.repo.create_site(
            workspace_id=workspace_id,
            slug="default",
            name=f"{ws_name} Site",
            default_locale="zh-CN",
            fallback_locale="en-US",
            primary_host=None,
            created_by_user_id=actor_user_id,
        )
