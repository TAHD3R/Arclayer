from __future__ import annotations

from typing import Literal
from uuid import UUID

from apps.api.src.common.services.base import BaseService
from apps.api.src.core.exceptions import Conflict
from apps.api.src.modules.sites.publishing.config.service import PublishingConfigService
from apps.api.src.modules.sites.publishing.includes.service import PublishingIncludesService
from apps.api.src.modules.sites.publishing.routes.resolve.content.service import ContentPageRouteResolver
from apps.api.src.modules.sites.publishing.routes.resolve.legacy.service import LegacyPageRouteResolver
from apps.api.src.modules.sites.publishing.routes.resolve.templates.service import RouteTemplateRouteResolver
from apps.api.src.modules.sites.repository import SitesRepository
from apps.api.src.modules.sites.schema import SiteRouteMatchOut, SiteRouteResolveOut
from apps.api.src.modules.sites.shared.service import normalize_path as normalize_site_path


class PublishingRoutesResolveService(BaseService):
    def __init__(
        self,
        settings,
        *,
        repo: SitesRepository,
        includes: PublishingIncludesService,
        config: PublishingConfigService,
    ) -> None:
        super().__init__(settings)
        self._repo = repo
        self._content_resolver = ContentPageRouteResolver(settings, repo=repo, includes=includes)
        self._legacy_resolver = LegacyPageRouteResolver(settings, repo=repo, includes=includes)
        self._template_resolver = RouteTemplateRouteResolver(settings, repo=repo, includes=includes, config=config)

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

        if pathname == "/old-about":
            return SiteRouteResolveOut(
                match=SiteRouteMatchOut(
                    kind="redirect",
                    params={},
                    redirect_to="/about",
                    redirect_status=301,
                ),
                pageBlueprint=None,
            )

        resolved = await self._content_resolver.resolve(site_id=site_id, pathname=pathname, mode=mode)
        if resolved is not None:
            return resolved

        resolved = await self._legacy_resolver.resolve(site_id=site_id, pathname=pathname, mode=mode)
        if resolved is not None:
            return resolved

        resolved = await self._template_resolver.resolve(site_id=site_id, pathname=pathname, mode=mode)
        if resolved is not None:
            return resolved

        return SiteRouteResolveOut(match=SiteRouteMatchOut(kind="not_found"), pageBlueprint=None)
