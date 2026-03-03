from __future__ import annotations

from typing import Literal
from uuid import UUID

from apps.api.src.common.services.base import BaseService
from apps.api.src.modules.sites.publishing.config.service import PublishingConfigService
from apps.api.src.modules.sites.publishing.includes.service import PublishingIncludesService
from apps.api.src.modules.sites.repository import SitesRepository
from apps.api.src.modules.sites.schema import (
    SitePrimaryEntryOut,
    SiteRouteDataSourcesOut,
    SiteRouteMatchOut,
    SiteRouteResolveOut,
)


class RouteTemplateRouteResolver(BaseService):
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
        self._includes = includes
        self._config = config

    async def resolve(
        self,
        *,
        site_id: UUID,
        pathname: str,
        mode: Literal["public", "preview"],
    ) -> SiteRouteResolveOut | None:
        cache_version = await self._config.get_route_templates_cache_version(site_id=site_id)
        tm = await self._repo.match_route_template(site_id=site_id, pathname=pathname, cache_version=cache_version)
        if tm is None:
            return None

        slug = tm.params.get("slug")
        if not slug:
            return None

        resolved = await self._repo.resolve_entry_by_slug(
            site_id=site_id,
            entry_type_id=tm.entry_type_id,
            slug=slug,
            mode=mode,
        )
        if resolved is None:
            return None

        includes = {}
        warnings = []
        if resolved.page_blueprint is not None:
            includes, warnings = await self._includes.resolve_content_refs(
                document=resolved.page_blueprint,
                site_id=site_id,
                mode=mode,
            )
        return SiteRouteResolveOut(
            match=SiteRouteMatchOut(
                kind="route_template",
                params=tm.params,
                entry_id=resolved.entry_id,
                variant_id=resolved.variant_id,
                revision=resolved.revision,
                revision_state=resolved.revision_state,
                draft_revision=resolved.draft_rev,
                published_revision=(resolved.published_rev if resolved.published_rev else None),
            ),
            pageBlueprint=resolved.page_blueprint,
            dataSources=SiteRouteDataSourcesOut(
                primaryEntry=SitePrimaryEntryOut(
                    id=resolved.entry_id,
                    data={"fields": resolved.data or {}},
                )
            ),
            includes=includes or None,
            warnings=warnings or None,
        )
