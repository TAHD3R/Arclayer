from __future__ import annotations

from typing import Any
from uuid import UUID

from apps.api.modules.sites.schema import SiteStyleUpsertIn
from apps.api.modules.workspaces.content.constants import (
    CONTENT_ENTRY_STYLES_NAMESPACE,
    CONTENT_THEME_ACTIVE_NAMESPACE,
    CONTENT_TYPE_STYLES_NAMESPACE,
)
from apps.api.modules.workspaces.content.schema import (
    ContentActiveThemeOut,
    ContentActiveThemeSetIn,
    ContentEffectiveStyleOut,
    ContentStyleSetIn,
    ContentStyleValueOut,
)


class WorkspaceContentAppearanceMixin:
    async def get_active_theme(self, *, site_id: UUID) -> ContentActiveThemeOut:
        setting = await self.site_service.get_site_setting(site_id=site_id, namespace=CONTENT_THEME_ACTIVE_NAMESPACE)
        value = setting.value if isinstance(setting.value, dict) else {}
        theme_id = str(value.get("themeId")) if value.get("themeId") else None
        version = str(value.get("version")) if value.get("version") else None
        return ContentActiveThemeOut(theme_id=theme_id, version=version)

    async def set_active_theme(self, *, site_id: UUID, payload: ContentActiveThemeSetIn) -> ContentActiveThemeOut:
        value = {
            "themeId": payload.theme_id,
            "version": payload.version,
        }
        await self._put_setting_value(site_id=site_id, namespace=CONTENT_THEME_ACTIVE_NAMESPACE, value=value)
        return ContentActiveThemeOut(theme_id=payload.theme_id, version=payload.version)

    async def get_global_style(self, *, site_id: UUID) -> ContentStyleValueOut:
        style = await self.site_service.get_site_style(site_id=site_id)
        return ContentStyleValueOut(value=style.value)

    async def set_global_style(self, *, site_id: UUID, payload: ContentStyleSetIn) -> ContentStyleValueOut:
        style = await self.site_service.upsert_site_style(
            site_id=site_id,
            payload=SiteStyleUpsertIn(value=payload.value),
        )
        return ContentStyleValueOut(value=style.value)

    async def set_type_style(
        self, *, site_id: UUID, type_code: str, payload: ContentStyleSetIn
    ) -> ContentStyleValueOut:
        code = self._validate_type_code(type_code)
        value = await self._get_setting_value(site_id=site_id, namespace=CONTENT_TYPE_STYLES_NAMESPACE) or {}
        value[code] = payload.value
        await self._put_setting_value(site_id=site_id, namespace=CONTENT_TYPE_STYLES_NAMESPACE, value=value)
        style = value.get(code)
        return ContentStyleValueOut(value=(style if isinstance(style, dict) else None))

    async def set_entry_style(
        self, *, site_id: UUID, entry_id: UUID, payload: ContentStyleSetIn
    ) -> ContentStyleValueOut:
        value = await self._get_setting_value(site_id=site_id, namespace=CONTENT_ENTRY_STYLES_NAMESPACE) or {}
        key = str(entry_id)
        value[key] = payload.value
        await self._put_setting_value(site_id=site_id, namespace=CONTENT_ENTRY_STYLES_NAMESPACE, value=value)
        style = value.get(key)
        return ContentStyleValueOut(value=(style if isinstance(style, dict) else None))

    async def get_effective_style(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        type_code: str | None,
        entry_id: UUID | None,
    ) -> ContentEffectiveStyleOut:
        _ = workspace_id
        global_style = (await self.get_global_style(site_id=site_id)).value
        type_style: dict[str, Any] | None = None
        entry_style: dict[str, Any] | None = None

        if type_code is not None:
            code = self._validate_type_code(type_code)
            styles = await self._get_setting_value(site_id=site_id, namespace=CONTENT_TYPE_STYLES_NAMESPACE) or {}
            maybe = styles.get(code)
            if isinstance(maybe, dict):
                type_style = maybe

        if entry_id is not None:
            styles = await self._get_setting_value(site_id=site_id, namespace=CONTENT_ENTRY_STYLES_NAMESPACE) or {}
            maybe = styles.get(str(entry_id))
            if isinstance(maybe, dict):
                entry_style = maybe

        effective: dict[str, Any] = {}
        if isinstance(global_style, dict):
            effective.update(global_style)
        if isinstance(type_style, dict):
            effective.update(type_style)
        if isinstance(entry_style, dict):
            effective.update(entry_style)

        return ContentEffectiveStyleOut(
            global_style=global_style,
            type_style=type_style,
            entry_style=entry_style,
            effective=effective or None,
        )
