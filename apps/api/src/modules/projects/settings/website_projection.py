from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from typing import cast

from pydantic import BaseModel, ConfigDict

from src.common.types.json_types import JsonObject
from src.modules.projects.settings.website_schema import (
    WebsiteDiscoverySettings,
    WebsiteIdentitySettings,
    WebsiteLocalizationSettings,
)


class WebsiteSettingsProjection[SettingsModel: BaseModel](BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, frozen=True)

    from_core: Callable[[JsonObject], SettingsModel]
    build_patch: Callable[[SettingsModel, SettingsModel], JsonObject]
    field_paths: dict[str, tuple[str, ...]]

    def etag(self, value: SettingsModel) -> str:
        canonical = json.dumps(
            value.model_dump(mode="json", by_alias=True),
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode()
        return f'"{hashlib.sha256(canonical).hexdigest()}"'

    def changed_paths(
        self,
        current: SettingsModel,
        replacement: SettingsModel,
    ) -> list[str]:
        current_values = current.model_dump(mode="json")
        replacement_values = replacement.model_dump(mode="json")
        return sorted(
            path
            for field_name, paths in self.field_paths.items()
            if current_values[field_name] != replacement_values[field_name]
            for path in paths
        )


_DEFAULT_TITLE_POLICY: JsonObject = {
    "parts": [
        {"kind": "token", "value": "pageTitle"},
        {"kind": "literal", "value": " - "},
        {"kind": "token", "value": "siteName"},
    ],
    "home_mode": "siteOnly",
    "dedupe": True,
}


def _section(core: JsonObject, section_name: str) -> JsonObject:
    value = core.get(section_name)
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise TypeError(f"{section_name} settings must be an object")
    return cast(JsonObject, value)


def _value_or_default(section: JsonObject, key: str, default):
    return section.get(key, default)


def _identity_from_core(core: JsonObject) -> WebsiteIdentitySettings:
    site = _section(core, "site")
    return WebsiteIdentitySettings.model_validate({
        "name": _value_or_default(site, "name", "Arclayer"),
        "name_i18n": _value_or_default(site, "name_i18n", None),
        "subtitle": _value_or_default(site, "subtitle", None),
        "description": _value_or_default(site, "description", None),
        "description_i18n": _value_or_default(site, "description_i18n", None),
        "contact_email": _value_or_default(site, "contact_email", None),
    })


def _discovery_from_core(core: JsonObject) -> WebsiteDiscoverySettings:
    site = _section(core, "site")
    seo = _section(core, "seo")
    return WebsiteDiscoverySettings.model_validate({
        "logo_url": _value_or_default(site, "logo_url", None),
        "logo_asset_id": _value_or_default(site, "logo_asset_id", None),
        "favicon_url": _value_or_default(site, "favicon_url", None),
        "favicon_asset_id": _value_or_default(site, "favicon_asset_id", None),
        "open_graph_image_url": seo.get("og_image_url", seo.get("open_graph_image_url")),
        "open_graph_image_asset_id": seo.get(
            "og_image_asset_id",
            seo.get("open_graph_image_asset_id"),
        ),
        "title_policy": _value_or_default(seo, "title_policy_v1", _DEFAULT_TITLE_POLICY),
        "robots_directive": _value_or_default(seo, "robots_directive", "index,follow"),
        "sitemap_enabled": _value_or_default(seo, "sitemap_enabled", True),
    })


def _localization_from_core(core: JsonObject) -> WebsiteLocalizationSettings:
    localization = _section(core, "site_localization")
    default_locale = _value_or_default(
        localization,
        "default_locale",
        _value_or_default(localization, "locale", "zh-CN"),
    )
    fallback_locale = _value_or_default(localization, "fallback_locale", "en-US")
    supported_locales = _value_or_default(
        localization,
        "supported_locales",
        [default_locale, fallback_locale],
    )
    return WebsiteLocalizationSettings.model_validate({
        "supported_locales": supported_locales,
        "default_locale": default_locale,
        "fallback_locale": fallback_locale,
        "timezone": _value_or_default(localization, "timezone", "Asia/Shanghai"),
        "use_browser_timezone": _value_or_default(
            localization,
            "use_browser_timezone",
            True,
        ),
        "date_format": _value_or_default(localization, "date_format", "YYYY-MM-DD"),
        "use_relative_datetime": _value_or_default(
            localization,
            "use_relative_datetime",
            True,
        ),
    })


def _identity_patch(
    current: WebsiteIdentitySettings,
    replacement: WebsiteIdentitySettings,
) -> JsonObject:
    values = {
        "name": replacement.name,
        "name_i18n": replacement.name_i18n,
        "subtitle": replacement.subtitle,
        "description": replacement.description,
        "description_i18n": replacement.description_i18n,
        "contact_email": (str(replacement.contact_email) if replacement.contact_email is not None else None),
    }
    site = {
        field_name: value
        for field_name, value in values.items()
        if getattr(current, field_name) != getattr(replacement, field_name)
    }
    return cast(JsonObject, {"site": site})


def _discovery_patch(
    current: WebsiteDiscoverySettings,
    replacement: WebsiteDiscoverySettings,
) -> JsonObject:
    site = {
        field_name: getattr(replacement, field_name)
        for field_name in ("logo_url", "logo_asset_id", "favicon_url", "favicon_asset_id")
        if getattr(current, field_name) != getattr(replacement, field_name)
    }
    seo: JsonObject = {}
    if current.open_graph_image_url != replacement.open_graph_image_url:
        seo["og_image_url"] = replacement.open_graph_image_url
        seo["open_graph_image_url"] = None
    if current.open_graph_image_asset_id != replacement.open_graph_image_asset_id:
        seo["og_image_asset_id"] = replacement.open_graph_image_asset_id
        seo["open_graph_image_asset_id"] = None
    if current.title_policy != replacement.title_policy:
        seo["title_policy_v1"] = replacement.title_policy.model_dump(mode="json", by_alias=False)
    if current.robots_directive != replacement.robots_directive:
        seo["robots_directive"] = replacement.robots_directive
    if current.sitemap_enabled != replacement.sitemap_enabled:
        seo["sitemap_enabled"] = replacement.sitemap_enabled
    return cast(JsonObject, {"site": site, "seo": seo})


def _localization_patch(
    current: WebsiteLocalizationSettings,
    replacement: WebsiteLocalizationSettings,
) -> JsonObject:
    localization: JsonObject = {}
    for field_name in (
        "supported_locales",
        "fallback_locale",
        "timezone",
        "use_browser_timezone",
        "date_format",
        "use_relative_datetime",
    ):
        if getattr(current, field_name) != getattr(replacement, field_name):
            localization[field_name] = cast(str | bool | list[str], getattr(replacement, field_name))
    if current.default_locale != replacement.default_locale:
        localization["default_locale"] = replacement.default_locale
        localization["locale"] = replacement.default_locale
    return {"site_localization": localization}


IDENTITY_SETTINGS_PROJECTION = WebsiteSettingsProjection[WebsiteIdentitySettings](
    from_core=_identity_from_core,
    build_patch=_identity_patch,
    field_paths={
        "name": ("site.name",),
        "name_i18n": ("site.name_i18n",),
        "subtitle": ("site.subtitle",),
        "description": ("site.description",),
        "description_i18n": ("site.description_i18n",),
        "contact_email": ("site.contact_email",),
    },
)

DISCOVERY_SETTINGS_PROJECTION = WebsiteSettingsProjection[WebsiteDiscoverySettings](
    from_core=_discovery_from_core,
    build_patch=_discovery_patch,
    field_paths={
        "logo_url": ("site.logo_url",),
        "logo_asset_id": ("site.logo_asset_id",),
        "favicon_url": ("site.favicon_url",),
        "favicon_asset_id": ("site.favicon_asset_id",),
        "open_graph_image_url": (
            "seo.og_image_url",
            "seo.open_graph_image_url",
        ),
        "open_graph_image_asset_id": (
            "seo.og_image_asset_id",
            "seo.open_graph_image_asset_id",
        ),
        "title_policy": ("seo.title_policy_v1",),
        "robots_directive": ("seo.robots_directive",),
        "sitemap_enabled": ("seo.sitemap_enabled",),
    },
)

LOCALIZATION_SETTINGS_PROJECTION = WebsiteSettingsProjection[WebsiteLocalizationSettings](
    from_core=_localization_from_core,
    build_patch=_localization_patch,
    field_paths={
        "supported_locales": ("site_localization.supported_locales",),
        "default_locale": (
            "site_localization.default_locale",
            "site_localization.locale",
        ),
        "fallback_locale": ("site_localization.fallback_locale",),
        "timezone": ("site_localization.timezone",),
        "use_browser_timezone": ("site_localization.use_browser_timezone",),
        "date_format": ("site_localization.date_format",),
        "use_relative_datetime": ("site_localization.use_relative_datetime",),
    },
)
