from __future__ import annotations

from typing import Annotated, Literal, Self

from pydantic import ConfigDict, EmailStr, Field, field_validator, model_validator

from src.common.schemas import BaseSchema


class WebsiteTitleLiteralPart(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: Literal["literal"]
    value: str = Field(max_length=64)


class WebsiteTitleTokenPart(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: Literal["token"]
    value: Literal["pageTitle", "siteName", "siteSubtitle"]


WebsiteTitlePart = Annotated[
    WebsiteTitleLiteralPart | WebsiteTitleTokenPart,
    Field(discriminator="kind"),
]


class WebsiteTitlePolicy(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    parts: list[WebsiteTitlePart] = Field(min_length=1, max_length=32)
    home_mode: Literal["siteOnly", "policy"] = "siteOnly"
    dedupe: bool = True

    @model_validator(mode="after")
    def require_token(self) -> Self:
        if not any(part.kind == "token" for part in self.parts):
            raise ValueError("title policy requires at least one token")
        return self


class WebsiteIdentitySettings(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str = Field(min_length=1, max_length=128)
    name_i18n: dict[str, str] | None = None
    subtitle: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=200)
    description_i18n: dict[str, str] | None = None
    contact_email: EmailStr | None = None

    @field_validator("subtitle", "description", "contact_email", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("name_i18n", "description_i18n")
    @classmethod
    def validate_localized_text(cls, value: dict[str, str] | None) -> dict[str, str] | None:
        if value is None:
            return None
        if any(not locale.strip() or not text.strip() for locale, text in value.items()):
            raise ValueError("localized text keys and values must be non-empty")
        return value


class WebsiteDiscoverySettings(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    logo_url: str | None = None
    logo_asset_id: str | None = None
    favicon_url: str | None = None
    favicon_asset_id: str | None = None
    open_graph_image_url: str | None = None
    open_graph_image_asset_id: str | None = None
    title_policy: WebsiteTitlePolicy
    robots_directive: str = Field(min_length=1)
    sitemap_enabled: bool

    @field_validator(
        "logo_url",
        "logo_asset_id",
        "favicon_url",
        "favicon_asset_id",
        "open_graph_image_url",
        "open_graph_image_asset_id",
        mode="before",
    )
    @classmethod
    def normalize_optional_text(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value


def normalize_locale_tag(value: str) -> str:
    parts = [part for part in value.strip().replace("_", "-").split("-") if part]
    if not parts:
        raise ValueError("locale must be non-empty")
    parts[0] = parts[0].lower()
    if len(parts) >= 2 and len(parts[1]) == 2:
        parts[1] = parts[1].upper()
    return "-".join(parts)


class WebsiteLocalizationSettings(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    supported_locales: list[str] = Field(min_length=1)
    default_locale: str = Field(min_length=1)
    fallback_locale: str = Field(min_length=1)
    timezone: str = Field(min_length=1)
    use_browser_timezone: bool
    date_format: str = Field(min_length=1)
    use_relative_datetime: bool

    @field_validator("default_locale", "fallback_locale", mode="before")
    @classmethod
    def normalize_locale(cls, value: object) -> object:
        return normalize_locale_tag(value) if isinstance(value, str) else value

    @field_validator("supported_locales", mode="before")
    @classmethod
    def normalize_supported_locales(cls, value: object) -> object:
        if not isinstance(value, list):
            return value
        normalized = [normalize_locale_tag(item) if isinstance(item, str) else item for item in value]
        if len({item.lower() for item in normalized if isinstance(item, str)}) != len(normalized):
            raise ValueError("supported locales must be unique")
        return normalized

    @model_validator(mode="after")
    def require_selected_locales(self) -> Self:
        supported = {locale.lower() for locale in self.supported_locales}
        if self.default_locale.lower() not in supported:
            raise ValueError("default locale must be supported")
        if self.fallback_locale.lower() not in supported:
            raise ValueError("fallback locale must be supported")
        return self


class WebsiteIdentitySettingsDetail(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    value: WebsiteIdentitySettings
    etag: str = Field(min_length=1)


class WebsiteDiscoverySettingsDetail(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    value: WebsiteDiscoverySettings
    etag: str = Field(min_length=1)


class WebsiteLocalizationSettingsDetail(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    value: WebsiteLocalizationSettings
    etag: str = Field(min_length=1)
