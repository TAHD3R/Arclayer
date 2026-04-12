from __future__ import annotations

"""
Runtime repository.

Runtime payload is derived from settings and other stored entities.
"""

from uuid import UUID

from src.core.exceptions import NotFound
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.presentation_document import PresentationDocumentRecord
from src.models.content.route_binding import RouteBindingRecord
from src.models.content.seo_profile import SEOProfileRecord
from src.models.sites.site import SiteRecord
from src.modules.sites.shared.service import normalize_path


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

    async def get_content_entry_by_id(self, *, site_id: UUID, entry_id: UUID) -> ContentItemRecord | None:
        return await ContentItemRecord.filter(id=entry_id, site_id=site_id).prefetch_related("model_definition").first()

    async def get_content_page_entry_by_path(
        self,
        *,
        site_id: UUID,
        path: str,
    ) -> ContentItemRecord | None:
        pathname = normalize_path(path)
        route = (
            await RouteBindingRecord
            .filter(site_id=site_id, path=pathname, is_active=True)
            .order_by("created_at", "id")
            .first()
        )
        if route is None:
            return None
        return await (
            ContentItemRecord
            .filter(id=UUID(str(route.item_id)), site_id=site_id)
            .prefetch_related("model_definition")
            .first()
        )

    async def get_content_revision_by_number(self, *, entry_id: UUID, revision: int) -> ContentVersionRecord | None:
        return await ContentVersionRecord.get_or_none(item_id=entry_id, version=int(revision))

    async def list_content_presentations(self, *, version_id: UUID) -> list[PresentationDocumentRecord]:
        return list(await PresentationDocumentRecord.filter(version_id=version_id).order_by("kind", "id").all())

    async def get_content_seo_profile(self, *, version_id: UUID) -> SEOProfileRecord | None:
        return await SEOProfileRecord.get_or_none(version_id=version_id)
