from __future__ import annotations

from typing import Literal

from src.common.services import BaseService
from src.modules.sites.content.delivery.service import ContentDeliveryService
from src.modules.sites.repository import SitesRepository


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

    async def delivery_resolve_page(
        self,
        *,
        site_id,
        path: str,
        perspective: Literal["published", "preview"],
    ):
        return await self._delivery.delivery_resolve_page(site_id=site_id, path=path, perspective=perspective)

    async def delivery_get_page_by_id(
        self,
        *,
        site_id,
        page_id,
        perspective: Literal["published", "preview"],
    ):
        return await self._delivery.delivery_get_page_by_id(
            site_id=site_id,
            page_id=page_id,
            perspective=perspective,
        )

    async def delivery_get_section_by_alias(
        self,
        *,
        site_id,
        alias: str,
        perspective: Literal["published", "preview"],
    ):
        return await self._delivery.delivery_get_section_by_alias(
            site_id=site_id,
            alias=alias,
            perspective=perspective,
        )

    async def delivery_get_global_set(
        self,
        *,
        site_id,
        key: str,
        perspective: Literal["published", "preview"],
    ):
        return await self._delivery.delivery_get_global_set(site_id=site_id, key=key, perspective=perspective)
