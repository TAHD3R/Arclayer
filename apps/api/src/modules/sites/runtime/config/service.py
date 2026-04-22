from __future__ import annotations

from typing import TYPE_CHECKING, Literal, cast
from uuid import UUID

from pydantic import ValidationError

from src.common.protocols.tortoise import HasProjectId
from src.core.exceptions import Conflict
from src.models.system.setting import SettingRecord
from src.modules.sites import schema as sites_schema
from src.modules.sites.namespaces.service import (
    RUNTIME_SETTING_NAMESPACE,
)
from src.modules.sites.runtime.localization.service import SiteRuntimeLocalizationMixin
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from src.settings.scopes import SCOPE_TYPE_PROJECT

if TYPE_CHECKING:
    from src.config import Settings
    from src.modules.sites.repository import SitesRepository

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

    async def _load_project_core_settings(self, *, project_id: UUID) -> dict[str, object]:
        rec = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_PROJECT,
            scope_id=project_id,
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
        default_title = self._pick_str(seo_section, "default_title")
        default_description = site_description or self._pick_str(seo_section, "default_description")
        title_policy_v1: dict[str, sites_schema.JsonValue] | None = None
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
            raw_policy = seo_section.get("title_policy_v1")
            if isinstance(raw_policy, dict):
                title_policy_v1 = cast(dict[str, sites_schema.JsonValue], raw_policy)
        if default_title is None and default_description is None and title_policy_v1 is None:
            return None
        try:
            return sites_schema.SiteSeoDefaultsOut(
                default_title=default_title,
                default_description=default_description,
                title_policy_v1=title_policy_v1,
            )
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
        project_id = UUID(str(cast(HasProjectId, site).project_id))
        core_value = await self._load_project_core_settings(project_id=project_id)

        default_locale, fallback_locale, supported_locales = await self._read_project_site_localization(
            project_id=project_id,
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
        fonts_out = await self._get_fonts_out(site_id=site_id)

        return sites_schema.SiteRuntimeOut(
            site_id=site_id,
            mode=mode,
            fonts=fonts_out,
            site=site_identity,
            site_localization=site_localization,
            seo=seo_defaults,
        )
