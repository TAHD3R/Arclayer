from __future__ import annotations

from typing import Literal
from uuid import UUID

from apps.api.src.common.services.base import BaseService
from apps.api.src.modules.sites.publishing.config.service import PublishingConfigService
from apps.api.src.modules.sites.publishing.entries.service import PublishingEntriesService
from apps.api.src.modules.sites.publishing.includes.service import PublishingIncludesService
from apps.api.src.modules.sites.publishing.pages.service import PublishingPagesService
from apps.api.src.modules.sites.publishing.presence.service import PublishingPresenceService
from apps.api.src.modules.sites.publishing.revisions.service import PublishingRevisionsService
from apps.api.src.modules.sites.publishing.routes.service import (
    PublishingRoutesDraftsService,
    PublishingRoutesResolveService,
)
from apps.api.src.modules.sites.publishing.sitemap.service import PublishingSitemapService
from apps.api.src.modules.sites.repository import SitesRepository
from apps.api.src.modules.sites.schema import (
    SiteEntryDraftSaveIn,
    SiteEntryDraftSaveOut,
    SiteEntryPublishIn,
    SiteEntryPublishOut,
    SiteEntryRevisionOut,
    SiteEntryRollbackIn,
    SiteEntryRollbackOut,
    SitePageDraftSaveIn,
    SitePageDraftSaveOut,
    SitePagePublishIn,
    SitePagePublishOut,
    SitePageRevisionOut,
    SitePageRollbackIn,
    SitePageRollbackOut,
    SitePageUnpublishOut,
    SitePresenceHeartbeatIn,
    SitePresenceHeartbeatOut,
    SitePresenceListOut,
    SiteRouteDraftSaveIn,
    SiteRouteDraftSaveOut,
    SiteRoutePublishIn,
    SiteRoutePublishOut,
    SiteRouteResolveOut,
)
from apps.api.src.modules.sites.stores.service import PresenceStore, RouteTemplateVersionStore


class SitePublishingService(BaseService):
    def __init__(
        self,
        settings,
        *,
        repo: SitesRepository,
        presence: PresenceStore | None,
        route_templates_version: RouteTemplateVersionStore | None,
    ) -> None:
        super().__init__(settings)
        self._includes = PublishingIncludesService(settings, repo=repo)
        self._config = PublishingConfigService(settings, repo=repo, route_templates_version=route_templates_version)
        self._revisions = PublishingRevisionsService(settings, repo=repo, includes=self._includes)
        self._entries = PublishingEntriesService(settings, repo=repo, config=self._config)
        self._pages = PublishingPagesService(settings, repo=repo, config=self._config)
        self._routes_resolve = PublishingRoutesResolveService(
            settings, repo=repo, includes=self._includes, config=self._config
        )
        self._routes_drafts = PublishingRoutesDraftsService(settings, repo=repo, config=self._config)
        self._presence = PublishingPresenceService(settings, repo=repo, presence=presence)
        self._sitemap = PublishingSitemapService(settings, repo=repo)

    async def rollback_page_revision(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: SitePageRollbackIn,
        actor_user_id: UUID | None,
    ) -> SitePageRollbackOut:
        return await self._revisions.rollback_page_revision(
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
        payload: SiteEntryRollbackIn,
    ) -> SiteEntryRollbackOut:
        return await self._revisions.rollback_entry_revision(site_id=site_id, entry_id=entry_id, payload=payload)

    async def get_page_revision(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        state: Literal["draft", "published"],
    ) -> SitePageRevisionOut:
        return await self._revisions.get_page_revision(site_id=site_id, page_id=page_id, state=state)

    async def get_entry_revision(
        self,
        *,
        site_id: UUID,
        entry_id: UUID,
        state: Literal["draft", "published"],
    ) -> SiteEntryRevisionOut:
        return await self._revisions.get_entry_revision(site_id=site_id, entry_id=entry_id, state=state)

    async def save_entry_draft(self, *, site_id: UUID, payload: SiteEntryDraftSaveIn) -> SiteEntryDraftSaveOut:
        return await self._entries.save_entry_draft(site_id=site_id, payload=payload)

    async def publish_entry(self, *, site_id: UUID, payload: SiteEntryPublishIn) -> SiteEntryPublishOut:
        return await self._entries.publish_entry(site_id=site_id, payload=payload)

    async def resolve_route(
        self,
        *,
        site_id: UUID,
        path: str,
        mode: Literal["public", "preview"],
    ) -> SiteRouteResolveOut:
        return await self._routes_resolve.resolve_route(site_id=site_id, path=path, mode=mode)

    async def save_route_draft(self, *, site_id: UUID, payload: SiteRouteDraftSaveIn) -> SiteRouteDraftSaveOut:
        return await self._routes_drafts.save_route_draft(site_id=site_id, payload=payload)

    async def publish_route(self, *, site_id: UUID, payload: SiteRoutePublishIn) -> SiteRoutePublishOut:
        return await self._routes_drafts.publish_route(site_id=site_id, payload=payload)

    async def save_page_draft(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: SitePageDraftSaveIn,
        actor_user_id: UUID | None,
    ) -> SitePageDraftSaveOut:
        return await self._pages.save_page_draft(
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
        payload: SitePagePublishIn,
        actor_user_id: UUID | None,
    ) -> SitePagePublishOut:
        return await self._pages.publish_page(
            site_id=site_id,
            page_id=page_id,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    async def unpublish_page(self, *, site_id: UUID, page_id: UUID, actor_user_id: UUID | None) -> SitePageUnpublishOut:
        return await self._pages.unpublish_page(site_id=site_id, page_id=page_id, actor_user_id=actor_user_id)

    async def heartbeat_presence(self, *, site_id: UUID, payload: SitePresenceHeartbeatIn) -> SitePresenceHeartbeatOut:
        return await self._presence.heartbeat_presence(site_id=site_id, payload=payload)

    async def list_presence(self, *, site_id: UUID, doc_key: str) -> SitePresenceListOut:
        return await self._presence.list_presence(site_id=site_id, doc_key=doc_key)

    async def get_sitemap_xml(self, *, site_id: UUID) -> str:
        return await self._sitemap.get_sitemap_xml(site_id=site_id)
