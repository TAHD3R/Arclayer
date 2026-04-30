from __future__ import annotations

from typing import TYPE_CHECKING, cast
from uuid import UUID

from src.common.protocols.tortoise import HasProjectId, HasRuntimeId, HasWorkspaceId
from src.core.exceptions import Conflict, NotFound
from src.modules.domains.resolver import DomainResolver
from src.modules.sites import schema as sites_schema
from src.modules.sites.runtime.localization.service import SiteRuntimeLocalizationMixin

if TYPE_CHECKING:
    from src.config import Settings
    from src.modules.sites.repository import SitesRepository


class SiteRuntimeContextMixin(SiteRuntimeLocalizationMixin):
    settings: Settings
    _repo: SitesRepository

    async def _to_site_resolve_out(self, *, site) -> sites_schema.SiteResolveOut:
        project_id = UUID(str(cast(HasProjectId, site).project_id))
        workspace_id = UUID(str(cast(HasWorkspaceId, site).workspace_id))
        runtime_id_raw = cast(HasRuntimeId, site).runtime_id
        default_locale, fallback_locale, supported_locales = await self._read_project_site_localization(
            project_id=project_id,
            site=site,
        )
        return sites_schema.SiteResolveOut(
            site_id=UUID(str(site.id)),
            workspaceId=workspace_id,
            projectId=project_id,
            runtime_id=UUID(str(runtime_id_raw)) if runtime_id_raw is not None else None,
            default_locale=default_locale,
            fallback_locale=fallback_locale,
            supported_locales=supported_locales,
        )

    async def resolve_site(self, *, host: str | None = None) -> sites_schema.SiteResolveOut:
        if not self.settings.database.enabled:
            raise Conflict("Site resolution requires database storage", error="SITE_RESOLVE_DB_REQUIRED")

        if host is None:
            raise NotFound("Site not found", error="SITE_NOT_FOUND")

        resolver = DomainResolver(self.settings, valkey=getattr(self, "_valkey", None))
        return await resolver.resolve_host(host)

    async def get_site_context(self, *, site_id: UUID) -> sites_schema.SiteResolveOut:
        if not self.settings.database.enabled:
            raise Conflict("Site context requires database storage", error="SITE_CONTEXT_DB_REQUIRED")

        site = await self._repo.get_site_by_id(site_id=site_id)
        return await self._to_site_resolve_out(site=site)
