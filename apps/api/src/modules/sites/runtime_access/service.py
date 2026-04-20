from __future__ import annotations

from typing import TYPE_CHECKING, Literal
from uuid import UUID

from src.modules.sites import schema as sites_schema

if TYPE_CHECKING:
    from src.modules.sites.content.service import SiteContentService
    from src.modules.sites.publishing.service import SitePublishingService


class SiteContentPublishingAccessMixin:
    _content: SiteContentService
    _publishing: SitePublishingService

    async def resolve_route(
        self,
        *,
        site_id: UUID,
        path: str,
        mode: Literal["public", "preview"],
    ) -> sites_schema.SiteRouteResolveOut:
        return await self._publishing.resolve_route(site_id=site_id, path=path, mode=mode)

    async def heartbeat_presence(
        self,
        *,
        site_id: UUID,
        payload: sites_schema.SitePresenceHeartbeatIn,
    ) -> sites_schema.SitePresenceHeartbeatOut:
        return await self._publishing.heartbeat_presence(site_id=site_id, payload=payload)

    async def list_presence(self, *, site_id: UUID, doc_key: str) -> sites_schema.SitePresenceListOut:
        return await self._publishing.list_presence(site_id=site_id, doc_key=doc_key)

    async def get_sitemap_xml(self, *, site_id: UUID) -> str:
        return await self._publishing.get_sitemap_xml(site_id=site_id)

    async def delivery_get_menu(self, *, site_id: UUID, menu_key: str):
        return await self._content.delivery_get_menu(site_id=site_id, menu_key=menu_key)

    async def delivery_get_style(self, *, site_id: UUID):
        return await self._content.delivery_get_style(site_id=site_id)

    async def delivery_resolve_page(
        self,
        *,
        site_id: UUID,
        path: str,
        perspective: Literal["published", "preview"],
    ):
        return await self._content.delivery_resolve_page(site_id=site_id, path=path, perspective=perspective)

    async def delivery_get_page_by_id(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        perspective: Literal["published", "preview"],
    ):
        return await self._content.delivery_get_page_by_id(site_id=site_id, page_id=page_id, perspective=perspective)

    async def delivery_get_section_by_alias(
        self,
        *,
        site_id: UUID,
        alias: str,
        perspective: Literal["published", "preview"],
    ):
        return await self._content.delivery_get_section_by_alias(
            site_id=site_id,
            alias=alias,
            perspective=perspective,
        )

    async def delivery_get_global_set(
        self,
        *,
        site_id: UUID,
        key: str,
        perspective: Literal["published", "preview"],
    ):
        return await self._content.delivery_get_global_set(site_id=site_id, key=key, perspective=perspective)
