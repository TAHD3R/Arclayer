from __future__ import annotations

from uuid import UUID

from src.common.services.base import BaseService
from src.models.workspaces.workspace import Workspace
from src.modules.workspaces.site.repository import WorkspaceSiteRepository


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
            # Best-effort repair: keep site.slug aligned with workspaceSlug.
            ws = await Workspace.get_or_none(id=workspace_id)
            if ws is not None:
                desired = (ws.slug or "").strip()
                if desired and str(existing.slug) != desired:
                    existing.slug = desired[:64]
                    await existing.save(update_fields=["slug", "updated_at"])
            return existing

        ws = await Workspace.get_or_none(id=workspace_id)
        if ws is not None:
            ws_name = ws.name.strip() or "Workspace"
            ws_slug = ws.slug.strip() or "default"
        else:
            ws_name = "Workspace"
            ws_slug = "default"

        # Keep defaults conservative and aligned with current SiteRecord defaults.
        return await self.repo.create_site(
            workspace_id=workspace_id,
            # Keep site.slug aligned with workspaceSlug for the single-site workspace model.
            slug=ws_slug[:64],
            name=f"{ws_name} Site",
            default_locale="zh-CN",
            fallback_locale="en-US",
            created_by_user_id=actor_user_id,
        )
