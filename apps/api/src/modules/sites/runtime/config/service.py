from __future__ import annotations

from typing import TYPE_CHECKING, Literal, cast
from uuid import UUID

from pydantic import ValidationError

from apps.api.src.common.protocols.tortoise import HasWorkspaceId
from apps.api.src.common.utils.public_ids import encode_uuid
from apps.api.src.core.exceptions import Conflict
from apps.api.src.modules.sites import schema as sites_schema
from apps.api.src.modules.sites.namespaces.service import (
    RUNTIME_SETTING_NAMESPACE,
    THEME_ACTIVE_NAMESPACE,
    THEME_CONFIG_NAMESPACE,
    THEME_VARS_NAMESPACE,
)
from apps.api.src.modules.sites.runtime.localization.service import SiteRuntimeLocalizationMixin
from apps.api.src.modules.system.models.setting import SettingRecord
from apps.api.src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from apps.api.src.settings.scopes import SCOPE_TYPE_WORKSPACE

if TYPE_CHECKING:
    from apps.api.src.config import Settings
    from apps.api.src.modules.sites.repository import SitesRepository

DEFAULT_CSS_VARS: dict[str, str] = {
    "--color-primary": "#1677ff",
    "--color-background": "#ffffff",
    "--color-foreground": "#111827",
    "--color-border": "rgba(17, 24, 39, 0.12)",
    "--font-sans": "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
}


