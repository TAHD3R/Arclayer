from __future__ import annotations

from uuid import UUID

from tortoise.transactions import in_transaction

from src.common.repositories import BaseRepository
from src.models.sites.site import SiteRecord


class ProjectRuntimeSiteRepository(BaseRepository):
    async def get_site_by_runtime_id(self, *, runtime_id: UUID) -> SiteRecord | None:
        return await SiteRecord.filter(runtime_id=runtime_id).order_by("created_at", "id").first()

    async def create_site(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID,
        slug: str,
        name: str,
        default_locale: str,
        fallback_locale: str,
        created_by_user_id: UUID | None,
    ) -> SiteRecord:
        # Use a transaction so callers can safely chain "get or create".
        async with in_transaction() as conn:
            rec = await SiteRecord.filter(runtime_id=runtime_id).using_db(conn).order_by("created_at", "id").first()
            if rec is not None:
                return rec

            return await SiteRecord.create(
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                slug=slug,
                name=name,
                default_locale=default_locale,
                fallback_locale=fallback_locale,
                is_active=True,
                created_by_user_id=created_by_user_id,
                using_db=conn,
            )
