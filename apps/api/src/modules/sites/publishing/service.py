from __future__ import annotations

from typing import Literal
from uuid import UUID

from src.common.services import BaseService
from src.modules.sites.publishing.includes.service import PublishingIncludesService
from src.modules.sites.publishing.presence.service import PublishingPresenceService
from src.modules.sites.publishing.routes.service import PublishingRoutesResolveService
from src.modules.sites.publishing.sitemap.service import PublishingSitemapService
from src.modules.sites.repository import SitesRepository
from src.modules.sites.schema import (
    SitePresenceHeartbeatIn,
    SitePresenceHeartbeatOut,
    SitePresenceListOut,
    SiteRouteResolveOut,
)
from src.modules.sites.stores.service import PresenceStore


class SitePublishingService(BaseService):
    def __init__(
        self,
        settings,
        *,
        repo: SitesRepository,
        presence: PresenceStore | None,
    ) -> None:
        super().__init__(settings)
        self._includes = PublishingIncludesService(settings, repo=repo)
        self._routes_resolve = PublishingRoutesResolveService(settings, repo=repo, includes=self._includes)
        self._presence = PublishingPresenceService(settings, repo=repo, presence=presence)
        self._sitemap = PublishingSitemapService(settings, repo=repo)

    async def resolve_route(
        self,
        *,
        site_id: UUID,
        path: str,
        mode: Literal["public", "preview"],
    ) -> SiteRouteResolveOut:
        return await self._routes_resolve.resolve_route(site_id=site_id, path=path, mode=mode)

    async def heartbeat_presence(self, *, site_id: UUID, payload: SitePresenceHeartbeatIn) -> SitePresenceHeartbeatOut:
        return await self._presence.heartbeat_presence(site_id=site_id, payload=payload)

    async def list_presence(self, *, site_id: UUID, doc_key: str) -> SitePresenceListOut:
        return await self._presence.list_presence(site_id=site_id, doc_key=doc_key)

    async def get_sitemap_xml(self, *, site_id: UUID) -> str:
        return await self._sitemap.get_sitemap_xml(site_id=site_id)
