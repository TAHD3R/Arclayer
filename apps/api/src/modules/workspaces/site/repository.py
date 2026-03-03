from __future__ import annotations

from uuid import UUID

from tortoise.transactions import in_transaction

from apps.api.src.common.repositories.base import BaseRepository
from apps.api.src.core.exceptions import Conflict
from apps.api.src.models.sites.site import SiteRecord


class WorkspaceSiteRepository(BaseRepository):
    async def get_site_by_workspace_id(self, *, workspace_id: UUID) -> SiteRecord | None:
        # Deterministic: keep the oldest site if legacy data has multiple rows.
        return await SiteRecord.filter(workspace_id=workspace_id).order_by("created_at", "id").first()

    async def count_sites_by_workspace_id(self, *, workspace_id: UUID) -> int:
        return int(await SiteRecord.filter(workspace_id=workspace_id).count())

    async def ensure_single_site_or_raise(self, *, workspace_id: UUID) -> None:
        count = await self.count_sites_by_workspace_id(workspace_id=workspace_id)
        if count <= 1:
            return
        raise Conflict(
            "Workspace site constraint violated",
            error="WORKSPACE_SITE_CONSTRAINT_VIOLATED",
            meta={"workspaceId": str(workspace_id), "count": count},
        )

    async def create_site(
        self,
        *,
        workspace_id: UUID,
        slug: str,
        name: str,
        default_locale: str,
        fallback_locale: str,
        created_by_user_id: UUID | None,
    ) -> SiteRecord:
        # Use a transaction so callers can safely chain "get or create".
        async with in_transaction() as conn:
            rec = await SiteRecord.filter(workspace_id=workspace_id).using_db(conn).order_by("created_at", "id").first()
            if rec is not None:
                return rec

            return await SiteRecord.create(
                workspace_id=workspace_id,
                slug=slug,
                name=name,
                default_locale=default_locale,
                fallback_locale=fallback_locale,
                is_active=True,
                created_by_user_id=created_by_user_id,
                using_db=conn,
            )
