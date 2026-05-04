from __future__ import annotations

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.modules.sites.routing.repository import SiteRoutingRepository
from src.modules.sites.runtime.repository import RuntimeRepositoryMixin
from src.modules.sites.settings.repository import SettingsRepositoryMixin


class SitesRepository(
    RuntimeRepositoryMixin,
    SettingsRepositoryMixin,
    TortoiseORMRepository,
):
    def __init__(self, conn: BaseDBAsyncClient | None = None) -> None:
        super().__init__(conn=conn)
        self._conn = conn
        self._routing_repo = SiteRoutingRepository(conn=conn)

    async def list_public_sitemap_paths(self, *, site_id):
        return await self._routing_repo.list_public_sitemap_paths(site_id=site_id)
