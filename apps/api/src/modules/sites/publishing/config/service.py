from __future__ import annotations

from uuid import UUID

from apps.api.src.common.services.base import BaseService
from apps.api.src.models.system.setting import SettingRecord
from apps.api.src.modules.sites.namespaces.service import (
    ROUTE_TEMPLATES_VERSION_NAMESPACE,
    THEME_ACTIVE_NAMESPACE,
    THEME_CONFIG_NAMESPACE,
    THEME_VARS_NAMESPACE,
)
from apps.api.src.modules.sites.repository import SitesRepository
from apps.api.src.modules.sites.stores.service import RouteTemplateVersionStore
from apps.api.src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from apps.api.src.settings.scopes import SCOPE_TYPE_WORKSPACE


class PublishingConfigService(BaseService):
    def __init__(
        self,
        settings,
        *,
        repo: SitesRepository,
        route_templates_version: RouteTemplateVersionStore | None,
    ) -> None:
        super().__init__(settings)
        self._repo = repo
        self._route_templates_version = route_templates_version

    async def read_workspace_draft_retention_max_revisions(self, *, workspace_id: UUID) -> int:
        """
        Read workspace-level draft retention policy from core settings.

        Notes:
        - When workspace settings are missing or malformed, fall back to a safe default.
        - Published revision must never be deleted (handled at repository level via exclude).
        """

        rec = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_WORKSPACE,
            scope_id=workspace_id,
            namespace=CORE_SETTINGS_NAMESPACE,
        )

        value = rec.value if rec is not None and isinstance(rec.value, dict) else {}
        cs = value.get("content_strategy") if isinstance(value, dict) else None
        retention = cs.get("retention") if isinstance(cs, dict) else None
        raw = retention.get("draft_max_revisions") if isinstance(retention, dict) else None

        if isinstance(raw, int) and 1 <= raw <= 5000:
            return int(raw)
        return 100

    async def get_route_templates_cache_version(self, *, site_id: UUID) -> int:
        """
        Return the current route template cache version for a site.

        This is used to provide cross-instance invalidation for the in-process matcher cache:
        - Writers bump a version number on successful mutations.
        - Readers include that version in the cache key; a bump forces a reload.
        """

        if self._route_templates_version is not None:
            v = await self._route_templates_version.get(site_id=site_id)
            if v is not None:
                return int(v)

        setting = await self._repo.get_site_setting(site_id=site_id, namespace=ROUTE_TEMPLATES_VERSION_NAMESPACE)
        version = 0
        if setting is not None and isinstance(setting.value, dict):
            raw = setting.value.get("version")
            if isinstance(raw, int) and raw >= 0:
                version = raw

        if self._route_templates_version is not None and version:
            await self._route_templates_version.set(site_id=site_id, version=version)

        return int(version)

    async def build_revision_deps(self, *, site_id: UUID, deps: dict | None) -> dict:
        """
        Build revision deps with a minimal settings snapshot (v1).

        Current v1 snapshot scope:
        - theme.active / theme.vars / theme.config

        Notes:
        - We always override `settingsSnapshot` to keep it trustworthy.
        - Other deps fields (e.g. assetIds) are preserved as-is.
        """

        base = deps if isinstance(deps, dict) else {}
        out = dict(base)
        snapshot = await self._repo.get_site_settings_snapshot(
            site_id=site_id,
            namespaces=[
                THEME_ACTIVE_NAMESPACE,
                THEME_VARS_NAMESPACE,
                THEME_CONFIG_NAMESPACE,
            ],
        )
        out["settingsSnapshot"] = snapshot
        return out
