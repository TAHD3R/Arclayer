from __future__ import annotations

from uuid import UUID

from src.common.services.base import BaseService
from src.modules.sites.repository import SitesRepository


class ContentDeliveryService(BaseService):
    def __init__(
        self,
        settings,
        *,
        repo: SitesRepository,
    ) -> None:
        super().__init__(settings)
        self._repo = repo

    async def delivery_get_menu(self, *, site_id: UUID, menu_key: str):
        from src.modules.sites.delivery.schema import DeliveryMenuOut

        await self._repo.get_site_by_id(site_id=site_id)
        menu = await self._repo.get_menu_by_key(site_id=site_id, key=menu_key)
        items_raw = menu.get("items") if isinstance(menu, dict) else None
        return DeliveryMenuOut(
            key=menu_key,
            items=(items_raw if isinstance(items_raw, list) else []),
        )

    async def delivery_get_style(self, *, site_id: UUID):
        from src.modules.sites.delivery.schema import DeliveryStyleOut

        await self._repo.get_site_by_id(site_id=site_id)
        style = await self._repo.get_site_style(site_id=site_id)
        return DeliveryStyleOut(
            effective=style if isinstance(style, dict) else None,
        )
