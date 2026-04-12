from __future__ import annotations

from typing import Literal
from uuid import UUID

from src.common.services import BaseService
from src.core.exceptions import Conflict
from src.modules.sites.publishing.includes.service import PublishingIncludesService
from src.modules.sites.publishing.routes.resolve.content.service import ContentPageRouteResolver
from src.modules.sites.repository import SitesRepository
from src.modules.sites.schema import SiteRouteMatchOut, SiteRouteResolveOut
from src.modules.sites.shared.service import normalize_path as normalize_site_path


class PublishingRoutesResolveService(BaseService):
    def __init__(
        self,
        settings,
        *,
        repo: SitesRepository,
        includes: PublishingIncludesService,
    ) -> None:
        super().__init__(settings)
        self._repo = repo
        self._content_resolver = ContentPageRouteResolver(settings, repo=repo, includes=includes)

    async def resolve_route(
        self,
        *,
        site_id: UUID,
        path: str,
        mode: Literal["public", "preview"],
    ) -> SiteRouteResolveOut:
        pathname = normalize_site_path(path)

        if not self.settings.database.enabled:
            raise Conflict("Route resolution requires database storage", error="ROUTE_RESOLVE_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)

        resolved = await self._content_resolver.resolve(site_id=site_id, pathname=pathname, mode=mode)
        if resolved is not None:
            return resolved

        return SiteRouteResolveOut(match=SiteRouteMatchOut(kind="not_found"), pageBlueprint=None)
