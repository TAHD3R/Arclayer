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
from src.models.content.published_graph import PublishedGraphRecord
from src.models.content.release import ContentReleaseRecord
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

    async def get_site_by_runtime_id(self, *, runtime_id: UUID) -> SiteRecord:
        site = await SiteRecord.get_or_none(runtime_id=runtime_id)
        if site is None:
            raise NotFound("Site not found", error="SITE_NOT_FOUND")
        return site

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

    async def get_content_route_binding_by_item_id(
        self,
        *,
        site_id: UUID,
        item_id: UUID,
    ) -> RouteBindingRecord | None:
        return (
            await RouteBindingRecord
            .filter(site_id=site_id, item_id=item_id, is_active=True)
            .order_by("created_at", "id")
            .first()
        )

    async def list_content_route_bindings(self, *, site_id: UUID) -> list[RouteBindingRecord]:
        return list(
            await RouteBindingRecord
            .filter(site_id=site_id, is_active=True)
            .prefetch_related("item__model_definition")
            .all()
        )

    async def list_content_entries_by_model_key(self, *, site_id: UUID, model_key: str) -> list[ContentItemRecord]:
        return list(
            await ContentItemRecord
            .filter(site_id=site_id, model_definition__key=model_key)
            .prefetch_related("model_definition")
            .all()
        )

    async def get_active_release(self, *, site_id: UUID) -> ContentReleaseRecord | None:
        return (
            await ContentReleaseRecord
            .filter(site_id=site_id, is_active=True)
            .order_by("-activated_at", "-release_number", "-id")
            .first()
        )

    async def list_active_release_route_nodes(self, *, site_id: UUID) -> list[PublishedGraphRecord]:
        active_release = await self.get_active_release(site_id=site_id)
        if active_release is None:
            return []
        return list(
            await PublishedGraphRecord
            .filter(release_id=active_release.id, site_id=site_id, route_contract__not_isnull=True)
            .prefetch_related("item__model_definition", "version")
            .all()
        )

    async def get_active_release_node_by_item_id(
        self,
        *,
        site_id: UUID,
        item_id: UUID,
    ) -> PublishedGraphRecord | None:
        active_release = await self.get_active_release(site_id=site_id)
        if active_release is None:
            return None
        return (
            await PublishedGraphRecord
            .filter(
                release_id=active_release.id,
                site_id=site_id,
                item_id=item_id,
                route_contract__not_isnull=True,
            )
            .prefetch_related("item__model_definition", "version")
            .first()
        )

    async def get_release_node_by_item_id(
        self,
        *,
        site_id: UUID,
        release_id: UUID,
        item_id: UUID,
    ) -> PublishedGraphRecord | None:
        return (
            await PublishedGraphRecord
            .filter(release_id=release_id, site_id=site_id, item_id=item_id)
            .prefetch_related("item__model_definition", "version")
            .first()
        )

    async def list_active_release_nodes_by_model_key(
        self,
        *,
        site_id: UUID,
        model_key: str,
    ) -> list[PublishedGraphRecord]:
        active_release = await self.get_active_release(site_id=site_id)
        if active_release is None:
            return []
        return list(
            await PublishedGraphRecord
            .filter(
                release_id=active_release.id,
                site_id=site_id,
                item__model_definition__key=model_key,
            )
            .prefetch_related("item__model_definition", "version")
            .all()
        )

    async def get_content_revision_by_number(self, *, entry_id: UUID, revision: int) -> ContentVersionRecord | None:
        return await ContentVersionRecord.get_or_none(item_id=entry_id, version=int(revision))

    async def list_content_presentations(self, *, version_id: UUID) -> list[PresentationDocumentRecord]:
        return list(await PresentationDocumentRecord.filter(version_id=version_id).order_by("kind", "id").all())

    async def get_content_seo_profile(self, *, version_id: UUID) -> SEOProfileRecord | None:
        return await SEOProfileRecord.get_or_none(version_id=version_id)
