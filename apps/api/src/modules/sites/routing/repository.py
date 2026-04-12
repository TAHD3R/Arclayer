from __future__ import annotations

from uuid import UUID

from src.common.repositories import BaseRepository
from src.models.content.content_item import ContentItemRecord
from src.models.content.route_binding import RouteBindingRecord
from src.modules.sites.shared.service import normalize_path


class SiteRoutingRepository(BaseRepository):
    async def list_public_sitemap_paths(self, *, site_id: UUID) -> list[str]:
        item_ids = await ContentItemRecord.filter(
            site_id=site_id,
            visibility="public",
            published_version__not_isnull=True,
        ).values_list("id", flat=True)
        if not item_ids:
            return []

        paths = sorted({
            normalize_path(path)
            for path in await RouteBindingRecord.filter(
                site_id=site_id,
                item_id__in=list(item_ids),
                is_active=True,
            ).values_list("path", flat=True)
            if isinstance(path, str) and path.strip()
        })
        if "/" in paths:
            paths.remove("/")
            paths.insert(0, "/")
        return paths
