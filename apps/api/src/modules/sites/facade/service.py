from __future__ import annotations

from typing import TYPE_CHECKING, Literal
from uuid import UUID

from apps.api.src.core.http.pagination import PageData, PageParams
from apps.api.src.modules.sites import schema as sites_schema

if TYPE_CHECKING:
    from apps.api.src.modules.sites.content.service import SiteContentService
    from apps.api.src.modules.sites.publishing.service import SitePublishingService


class SiteContentPublishingFacadeMixin:
    _content: SiteContentService
    _publishing: SitePublishingService

    async def list_pages_tree(self, *, site_id: UUID) -> PageData[sites_schema.SitePageTreeNodeOut]:
        return await self._content.list_pages_tree(site_id=site_id)

    async def create_page(
        self,
        *,
        site_id: UUID,
        payload: sites_schema.SitePageCreateIn,
        actor_user_id: UUID | None = None,
    ) -> sites_schema.SitePageTreeNodeOut:
        return await self._content.create_page(site_id=site_id, payload=payload, actor_user_id=actor_user_id)

    async def update_page(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: sites_schema.SitePageUpdateIn,
        actor_user_id: UUID | None = None,
    ) -> sites_schema.SitePageTreeNodeOut:
        return await self._content.update_page(
            site_id=site_id,
            page_id=page_id,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    async def get_page(self, *, site_id: UUID, page_id: UUID) -> sites_schema.SitePageTreeNodeOut:
        return await self._content.get_page(site_id=site_id, page_id=page_id)

    async def move_page(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: sites_schema.SitePageMoveIn,
        actor_user_id: UUID | None = None,
    ) -> sites_schema.SitePageTreeNodeOut:
        return await self._content.move_page(
            site_id=site_id,
            page_id=page_id,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    async def delete_page(self, *, site_id: UUID, page_id: UUID) -> sites_schema.SitePageDeleteOut:
        return await self._content.delete_page(site_id=site_id, page_id=page_id)

    async def list_route_templates_paginated(
        self, *, site_id: UUID, params: PageParams
    ) -> PageData[sites_schema.SiteRouteTemplateOut]:
        return await self._content.list_route_templates_paginated(site_id=site_id, params=params)

    async def _bump_route_templates_cache_version(self, *, site_id: UUID) -> int:
        return await self._content._bump_route_templates_cache_version(site_id=site_id)

    async def create_route_template(
        self, *, site_id: UUID, payload: sites_schema.SiteRouteTemplateCreateIn
    ) -> sites_schema.SiteRouteTemplateOut:
        return await self._content.create_route_template(site_id=site_id, payload=payload)

    async def update_route_template(
        self, *, site_id: UUID, template_id: UUID, payload: sites_schema.SiteRouteTemplateUpdateIn
    ) -> sites_schema.SiteRouteTemplateOut:
        return await self._content.update_route_template(site_id=site_id, template_id=template_id, payload=payload)

    async def delete_route_template(
        self, *, site_id: UUID, template_id: UUID
    ) -> sites_schema.SiteRouteTemplateDeleteOut:
        return await self._content.delete_route_template(site_id=site_id, template_id=template_id)

    async def list_entry_types_paginated(
        self, *, site_id: UUID, params: PageParams
    ) -> PageData[sites_schema.SiteEntryTypeOut]:
        return await self._content.list_entry_types_paginated(site_id=site_id, params=params)

    async def create_entry_type(
        self, *, site_id: UUID, payload: sites_schema.SiteEntryTypeCreateIn
    ) -> sites_schema.SiteEntryTypeOut:
        return await self._content.create_entry_type(site_id=site_id, payload=payload)

    async def update_entry_type(
        self,
        *,
        site_id: UUID,
        entry_type_id: UUID,
        payload: sites_schema.SiteEntryTypeUpdateIn,
    ) -> sites_schema.SiteEntryTypeOut:
        return await self._content.update_entry_type(site_id=site_id, entry_type_id=entry_type_id, payload=payload)

    async def delete_entry_type(self, *, site_id: UUID, entry_type_id: UUID) -> sites_schema.SiteEntryTypeDeleteOut:
        return await self._content.delete_entry_type(site_id=site_id, entry_type_id=entry_type_id)

    async def list_entries_paginated(
        self,
        *,
        site_id: UUID,
        params: PageParams,
        entry_type_code: str | None,
    ) -> PageData[sites_schema.SiteEntryOut]:
        return await self._content.list_entries_paginated(
            site_id=site_id,
            params=params,
            entry_type_code=entry_type_code,
        )

    async def create_entry(
        self, *, site_id: UUID, payload: sites_schema.SiteEntryCreateIn
    ) -> sites_schema.SiteEntryOut:
        return await self._content.create_entry(site_id=site_id, payload=payload)

    async def update_entry(
        self, *, site_id: UUID, entry_id: UUID, payload: sites_schema.SiteEntryUpdateIn
    ) -> sites_schema.SiteEntryOut:
        return await self._content.update_entry(site_id=site_id, entry_id=entry_id, payload=payload)

    async def unpublish_entry(
        self, *, site_id: UUID, payload: sites_schema.SiteEntryUnpublishIn
    ) -> sites_schema.SiteEntryUnpublishOut:
        return await self._content.unpublish_entry(site_id=site_id, payload=payload)

    async def delete_entry(self, *, site_id: UUID, entry_id: UUID) -> sites_schema.SiteEntryDeleteOut:
        return await self._content.delete_entry(site_id=site_id, entry_id=entry_id)

    async def rollback_page_revision(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: sites_schema.SitePageRollbackIn,
        actor_user_id: UUID | None = None,
    ) -> sites_schema.SitePageRollbackOut:
        return await self._publishing.rollback_page_revision(
            site_id=site_id,
            page_id=page_id,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    async def rollback_entry_revision(
        self,
        *,
        site_id: UUID,
        entry_id: UUID,
        payload: sites_schema.SiteEntryRollbackIn,
    ) -> sites_schema.SiteEntryRollbackOut:
        return await self._publishing.rollback_entry_revision(site_id=site_id, entry_id=entry_id, payload=payload)

    async def get_page_revision(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        state: Literal["draft", "published"],
    ) -> sites_schema.SitePageRevisionOut:
        return await self._publishing.get_page_revision(site_id=site_id, page_id=page_id, state=state)

    async def get_entry_revision(
        self,
        *,
        site_id: UUID,
        entry_id: UUID,
        state: Literal["draft", "published"],
    ) -> sites_schema.SiteEntryRevisionOut:
        return await self._publishing.get_entry_revision(site_id=site_id, entry_id=entry_id, state=state)

    async def save_entry_draft(
        self,
        *,
        site_id: UUID,
        payload: sites_schema.SiteEntryDraftSaveIn,
    ) -> sites_schema.SiteEntryDraftSaveOut:
        return await self._publishing.save_entry_draft(site_id=site_id, payload=payload)

    async def publish_entry(
        self,
        *,
        site_id: UUID,
        payload: sites_schema.SiteEntryPublishIn,
    ) -> sites_schema.SiteEntryPublishOut:
        return await self._publishing.publish_entry(site_id=site_id, payload=payload)

    async def resolve_route(
        self,
        *,
        site_id: UUID,
        path: str,
        mode: Literal["public", "preview"],
    ) -> sites_schema.SiteRouteResolveOut:
        return await self._publishing.resolve_route(site_id=site_id, path=path, mode=mode)

    async def save_route_draft(
        self,
        *,
        site_id: UUID,
        payload: sites_schema.SiteRouteDraftSaveIn,
    ) -> sites_schema.SiteRouteDraftSaveOut:
        return await self._publishing.save_route_draft(site_id=site_id, payload=payload)

    async def publish_route(
        self,
        *,
        site_id: UUID,
        payload: sites_schema.SiteRoutePublishIn,
    ) -> sites_schema.SiteRoutePublishOut:
        return await self._publishing.publish_route(site_id=site_id, payload=payload)

    async def save_page_draft(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: sites_schema.SitePageDraftSaveIn,
        actor_user_id: UUID | None = None,
    ) -> sites_schema.SitePageDraftSaveOut:
        return await self._publishing.save_page_draft(
            site_id=site_id,
            page_id=page_id,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    async def publish_page(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: sites_schema.SitePagePublishIn,
        actor_user_id: UUID | None = None,
    ) -> sites_schema.SitePagePublishOut:
        return await self._publishing.publish_page(
            site_id=site_id,
            page_id=page_id,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    async def unpublish_page(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        actor_user_id: UUID | None = None,
    ) -> sites_schema.SitePageUnpublishOut:
        return await self._publishing.unpublish_page(
            site_id=site_id,
            page_id=page_id,
            actor_user_id=actor_user_id,
        )

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

    async def delivery_list_entries(
        self,
        *,
        site_id: UUID,
        params: PageParams,
        type_code: str | None = None,
        display_mode: str | None = None,
    ) -> PageData:
        return await self._content.delivery_list_entries(
            site_id=site_id,
            params=params,
            type_code=type_code,
            display_mode=display_mode,
        )

    async def delivery_get_entry(self, *, site_id: UUID, slug: str, display_mode: str | None = None):
        return await self._content.delivery_get_entry(
            site_id=site_id,
            slug=slug,
            display_mode=display_mode,
        )

    async def delivery_get_menu(self, *, site_id: UUID, menu_key: str):
        return await self._content.delivery_get_menu(site_id=site_id, menu_key=menu_key)

    async def delivery_get_style(self, *, site_id: UUID):
        return await self._content.delivery_get_style(site_id=site_id)
