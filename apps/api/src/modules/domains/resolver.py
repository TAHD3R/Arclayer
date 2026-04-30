from __future__ import annotations

from typing import cast
from uuid import UUID

from src.common.protocols.tortoise import DomainBindingRecordView
from src.common.services import BaseService
from src.core.exceptions import NotFound
from src.core.i18n import t
from src.modules.domains.hostname import normalize_hostname
from src.modules.domains.repository import DomainBindingRepository
from src.modules.sites import schema as sites_schema
from src.modules.sites.runtime.localization.service import SiteRuntimeLocalizationMixin
from src.platform.cache.valkey import ValkeyClientLike

_CACHE_KEY_PREFIX = "site:resolve:host"
_CACHE_TTL_SECONDS = 300


def _te(key: str) -> str:
    return t("errors", key)


class DomainResolver(BaseService, SiteRuntimeLocalizationMixin):
    def __init__(self, settings, *, valkey: ValkeyClientLike | None = None) -> None:
        super().__init__(settings)
        self._repo = DomainBindingRepository()
        self._valkey = valkey

    def _cache_key_for_host(self, host: str) -> str:
        return f"{_CACHE_KEY_PREFIX}:{host}"

    async def resolve_host(self, host: str) -> sites_schema.SiteResolveOut:
        normalized_host = normalize_hostname(host)
        if not normalized_host:
            raise NotFound(_te("SITE_NOT_FOUND"), error="SITE_NOT_FOUND")

        if self._valkey is not None:
            try:
                cached = await self._valkey.get_json(self._cache_key_for_host(normalized_host))
            except Exception:
                cached = None
            if isinstance(cached, dict):
                return sites_schema.SiteResolveOut.model_validate(cached)

        binding = await self._repo.get_by_hostname(hostname=normalized_host)
        if binding is None:
            raise NotFound(_te("SITE_NOT_FOUND"), error="SITE_NOT_FOUND")

        binding_view = cast(DomainBindingRecordView, binding)
        if not binding_view.is_active or not binding_view.is_verified:
            raise NotFound(_te("SITE_NOT_FOUND"), error="SITE_NOT_FOUND")

        site = getattr(binding, "site", None)
        if site is None:
            raise NotFound(_te("SITE_NOT_FOUND"), error="SITE_NOT_FOUND")

        default_locale, fallback_locale, supported_locales = await self._read_project_site_localization(
            project_id=UUID(str(binding_view.project_id)),
            site=site,
        )
        out = sites_schema.SiteResolveOut(
            site_id=UUID(str(binding_view.site_id)),
            workspaceId=UUID(str(binding_view.workspace_id)),
            projectId=UUID(str(binding_view.project_id)),
            runtime_id=UUID(str(binding_view.runtime_id)),
            environment_id=UUID(str(binding_view.environment_id)) if binding_view.environment_id is not None else None,
            hostname=str(binding_view.hostname),
            source=str(binding_view.source),
            target_type=str(binding_view.target_type),
            default_locale=default_locale,
            fallback_locale=fallback_locale,
            supported_locales=supported_locales,
        )

        if self._valkey is not None:
            try:
                await self._valkey.set_json(
                    self._cache_key_for_host(normalized_host),
                    out.model_dump(mode="json", by_alias=True),
                    ex=_CACHE_TTL_SECONDS,
                )
            except Exception:
                pass
        return out
