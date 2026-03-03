from __future__ import annotations

from typing import Any, Literal

from pydantic import ConfigDict, Field

from apps.api.src.common.schemas import BaseSchema
from apps.api.src.common.types.json_types import JsonValue
from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.modules.sites.design_document.schema import PageBlueprint


class SiteResolveOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    site_id: PublicUUID = Field(..., description="Resolved site id.")
    default_locale: str = Field(..., description="Default locale (e.g. zh-CN).")
    fallback_locale: str = Field(..., description="Fallback locale (e.g. en-US).")
    supported_locales: list[str] = Field(
        default_factory=list,
        description="Supported locales enabled for the site (BCP 47 tags).",
    )


class SiteThemeOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    css_vars: dict[str, str] = Field(
        default_factory=dict,
        description="Theme tokens as CSS variables (e.g. {'--color-primary': '#1677ff'}).",
    )
    theme_id: str | None = Field(default=None, description="Active theme id (npm-like).")
    version: str | None = Field(default=None, description="Active theme package version (semver).")
    tokens_css_url: str | None = Field(
        default=None,
        description="Theme tokens CSS URL (typically a public asset URL).",
    )
    base_css_url: str | None = Field(
        default=None,
        description="Optional theme base CSS URL (typically a public asset URL).",
    )
    preset_id: str | None = Field(default=None, description="Optional active preset id (theme-scoped).")
    config: dict[str, Any] | None = Field(default=None, description="Optional theme config (site-scoped, JSON).")


class SiteFontSourceOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    url: str = Field(..., description="Font file URL (typically self-hosted).")
    format: Literal["woff2", "woff", "truetype", "opentype"] | None = Field(default=None, description="Font format.")
    weight: str | None = Field(default=None, description="Font weight (CSS value).")
    style: Literal["normal", "italic", "oblique"] | None = Field(default=None, description="Font style.")


class SiteFontOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    family: str = Field(..., description="CSS font-family name.")
    display: Literal["auto", "block", "swap", "fallback", "optional"] | None = Field(
        default=None, description="font-display."
    )
    sources: list[SiteFontSourceOut] = Field(default_factory=list, description="Font sources.")


class SiteIdentityOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    name: str | None = Field(default=None, description="Site name.")
    subtitle: str | None = Field(default=None, description="Site subtitle.")
    description: str | None = Field(default=None, description="Site description.")
    url: str | None = Field(default=None, description="Site canonical URL.")
    logo_url: str | None = Field(default=None, description="Logo URL.")
    favicon_url: str | None = Field(default=None, description="Favicon URL.")
    contact_email: str | None = Field(default=None, description="Contact email.")


class SiteLocalizationOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    locale: str | None = Field(default=None, description="Default locale (e.g. zh-CN).")
    supported_locales: list[str] | None = Field(
        default=None,
        description="Supported locales enabled for the site (BCP 47 tags).",
    )
    default_locale: str | None = Field(default=None, description="Default locale (BCP 47).")
    fallback_locale: str | None = Field(default=None, description="Fallback locale (BCP 47).")
    timezone: str | None = Field(default=None, description="Default timezone (IANA, e.g. Asia/Shanghai).")
    date_format: str | None = Field(default=None, description="Default date format (e.g. YYYY-MM-DD).")


class SiteSeoDefaultsOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    default_title: str | None = Field(default=None, description="Default page title.")
    default_description: str | None = Field(default=None, description="Default page description.")
    title_policy_v1: dict[str, JsonValue] | None = Field(
        default=None,
        description="Structured title composition policy (v1).",
    )


class SiteRuntimeOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    site_id: PublicUUID = Field(..., description="Site id.")
    mode: Literal["public", "preview"] = Field(..., description="Runtime mode.")
    theme: SiteThemeOut = Field(..., description="Theme configuration.")
    fonts: list[SiteFontOut] = Field(default_factory=list, description="Self-hosted fonts.")
    site: SiteIdentityOut | None = Field(default=None, description="Site identity (public-safe).")
    site_localization: SiteLocalizationOut | None = Field(
        default=None,
        description="Site localization settings (public-safe).",
    )
    seo: SiteSeoDefaultsOut | None = Field(default=None, description="Default SEO config (public-safe).")


class SiteRouteMatchOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    kind: Literal["page", "route_template", "redirect", "not_found"] = Field(..., description="Route match kind.")
    params: dict[str, str] = Field(default_factory=dict, description="Route params (e.g. {'slug': 'hello'}).")
    redirect_to: str | None = Field(default=None, description="Redirect target pathname (internal only).")
    redirect_status: Literal[301, 302] | None = Field(default=None, description="Redirect status code.")
    page_id: PublicUUID | None = Field(default=None, description="Matched page id (kind=page only).")
    entry_id: PublicUUID | None = Field(default=None, description="Matched entry id (kind=route_template only).")
    variant_id: str | None = Field(
        default=None,
        description="Optional theme variant id used by the resolved revision (if any).",
    )
    revision: int | None = Field(
        default=None,
        ge=1,
        description="Revision used to render the returned document (if any).",
    )
    revision_state: Literal["draft", "published"] | None = Field(
        default=None,
        description="Revision state used to render the returned document (if any).",
    )
    draft_revision: int | None = Field(
        default=None,
        ge=0,
        description="Current draft revision pointer for this document (if available).",
    )
    published_revision: int | None = Field(
        default=None,
        ge=0,
        description="Current published revision pointer for this document (if available).",
    )


class SitePrimaryEntryOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Primary entry id.")
    data: dict[str, Any] = Field(
        default_factory=dict,
        description="Primary entry data snapshot (JSON). Typically shaped as { fields: {...} }.",
    )


class SiteRouteDataSourcesOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    primary_entry: SitePrimaryEntryOut | None = Field(
        default=None,
        alias="primaryEntry",
        description="Primary entry data source snapshot (if available).",
    )


class ContentRefIncludeErrorV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    code: Literal[
        "NOT_FOUND",
        "CYCLE_DETECTED",
        "DEPTH_LIMIT",
        "INVALID_SCHEMA",
        "STATE_FORBIDDEN",
    ] = Field(..., description="Structured error code.")
    message: str | None = Field(default=None, description="Human-readable error detail.")


class ContentRefIncludeV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_id: PublicUUID = Field(..., alias="entryId", description="Resolved entry public id.")
    resolved_state: Literal["draft", "published"] = Field(
        ...,
        alias="resolvedState",
        description="Actual resolved revision state.",
    )
    page_blueprint: PageBlueprint | None = Field(
        default=None,
        alias="pageBlueprint",
        description="Resolved PageBlueprint document.",
    )
    data: dict[str, JsonValue] | None = Field(default=None, description="Entry field values snapshot.")
    meta: dict[str, JsonValue] | None = Field(default=None, description="Entry metadata.")
    error: ContentRefIncludeErrorV1 | None = Field(default=None, description="Structured error if resolution failed.")


class ResolveWarningV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    code: str = Field(..., description="Warning code (e.g. CYCLE_DETECTED, DEPTH_LIMIT).")
    message: str = Field(..., description="Human-readable warning message.")
    ref_entry_id: str | None = Field(
        default=None,
        alias="refEntryId",
        description="Related entry id.",
    )
    ref_node_id: str | None = Field(
        default=None,
        alias="refNodeId",
        description="Related node id.",
    )


class SiteResolvedPageMetaOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    title: str | None = Field(default=None, description="Page title (metadata).")
    description: str | None = Field(default=None, description="Page description (metadata).")


class SiteRouteResolveOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    match: SiteRouteMatchOut = Field(..., description="Match result.")
    page_meta: SiteResolvedPageMetaOut | None = Field(
        default=None,
        alias="pageMeta",
        description="Resolved page metadata (title/description) used for SSR head.",
    )
    page_blueprint: PageBlueprint | None = Field(
        default=None,
        alias="pageBlueprint",
        description="Resolved PageBlueprint document (if any).",
    )
    data_sources: SiteRouteDataSourcesOut | None = Field(
        default=None,
        alias="dataSources",
        description="Optional binding data sources snapshot (v1).",
    )
    includes: dict[str, ContentRefIncludeV1] | None = Field(
        default=None,
        description="Flat map of content_ref includes. Key = '${entryId}:${resolvedState}'.",
    )
    warnings: list[ResolveWarningV1] | None = Field(
        default=None,
        description="Structured warnings from resolve (cycles, depth limits, etc.).",
    )