class SiteRuntimeConfigMixin(SiteRuntimeLocalizationMixin):
    settings: Settings
    _repo: SitesRepository

    @staticmethod
    def _pick_str(section: object, key: str) -> str | None:
        if not isinstance(section, dict):
            return None
        raw = section.get(key)
        if not isinstance(raw, str):
            return None
        s = raw.strip()
        return s or None

    @staticmethod
    def _parse_css_vars(value: object) -> dict[str, str]:
        if not isinstance(value, dict):
            return {}
        out: dict[str, str] = {}
        for k, v in value.items():
            if not isinstance(k, str) or not isinstance(v, (str, int, float)):
                continue
            kk = k.strip()
            if not kk.startswith("--"):
                continue
            out[kk] = str(v)
        return out

    async def _load_workspace_core_settings(self, *, workspace_id: UUID) -> dict[str, object]:
        rec = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_WORKSPACE,
            scope_id=workspace_id,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        if rec is None or not isinstance(rec.value, dict):
            return {}
        return cast(dict[str, object], rec.value)

    def _build_site_identity_raw(
        self, *, site_section: object, resolved_locale: str, fallback_locale: str
    ) -> dict[str, str | None]:
        identity_raw: dict[str, str | None] = {
            "name": self._pick_str(site_section, "name"),
            "subtitle": self._pick_str(site_section, "subtitle"),
            "description": self._pick_str(site_section, "description"),
            "url": self._pick_str(site_section, "url"),
            "logo_url": self._pick_str(site_section, "logo_url"),
            "favicon_url": self._pick_str(site_section, "favicon_url"),
            "contact_email": self._pick_str(site_section, "contact_email"),
        }
        if not isinstance(site_section, dict):
            return identity_raw
        for key, field in (("name", "name_i18n"), ("subtitle", "subtitle_i18n"), ("description", "description_i18n")):
            resolved = self._resolve_localized_str(
                site_section.get(field),
                locale=resolved_locale,
                fallback_locale=fallback_locale,
            )
            if resolved is not None:
                identity_raw[key] = resolved
        return identity_raw

    @staticmethod
    def _build_site_identity_out(identity_raw: dict[str, str | None]) -> sites_schema.SiteIdentityOut | None:
        payload = {k: v for k, v in identity_raw.items() if v is not None}
        return sites_schema.SiteIdentityOut(**payload) if payload else None

    def _build_seo_defaults_out(
        self, *, seo_section: object, site_description: str | None, resolved_locale: str, fallback_locale: str
    ) -> sites_schema.SiteSeoDefaultsOut | None:
        payload: dict[str, object] = {}
        default_title = self._pick_str(seo_section, "default_title")
        default_description = site_description or self._pick_str(seo_section, "default_description")
        if isinstance(seo_section, dict):
            title_i18n = self._resolve_localized_str(
                seo_section.get("default_title_i18n"),
                locale=resolved_locale,
                fallback_locale=fallback_locale,
            )
            desc_i18n = self._resolve_localized_str(
                seo_section.get("default_description_i18n"),
                locale=resolved_locale,
                fallback_locale=fallback_locale,
            )
            if title_i18n is not None:
                default_title = title_i18n
            if desc_i18n is not None:
                default_description = desc_i18n
            if isinstance(seo_section.get("title_policy_v1"), dict):
                payload["title_policy_v1"] = seo_section.get("title_policy_v1")
        if default_title is not None:
            payload["default_title"] = default_title
        if default_description is not None:
            payload["default_description"] = default_description
        if not payload:
            return None
        try:
            return sites_schema.SiteSeoDefaultsOut(**payload)
        except ValidationError as exc:
            raise Conflict("Invalid SEO defaults", error="SITE_SEO_DEFAULTS_INVALID") from exc

    def _get_localization_out(
        self, *, core_value: dict[str, object], default_locale: str, fallback_locale: str, supported_locales: list[str]
    ) -> sites_schema.SiteLocalizationOut:
        loc_section = core_value.get("site_localization")
        return sites_schema.SiteLocalizationOut(
            locale=default_locale,
            supported_locales=supported_locales,
            default_locale=default_locale,
            fallback_locale=fallback_locale,
            timezone=self._pick_str(loc_section, "timezone"),
            date_format=self._pick_str(loc_section, "date_format"),
        )

    @staticmethod
    def _parse_theme_active(value: object) -> tuple[str | None, str | None, str | None]:
        if not isinstance(value, dict):
            return None, None, None
        theme_id = str(value.get("themeId") or "").strip() or None
        version = str(value.get("version") or "").strip() or None
        preset_id = str(value.get("presetId") or "").strip() or None
        return theme_id, version, preset_id

    async def _resolve_theme_assets(
        self, *, workspace_id: UUID, theme_id: str, version: str
    ) -> tuple[str | None, str | None]:
        from apps.api.src.modules.workspaces.models.theme_package import ThemePackageRecord

        theme_pkg = await ThemePackageRecord.get_or_none(workspace_id=workspace_id, theme_id=theme_id, version=version)
        if theme_pkg is None:
            return None, None

        from apps.api.src.modules.assets.models.asset import AssetRecord

        tokens_css_url: str | None = None
        base_css_url: str | None = None

        tokens_asset = await AssetRecord.get_or_none(
            id=theme_pkg.tokens_css_asset_id,
            workspace_id=workspace_id,
            deleted_at=None,
        )
        if tokens_asset is not None:
            slug = (tokens_asset.slug or "asset").strip() or "asset"
            ext = (tokens_asset.ext or "css").lstrip(".").lower() or "css"
            tokens_css_url = f"/assets/{encode_uuid(UUID(str(tokens_asset.id)))}/{slug}.{ext}"

        if theme_pkg.base_css_asset_id:
            base_asset = await AssetRecord.get_or_none(
                id=theme_pkg.base_css_asset_id,
                workspace_id=workspace_id,
                deleted_at=None,
            )
            if base_asset is not None:
                slug = (base_asset.slug or "asset").strip() or "asset"
                ext = (base_asset.ext or "css").lstrip(".").lower() or "css"
                base_css_url = f"/assets/{encode_uuid(UUID(str(base_asset.id)))}/{slug}.{ext}"

        return tokens_css_url, base_css_url

    async def _resolve_css_vars(self, *, site_id: UUID, theme_vars: object) -> dict[str, str]:
        css_vars: dict[str, str] = dict(DEFAULT_CSS_VARS)
        if isinstance(theme_vars, dict) and isinstance(theme_vars.get("cssVars"), dict):
            css_vars.update(self._parse_css_vars(theme_vars.get("cssVars")))
            return css_vars

        setting = await self._repo.get_site_setting(site_id=site_id, namespace=RUNTIME_SETTING_NAMESPACE)
        if setting and isinstance(setting.value, dict):
            raw_theme = setting.value.get("theme")
            if isinstance(raw_theme, dict) and isinstance(raw_theme.get("cssVars"), dict):
                css_vars.update(self._parse_css_vars(raw_theme.get("cssVars")))
        return css_vars

    async def _get_theme_out(
        self, *, site_id: UUID, workspace_id: UUID, mode: Literal["public", "preview"]
    ) -> sites_schema.SiteThemeOut:
        theme_active = await self._repo.get_site_setting(site_id=site_id, namespace=THEME_ACTIVE_NAMESPACE)
        theme_vars = await self._repo.get_site_setting(site_id=site_id, namespace=THEME_VARS_NAMESPACE)
        theme_config = await self._repo.get_site_setting(site_id=site_id, namespace=THEME_CONFIG_NAMESPACE)

        theme_id, version, preset_id = self._parse_theme_active(theme_active.value if theme_active else None)
        css_vars = await self._resolve_css_vars(site_id=site_id, theme_vars=theme_vars.value if theme_vars else None)

        tokens_css_url: str | None = None
        base_css_url: str | None = None
        if theme_id and version:
            tokens_css_url, base_css_url = await self._resolve_theme_assets(
                workspace_id=workspace_id,
                theme_id=theme_id,
                version=version,
            )

        config_out = (
            cast(dict[str, object], theme_config.value)
            if mode == "preview" and theme_config and isinstance(theme_config.value, dict)
            else None
        )
        return sites_schema.SiteThemeOut(
            css_vars=css_vars,
            theme_id=theme_id,
            version=version,
            tokens_css_url=tokens_css_url,
            base_css_url=base_css_url,
            preset_id=preset_id,
            config=config_out,
        )

    async def _get_fonts_out(self, *, site_id: UUID) -> list[sites_schema.SiteFontOut]:
        fonts_setting = await self._repo.get_site_setting(site_id=site_id, namespace=RUNTIME_SETTING_NAMESPACE)
        raw_fonts = (
            fonts_setting.value.get("fonts") if fonts_setting and isinstance(fonts_setting.value, dict) else None
        )

        if raw_fonts is None:
            return []
        if not isinstance(raw_fonts, list):
            raise Conflict("Invalid runtime fonts shape", error="SITE_RUNTIME_FONTS_INVALID")

        out: list[sites_schema.SiteFontOut] = []
        for raw in raw_fonts:
            if not isinstance(raw, dict):
                raise Conflict("Invalid runtime font item shape", error="SITE_RUNTIME_FONTS_INVALID")
            try:
                out.append(sites_schema.SiteFontOut.model_validate(raw))
            except ValidationError as exc:
                raise Conflict("Invalid runtime font item", error="SITE_RUNTIME_FONTS_INVALID") from exc
        return out

    async def get_runtime(
        self, *, site_id: UUID, mode: Literal["public", "preview"], locale: str | None = None
    ) -> sites_schema.SiteRuntimeOut:
        if not self.settings.database.enabled:
            raise Conflict("Site runtime requires database storage", error="SITE_RUNTIME_DB_REQUIRED")

        site = await self._repo.get_site_by_id(site_id=site_id)
        workspace_id = UUID(str(cast(HasWorkspaceId, site).workspace_id))
        core_value = await self._load_workspace_core_settings(workspace_id=workspace_id)

        default_locale, fallback_locale, supported_locales = await self._read_workspace_site_localization(
            workspace_id=workspace_id,
            site=site,
        )
        resolved_locale = self._normalize_locale_tag(str(locale or "")) or default_locale
        identity_raw = self._build_site_identity_raw(
            site_section=core_value.get("site"),
            resolved_locale=resolved_locale,
            fallback_locale=fallback_locale,
        )
        site_identity = self._build_site_identity_out(identity_raw)
        seo_defaults = self._build_seo_defaults_out(
            seo_section=core_value.get("seo"),
            site_description=identity_raw.get("description"),
            resolved_locale=resolved_locale,
            fallback_locale=fallback_locale,
        )
        site_localization = self._get_localization_out(
            core_value=core_value,
            default_locale=default_locale,
            fallback_locale=fallback_locale,
            supported_locales=supported_locales,
        )
        theme_out = await self._get_theme_out(site_id=site_id, workspace_id=workspace_id, mode=mode)
        fonts_out = await self._get_fonts_out(site_id=site_id)

        return sites_schema.SiteRuntimeOut(
            site_id=site_id,
            mode=mode,
            theme=theme_out,
            fonts=fonts_out,
            site=site_identity,
            site_localization=site_localization,
            seo=seo_defaults,
        )
