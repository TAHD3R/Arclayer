from __future__ import annotations

from typing import TYPE_CHECKING, cast
from uuid import UUID

from src.common.protocols.tortoise import HasProjectId
from src.core.exceptions import Conflict, NotFound
from src.modules.sites import schema as sites_schema
from src.modules.sites.runtime.localization.service import SiteRuntimeLocalizationMixin
from src.modules.sites.shared.hosts import normalize_request_host

if TYPE_CHECKING:
    from src.config import Settings
    from src.modules.sites.repository import SitesRepository


class SiteRuntimeContextMixin(SiteRuntimeLocalizationMixin):
    settings: Settings
    _repo: SitesRepository

    def _normalize_host_for_custom_domain(self, host: str) -> str | None:
        raw = normalize_request_host(host)
        if not raw:
            return None

        base_domain = (self.settings.saas.base_domain or "").strip().lower().rstrip(".")
        if base_domain and (raw == base_domain or raw.endswith(f".{base_domain}")):
            return None
        return raw or None

    async def _to_site_resolve_out(self, *, site) -> sites_schema.SiteResolveOut:
        project_id = UUID(str(cast(HasProjectId, site).project_id))
        default_locale, fallback_locale, supported_locales = await self._read_project_site_localization(
            project_id=project_id,
            site=site,
        )
        return sites_schema.SiteResolveOut(
            site_id=UUID(str(site.id)),
            default_locale=default_locale,
            fallback_locale=fallback_locale,
            supported_locales=supported_locales,
        )

    async def _resolve_site_by_custom_domain(self, *, host: str) -> sites_schema.SiteResolveOut | None:
        normalized_host = self._normalize_host_for_custom_domain(host)
        if normalized_host is None:
            return None

        site = await self._repo.get_site_by_custom_hostname(hostname=normalized_host)
        if site is None:
            return None
        return await self._to_site_resolve_out(site=site)

    async def resolve_site(self, *, host: str | None = None) -> sites_schema.SiteResolveOut:
        if not self.settings.database.enabled:
            raise Conflict("Site resolution requires database storage", error="SITE_RESOLVE_DB_REQUIRED")

        if host is not None:
            resolved = await self._resolve_site_by_custom_domain(host=host)
            if resolved is not None:
                return resolved

        raise NotFound("Site not found", error="SITE_NOT_FOUND")

    async def get_site_context(self, *, site_id: UUID) -> sites_schema.SiteResolveOut:
        if not self.settings.database.enabled:
            raise Conflict("Site context requires database storage", error="SITE_CONTEXT_DB_REQUIRED")

        site = await self._repo.get_site_by_id(site_id=site_id)
        return await self._to_site_resolve_out(site=site)
