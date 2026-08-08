from __future__ import annotations

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject


class PlatformSystemIdentitySettingsOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    instance_name: str
    description: str | None
    contact_email: str | None
    logo_url: str | None
    favicon_url: str | None


class PlatformSystemDomainSettingsOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    primary_domain: str
    console_domain: str
    reserved_labels: tuple[str, ...]


class PlatformLanguageCatalogEntryOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    locale: str
    language_name: str
    native_name: str
    flag_code: str = Field(min_length=2, max_length=2)
    enabled: bool
    is_default: bool
    sort_order: int = Field(ge=0)
    bundle_ready: bool


class PlatformRegionalSettingsOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    timezone: str
    date_format: str
    number_format: str


class PlatformSiteMetadataSettingsOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    default_title: str | None
    title_format: str
    default_description: str | None


class PlatformSystemSettingOptionOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    value: object
    label: str | None


class PlatformSystemSettingFieldOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    key: str
    type: str
    label: str
    description: str | None
    secret: bool
    options: tuple[PlatformSystemSettingOptionOut, ...]


class PlatformSystemSettingSectionOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    id: str
    title: str
    fields: tuple[PlatformSystemSettingFieldOut, ...]
    values: JsonObject
    secret_keys: tuple[str, ...]
    editable: bool


class PlatformSystemSettingsOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    revision: int = Field(ge=1)
    identity: PlatformSystemIdentitySettingsOut
    domains: PlatformSystemDomainSettingsOut
    languages: tuple[PlatformLanguageCatalogEntryOut, ...]
    regional: PlatformRegionalSettingsOut
    site_metadata: PlatformSiteMetadataSettingsOut
    sections: tuple[PlatformSystemSettingSectionOut, ...] = ()


class PlatformSystemSettingsWriteRequest(BaseSchema):
    model_config = ConfigDict(frozen=True)

    expected_revision: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=128)


class PlatformSystemSettingsSectionWrite(PlatformSystemSettingsWriteRequest):
    values: JsonObject


class PlatformSystemIdentitySettingsWrite(PlatformSystemSettingsWriteRequest):
    instance_name: str = Field(min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=500)
    contact_email: str | None = Field(default=None, max_length=320)
    logo_url: str | None = Field(default=None, max_length=2048)
    favicon_url: str | None = Field(default=None, max_length=2048)


class PlatformSystemDomainSettingsWrite(PlatformSystemSettingsWriteRequest):
    primary_domain: str = Field(min_length=1, max_length=255)
    console_subdomain: str = Field(min_length=1, max_length=63)
    reserved_labels: tuple[str, ...] = Field(min_length=1, max_length=32)


class PlatformRegionalSettingsWrite(PlatformSystemSettingsWriteRequest):
    timezone: str = Field(min_length=1, max_length=64)
    date_format: str = Field(min_length=1, max_length=32)
    number_format: str = Field(min_length=1, max_length=32)


class PlatformSiteMetadataSettingsWrite(PlatformSystemSettingsWriteRequest):
    default_title: str | None = Field(default=None, max_length=255)
    title_format: str = Field(min_length=1, max_length=255)
    default_description: str | None = Field(default=None, max_length=500)


class PlatformLanguageCatalogDraftWrite(BaseSchema):
    model_config = ConfigDict(frozen=True)

    expected_revision: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=128)
    enabled_locales: tuple[str, ...] = Field(min_length=1, max_length=8)
    default_locale: str = Field(min_length=2, max_length=16)


class PlatformLanguageCatalogDraftOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    draft_revision: int = Field(ge=1)
    status: str
    enabled_locales: tuple[str, ...]
    default_locale: str
    bundle_ready: bool


class PlatformLanguageCatalogImpactOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    draft_revision: int = Field(ge=1)
    affected_surfaces: tuple[str, ...]
    requires_product_todo: bool
    ready_to_publish: bool


class PlatformLanguageCatalogPublishRequest(BaseSchema):
    model_config = ConfigDict(frozen=True)

    expected_revision: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=128)
    draft_revision: int = Field(ge=1)
