from __future__ import annotations

from apps.api.src.common.services.base import BaseService
from apps.api.src.modules.sites.content.delivery.service import ContentDeliveryService
from apps.api.src.modules.sites.repository import SitesRepository


class SiteContentService(BaseService):
    def __init__(
        self,
        settings,
        *,
        repo: SitesRepository,
    ) -> None:
        super().__init__(settings)
        self._delivery = ContentDeliveryService(settings, repo=repo)

    async def delivery_get_menu(self, *, site_id, menu_key: str):
        return await self._delivery.delivery_get_menu(site_id=site_id, menu_key=menu_key)

    async def delivery_get_style(self, *, site_id):
        return await self._delivery.delivery_get_style(site_id=site_id)
