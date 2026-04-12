from __future__ import annotations

from src.common.repositories import BaseRepository
from src.modules.sites.routing.repository import SiteRoutingRepository
from src.modules.sites.runtime.repository import RuntimeRepositoryMixin
from src.modules.sites.settings.repository import SettingsRepositoryMixin


class SitesRepository(
    RuntimeRepositoryMixin,
    SettingsRepositoryMixin,
    BaseRepository,
):
    def __init__(self) -> None:
        super().__init__()
        self._routing_repo = SiteRoutingRepository()

    async def list_public_sitemap_paths(self, *, site_id):
        return await self._routing_repo.list_public_sitemap_paths(site_id=site_id)
