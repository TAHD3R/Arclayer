from __future__ import annotations

"""
Runtime repository.

Runtime payload is derived from settings and other stored entities.
"""

from uuid import UUID

from apps.api.src.core.exceptions import NotFound
from apps.api.src.models.content.content import ContentEntryRecord, ContentRevisionRecord
from apps.api.src.models.sites.site import SiteRecord
from apps.api.src.modules.sites.shared.service import normalize_path


class RuntimeRepositoryMixin:
    async def get_site_by_id(self, *, site_id: UUID) -> SiteRecord:
        site = await SiteRecord.get_or_none(id=site_id)
        if site is None:
            raise NotFound("Site not found", error="SITE_NOT_FOUND")
        return site

    async def get_site_by_workspace_slug(self, *, workspace_slug: str) -> SiteRecord | None:
        raw = (workspace_slug or "").strip().lower()
        if not raw:
            return None

        # Single-site workspace model: deterministic select (should be at most 1).
        return (
            await SiteRecord
            .filter(
                workspace__slug=raw,
                workspace__is_active=True,
                is_active=True,
            )
            .order_by("created_at", "id")
            .first()
        )

    async def get_site_by_custom_hostname(self, *, hostname: str) -> SiteRecord | None:
        """
        Resolve a site by a custom hostname binding.

        Notes:
        - Only verified + active domain records are eligible for routing.
        - The site and its workspace must be active as well.
        """
        raw = (hostname or "").strip().lower().rstrip(".")
        if not raw:
            return None

        return (
            await SiteRecord
            .filter(
                domains__hostname=raw,
                domains__is_verified=True,
                domains__is_active=True,
                workspace__is_active=True,
                is_active=True,
            )
            .order_by("created_at", "id")
            .first()
        )

    async def get_content_entry_by_id(self, *, site_id: UUID, entry_id: UUID) -> ContentEntryRecord | None:
        return await ContentEntryRecord.get_or_none(id=entry_id, site_id=site_id)

    async def get_content_page_entry_by_path(
        self,
        *,
        site_id: UUID,
        path: str,
    ) -> ContentEntryRecord | None:
        pathname = normalize_path(path)
        return await ContentEntryRecord.get_or_none(site_id=site_id, type__kind="page", path=pathname).prefetch_related(
            "type"
        )

    async def get_content_revision_by_number(self, *, entry_id: UUID, revision: int) -> ContentRevisionRecord | None:
        return await ContentRevisionRecord.get_or_none(entry_id=entry_id, revision=int(revision))
