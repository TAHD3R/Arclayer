from __future__ import annotations

from typing import TYPE_CHECKING, cast
from uuid import UUID

from apps.api.src.modules.sites.schema import SiteStyleUpsertIn
from apps.api.src.modules.workspaces.content.schema import (
    ContentActiveThemeOut,
    ContentActiveThemeSetIn,
    ContentEffectiveStyleOut,
    ContentStyleSetIn,
    ContentStyleValueOut,
)
from apps.api.src.modules.workspaces.content.shared.service import (
    CONTENT_ENTRY_STYLES_NAMESPACE,
    CONTENT_THEME_ACTIVE_NAMESPACE,
    CONTENT_TYPE_STYLES_NAMESPACE,
)


class WorkspaceContentAppearanceMixin:
    if TYPE_CHECKING:
        from apps.api.src.modules.sites.service import SiteService

        site_service: SiteService

        @staticmethod
        def _validate_type_code(code: str) -> str: ...

        async def _get_setting_value(self, *, site_id: UUID, namespace: str) -> dict[str, object] | None: ...

        async def _put_setting_value(
            self,
            *,
            site_id: UUID,
            namespace: str,
            value: dict[str, object] | None,
        ) -> None: ...

    async def get_active_theme(self, *, site_id: UUID) -> ContentActiveThemeOut:
        setting = await self.site_service.get_site_setting(site_id=site_id, namespace=CONTENT_THEME_ACTIVE_NAMESPACE)
        value = setting.value if isinstance(setting.value, dict) else {}
        theme_id = str(value.get("themeId")) if value.get("themeId") else None
        version = str(value.get("version")) if value.get("version") else None
        return ContentActiveThemeOut(theme_id=theme_id, version=version)

    async def set_active_theme(self, *, site_id: UUID, payload: ContentActiveThemeSetIn) -> ContentActiveThemeOut:
        value: dict[str, object] = {
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
        type_style: dict[str, object] | None = None
        entry_style: dict[str, object] | None = None

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

        effective: dict[str, object] = {}
        for layer in (global_style, type_style, entry_style):
            if isinstance(layer, dict):
                _deep_merge(effective, layer)

        return ContentEffectiveStyleOut(
            global_style=global_style,
            type_style=type_style,
            entry_style=entry_style,
            effective=effective or None,
        )


def _deep_merge(base: dict[str, object], override: dict[str, object]) -> None:
    """Recursively merge *override* into *base* in-place."""
    for key, val in override.items():
        existing = base.get(key)
        if isinstance(val, dict) and isinstance(existing, dict):
            _deep_merge(cast(dict[str, object], existing), cast(dict[str, object], val))
        else:
            base[key] = val
