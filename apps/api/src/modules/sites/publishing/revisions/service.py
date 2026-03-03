from __future__ import annotations

"""
Publishing revisions service.
"""

from typing import Literal
from uuid import UUID

from apps.api.src.common.services.base import BaseService
from apps.api.src.core.exceptions import Conflict, NotFound
from apps.api.src.modules.sites.publishing.includes.service import PublishingIncludesService
from apps.api.src.modules.sites.repository import SitesRepository
from apps.api.src.modules.sites.schema import (
    SiteEntryRevisionOut,
    SiteEntryRollbackIn,
    SiteEntryRollbackOut,
    SitePageRevisionOut,
    SitePageRollbackIn,
    SitePageRollbackOut,
)


class PublishingRevisionsService(BaseService):
    def __init__(
        self,
        settings,
        *,
        repo: SitesRepository,
        includes: PublishingIncludesService,
    ) -> None:
        super().__init__(settings)
        self._repo = repo
        self._includes = includes

    async def rollback_page_revision(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: SitePageRollbackIn,
        actor_user_id: UUID | None,
    ) -> SitePageRollbackOut:
        if not self.settings.database.enabled:
            raise Conflict("Page revisions require database storage", error="PAGE_REVISION_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)

        from_rev, to_rev, rolled_back_at_ms = await self._repo.rollback_page_revision_pointer(
            site_id=site_id,
            page_id=page_id,
            target=payload.target,
            revision=payload.revision,
            updated_by_user_id=actor_user_id,
        )
        self.logger.info(
            "Rolled back page revision pointer",
            site_id=str(site_id),
            page_id=str(page_id),
            target=str(payload.target),
            from_revision=from_rev,
            to_revision=to_rev,
        )
        return SitePageRollbackOut(
            page_id=page_id,
            target=payload.target,
            from_revision=from_rev,
            to_revision=to_rev,
            rolled_back_at_ms=rolled_back_at_ms,
        )

    async def rollback_entry_revision(
        self,
        *,
        site_id: UUID,
        entry_id: UUID,
        payload: SiteEntryRollbackIn,
    ) -> SiteEntryRollbackOut:
        if not self.settings.database.enabled:
            raise Conflict("Entry revisions require database storage", error="ENTRY_REVISION_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)

        from_rev, to_rev, rolled_back_at_ms = await self._repo.rollback_entry_revision_pointer(
            site_id=site_id,
            entry_id=entry_id,
            target=payload.target,
            revision=payload.revision,
        )
        self.logger.info(
            "Rolled back entry revision pointer",
            site_id=str(site_id),
            entry_id=str(entry_id),
            target=str(payload.target),
            from_revision=from_rev,
            to_revision=to_rev,
        )
        return SiteEntryRollbackOut(
            entry_id=entry_id,
            target=payload.target,
            from_revision=from_rev,
            to_revision=to_rev,
            rolled_back_at_ms=rolled_back_at_ms,
        )

    async def get_page_revision(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        state: Literal["draft", "published"],
    ) -> SitePageRevisionOut:
        if not self.settings.database.enabled:
            raise Conflict("Page revisions require database storage", error="PAGE_REVISION_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)

        page = await self._repo.get_page_by_id(site_id=site_id, page_id=page_id)
        if page is None:
            raise NotFound("Page not found", error="PAGE_NOT_FOUND")

        rev = int(page.draft_rev or 0) if state == "draft" else int(page.published_rev or 0)
        if rev <= 0:
            raise NotFound("Revision not found", error="REVISION_NOT_FOUND")

        rec = await self._repo.get_page_revision(page_id=page_id, rev=rev)
        if rec is None:
            raise NotFound("Revision not found", error="REVISION_NOT_FOUND")

        doc = await self._includes.load_page_blueprint_from_revision(rec)
        if doc is None:
            raise NotFound("Revision document not found", error="REVISION_DOC_NOT_FOUND")

        created_at_ms = int(rec.created_at.timestamp() * 1000)
        return SitePageRevisionOut(
            page_id=UUID(str(page.id)),
            state=state,
            revision=rev,
            created_at_ms=created_at_ms,
            pageBlueprint=doc,
            meta=(rec.meta if isinstance(rec.meta, dict) else None),
            style_overrides=(rec.style_overrides if isinstance(rec.style_overrides, dict) else None),
            variant_id=(str(rec.variant_id) if rec.variant_id else None),
            deps=(rec.deps if isinstance(rec.deps, dict) else None),
        )

    async def get_entry_revision(
        self,
        *,
        site_id: UUID,
        entry_id: UUID,
        state: Literal["draft", "published"],
    ) -> SiteEntryRevisionOut:
        if not self.settings.database.enabled:
            raise Conflict("Entry revisions require database storage", error="ENTRY_REVISION_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)

        entry = await self._repo.get_entry_by_id(site_id=site_id, entry_id=entry_id)
        if entry is None:
            raise NotFound("Entry not found", error="ENTRY_NOT_FOUND")

        rev = int(entry.draft_rev or 0) if state == "draft" else int(entry.published_rev or 0)
        if rev <= 0:
            raise NotFound("Revision not found", error="REVISION_NOT_FOUND")

        rec = await self._repo.get_entry_revision(entry_id=entry_id, rev=rev)
        if rec is None:
            raise NotFound("Revision not found", error="REVISION_NOT_FOUND")

        doc = await self._includes.load_page_blueprint_from_revision(rec)
        data = rec.data if isinstance(rec.data, dict) else None
        created_at_ms = int(rec.created_at.timestamp() * 1000)
        return SiteEntryRevisionOut(
            entry_id=UUID(str(entry.id)),
            state=state,
            revision=rev,
            created_at_ms=created_at_ms,
            pageBlueprint=doc,
            data=data,
            meta=(rec.meta if isinstance(rec.meta, dict) else None),
            style_overrides=(rec.style_overrides if isinstance(rec.style_overrides, dict) else None),
            variant_id=(str(rec.variant_id) if rec.variant_id else None),
            deps=(rec.deps if isinstance(rec.deps, dict) else None),
        )
