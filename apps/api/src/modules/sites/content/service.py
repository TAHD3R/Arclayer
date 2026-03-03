from __future__ import annotations

from uuid import UUID

from apps.api.src.common.services.base import BaseService
from apps.api.src.core.http.pagination import PageData, PageParams
from apps.api.src.modules.sites.content.delivery.service import ContentDeliveryService
from apps.api.src.modules.sites.content.entry.service import ContentEntryService
from apps.api.src.modules.sites.content.page.service import ContentPageService
from apps.api.src.modules.sites.content.templates.service import ContentTemplatesService
from apps.api.src.modules.sites.repository import SitesRepository
from apps.api.src.modules.sites.schema import (
    SiteEntryCreateIn,
    SiteEntryDeleteOut,
    SiteEntryOut,
    SiteEntryTypeCreateIn,
    SiteEntryTypeDeleteOut,
    SiteEntryTypeOut,
    SiteEntryTypeUpdateIn,
    SiteEntryUnpublishIn,
    SiteEntryUnpublishOut,
    SiteEntryUpdateIn,
    SitePageCreateIn,
    SitePageDeleteOut,
    SitePageMoveIn,
    SitePageTreeNodeOut,
    SitePageUpdateIn,
    SiteRouteTemplateCreateIn,
    SiteRouteTemplateDeleteOut,
    SiteRouteTemplateOut,
    SiteRouteTemplateUpdateIn,
)
from apps.api.src.modules.sites.stores.service import RouteTemplateVersionStore


class SiteContentService(BaseService):
    def __init__(
        self,
        settings,
        *,
        repo: SitesRepository,
        route_templates_version: RouteTemplateVersionStore | None,
    ) -> None:
        super().__init__(settings)
        self._pages = ContentPageService(settings, repo=repo)
        self._templates = ContentTemplatesService(settings, repo=repo, route_templates_version=route_templates_version)
        self._entry = ContentEntryService(settings, repo=repo)
        self._delivery = ContentDeliveryService(settings, repo=repo)

    async def list_pages_tree(self, *, site_id: UUID) -> PageData[SitePageTreeNodeOut]:
        return await self._pages.list_pages_tree(site_id=site_id)

    async def create_page(
        self,
        *,
        site_id: UUID,
        payload: SitePageCreateIn,
        actor_user_id: UUID | None,
    ) -> SitePageTreeNodeOut:
        return await self._pages.create_page(site_id=site_id, payload=payload, actor_user_id=actor_user_id)

    async def update_page(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: SitePageUpdateIn,
        actor_user_id: UUID | None,
    ) -> SitePageTreeNodeOut:
        return await self._pages.update_page(
            site_id=site_id,
            page_id=page_id,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    async def get_page(self, *, site_id: UUID, page_id: UUID) -> SitePageTreeNodeOut:
        return await self._pages.get_page(site_id=site_id, page_id=page_id)

    async def move_page(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: SitePageMoveIn,
        actor_user_id: UUID | None,
    ) -> SitePageTreeNodeOut:
        return await self._pages.move_page(
            site_id=site_id,
            page_id=page_id,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    async def delete_page(self, *, site_id: UUID, page_id: UUID) -> SitePageDeleteOut:
        return await self._pages.delete_page(site_id=site_id, page_id=page_id)

    async def list_route_templates_paginated(
        self,
        *,
        site_id: UUID,
        params: PageParams,
    ) -> PageData[SiteRouteTemplateOut]:
        return await self._templates.list_route_templates_paginated(site_id=site_id, params=params)

    async def _bump_route_templates_cache_version(self, *, site_id: UUID) -> int:
        return await self._templates._bump_route_templates_cache_version(site_id=site_id)

    async def create_route_template(self, *, site_id: UUID, payload: SiteRouteTemplateCreateIn) -> SiteRouteTemplateOut:
        return await self._templates.create_route_template(site_id=site_id, payload=payload)

    async def update_route_template(
        self,
        *,
        site_id: UUID,
        template_id: UUID,
        payload: SiteRouteTemplateUpdateIn,
    ) -> SiteRouteTemplateOut:
        return await self._templates.update_route_template(site_id=site_id, template_id=template_id, payload=payload)

    async def delete_route_template(self, *, site_id: UUID, template_id: UUID) -> SiteRouteTemplateDeleteOut:
        return await self._templates.delete_route_template(site_id=site_id, template_id=template_id)

    async def list_entry_types_paginated(self, *, site_id: UUID, params: PageParams) -> PageData[SiteEntryTypeOut]:
        return await self._entry.list_entry_types_paginated(site_id=site_id, params=params)

    async def create_entry_type(self, *, site_id: UUID, payload: SiteEntryTypeCreateIn) -> SiteEntryTypeOut:
        return await self._entry.create_entry_type(site_id=site_id, payload=payload)

    async def update_entry_type(
        self,
        *,
        site_id: UUID,
        entry_type_id: UUID,
        payload: SiteEntryTypeUpdateIn,
    ) -> SiteEntryTypeOut:
        return await self._entry.update_entry_type(site_id=site_id, entry_type_id=entry_type_id, payload=payload)

    async def delete_entry_type(self, *, site_id: UUID, entry_type_id: UUID) -> SiteEntryTypeDeleteOut:
        return await self._entry.delete_entry_type(site_id=site_id, entry_type_id=entry_type_id)

    async def list_entries_paginated(
        self,
        *,
        site_id: UUID,
        params: PageParams,
        entry_type_code: str | None,
    ) -> PageData[SiteEntryOut]:
        return await self._entry.list_entries_paginated(site_id=site_id, params=params, entry_type_code=entry_type_code)

    async def create_entry(self, *, site_id: UUID, payload: SiteEntryCreateIn) -> SiteEntryOut:
        return await self._entry.create_entry(site_id=site_id, payload=payload)

    async def update_entry(self, *, site_id: UUID, entry_id: UUID, payload: SiteEntryUpdateIn) -> SiteEntryOut:
        return await self._entry.update_entry(site_id=site_id, entry_id=entry_id, payload=payload)

    async def unpublish_entry(self, *, site_id: UUID, payload: SiteEntryUnpublishIn) -> SiteEntryUnpublishOut:
        return await self._entry.unpublish_entry(site_id=site_id, payload=payload)

    async def delete_entry(self, *, site_id: UUID, entry_id: UUID) -> SiteEntryDeleteOut:
        return await self._entry.delete_entry(site_id=site_id, entry_id=entry_id)

    async def delivery_list_entries(
        self,
        *,
        site_id: UUID,
        params: PageParams,
        type_code: str | None = None,
        display_mode: str | None = None,
    ) -> PageData:
        return await self._delivery.delivery_list_entries(
            site_id=site_id,
            params=params,
            type_code=type_code,
            display_mode=display_mode,
        )

    async def delivery_get_entry(
        self,
        *,
        site_id: UUID,
        slug: str,
        display_mode: str | None = None,
    ):
        return await self._delivery.delivery_get_entry(
            site_id=site_id,
            slug=slug,
            display_mode=display_mode,
        )

    async def delivery_get_menu(self, *, site_id: UUID, menu_key: str):
        return await self._delivery.delivery_get_menu(site_id=site_id, menu_key=menu_key)

    async def delivery_get_style(self, *, site_id: UUID):
        return await self._delivery.delivery_get_style(site_id=site_id)
