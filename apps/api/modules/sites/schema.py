from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import ConfigDict, Field, field_validator

from apps.api.common.schemas import BaseSchema
from apps.api.common.types.json_types import JsonValue
from apps.api.common.types.public_uuid import PublicUUID
from apps.api.modules.sites.design_document_schema import PageBlueprint, PageBlueprintFragment

# ---- Sites API (public consumption, stub) ----


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


class SitePreviewTokenCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    ttl_seconds: int = Field(
        default=600,
        ge=60,
        le=60 * 60,
        description="Token TTL in seconds (stub-only).",
        examples=[600],
    )


class SitePreviewTokenOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    site_id: PublicUUID = Field(..., description="Site id.")
    token: str = Field(..., description="Preview token.")
    expires_at_ms: int = Field(..., description="Expiration timestamp in milliseconds (UTC).")


class SiteRouteDraftSaveIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    path: str = Field(..., description="Route pathname to save (e.g. /about).", examples=["/about"])
    page_blueprint: PageBlueprint = Field(
        ...,
        alias="pageBlueprint",
        description="Draft PageBlueprint payload.",
    )
    meta: dict[str, Any] | None = Field(default=None, description="Optional metadata payload (JSON).")
    style_overrides: dict[str, Any] | None = Field(default=None, description="Optional style overrides payload (JSON).")
    variant_id: str | None = Field(default=None, description="Optional theme variant id.")
    deps: dict[str, Any] | None = Field(default=None, description="Optional dependency snapshot payload (JSON).")
    expected_revision: int | None = Field(
        default=None,
        ge=0,
        description="Optional optimistic lock revision. If provided, must match current draft revision.",
        examples=[0],
    )


class SiteRouteDraftSaveOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    site_id: PublicUUID = Field(..., description="Site id.")
    path: str = Field(..., description="Saved pathname.")
    revision: int = Field(..., ge=1, description="Draft revision number.")
    saved_at_ms: int = Field(..., description="Saved timestamp in milliseconds (UTC).")


class SiteRoutePublishIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    path: str = Field(..., description="Route pathname to publish (e.g. /about).", examples=["/about"])
    revision: int | None = Field(
        default=None,
        ge=1,
        description="Draft revision number to publish. If omitted, publish the latest draft revision.",
        examples=[1],
    )


class SiteRoutePublishOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    site_id: PublicUUID = Field(..., description="Site id.")
    path: str = Field(..., description="Published pathname.")
    revision: int = Field(..., ge=1, description="Published revision number.")
    published_at_ms: int = Field(..., description="Published timestamp in milliseconds (UTC).")


class SitePageDraftSaveIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    page_blueprint: PageBlueprint = Field(
        ...,
        alias="pageBlueprint",
        description="Draft PageBlueprint payload.",
    )
    meta: dict[str, Any] | None = Field(default=None, description="Optional metadata payload (JSON).")
    style_overrides: dict[str, Any] | None = Field(default=None, description="Optional style overrides payload (JSON).")
    variant_id: str | None = Field(default=None, description="Optional theme variant id.")
    deps: dict[str, Any] | None = Field(default=None, description="Optional dependency snapshot payload (JSON).")
    expected_revision: int | None = Field(
        default=None,
        ge=0,
        description="Optional optimistic lock revision. If provided, must match current draft revision.",
        examples=[0],
    )


class SitePageDraftSaveOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    site_id: PublicUUID = Field(..., description="Site id.")
    page_id: PublicUUID = Field(..., description="Page id.")
    path: str = Field(..., description="Page pathname (stable public URL).")
    revision: int = Field(..., ge=1, description="Draft revision number.")
    saved_at_ms: int = Field(..., description="Saved timestamp in milliseconds (UTC).")


class SitePagePublishIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    revision: int | None = Field(
        default=None,
        ge=1,
        description="Draft revision number to publish. If omitted, publish the latest draft revision.",
        examples=[1],
    )


class SitePagePublishOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    site_id: PublicUUID = Field(..., description="Site id.")
    page_id: PublicUUID = Field(..., description="Page id.")
    path: str = Field(..., description="Page pathname (stable public URL).")
    revision: int = Field(..., ge=1, description="Published revision number.")
    published_at_ms: int = Field(..., description="Published timestamp in milliseconds (UTC).")


class SitePageUnpublishOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    site_id: PublicUUID = Field(..., description="Site id.")
    page_id: PublicUUID = Field(..., description="Page id.")
    path: str = Field(..., description="Page pathname (stable public URL).")
    unpublished_at_ms: int = Field(..., description="Unpublished timestamp in milliseconds (UTC).")


class SitePresenceHeartbeatIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    doc_key: str = Field(
        ...,
        description="Document key (e.g. 'route:/about' or 'page:<uuid>').",
        examples=["route:/about"],
    )
    client_id: str = Field(
        ...,
        min_length=6,
        max_length=128,
        description="Client instance id (random, stable within a browser tab).",
        examples=["c_123456"],
    )
    actor: dict[str, str] | None = Field(
        default=None,
        description="Optional actor metadata (e.g. displayName).",
        examples=[{"displayName": "Alice"}],
    )


class SitePresenceHeartbeatOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    expires_at_ms: int = Field(..., description="Presence TTL expiration timestamp in milliseconds (UTC).")


class SitePresenceRecordOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    client_id: str = Field(..., description="Client instance id.")
    updated_at_ms: int = Field(..., description="Last heartbeat timestamp in milliseconds (UTC).")
    actor: dict[str, str] | None = Field(default=None, description="Actor metadata (optional).")


class SitePresenceListOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    doc_key: str = Field(..., description="Document key.")
    items: list[SitePresenceRecordOut] = Field(default_factory=list, description="Presence records.")


class SiteSettingGetOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    namespace: str = Field(..., description="Setting namespace.")
    value: dict[str, Any] | None = Field(default=None, description="Setting value (JSON).")


class SiteSettingUpsertIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    value: dict[str, Any] | None = Field(default=None, description="Setting value (JSON).")


class SiteStyleOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    namespace: str = Field(..., description="Style setting namespace.")
    value: dict[str, Any] | None = Field(default=None, description="Site style payload (JSON).")


class SiteStyleUpsertIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    value: dict[str, Any] | None = Field(default=None, description="Site style payload (JSON).")


class SiteGlobalSectionOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., min_length=1, max_length=128, description="Global section id.")
    name: str = Field(..., min_length=1, max_length=128, description="Global section display name.")
    kind: str = Field(..., min_length=1, max_length=64, description="Global section kind key.")
    enabled: bool = Field(default=True, description="Whether this global section is enabled.")
    payload: dict[str, Any] | None = Field(default=None, description="Global section payload (JSON).")
    updated_at_ms: int = Field(..., ge=0, description="Last update timestamp in milliseconds (UTC).")


class SiteGlobalSectionsOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    items: list[SiteGlobalSectionOut] = Field(default_factory=list, description="Global sections.")


class SiteGlobalSectionCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=128, description="Global section display name.")
    kind: str = Field(..., min_length=1, max_length=64, description="Global section kind key.")
    enabled: bool = Field(default=True, description="Whether this global section is enabled.")
    payload: dict[str, Any] | None = Field(default=None, description="Global section payload (JSON).")


class SiteGlobalSectionUpdateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=128, description="Global section display name.")
    kind: str | None = Field(default=None, min_length=1, max_length=64, description="Global section kind key.")
    enabled: bool | None = Field(default=None, description="Whether this global section is enabled.")
    payload: dict[str, Any] | None = Field(default=None, description="Global section payload (JSON).")


class SiteGlobalSectionDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., min_length=1, max_length=128, description="Deleted global section id.")


class SiteVisualSitemapNodeOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., min_length=1, max_length=128, description="Visual sitemap node id.")
    title: str = Field(..., description="Visual sitemap node title.")
    path: str = Field(..., description="Resolved unique pathname.")
    page_id: PublicUUID | None = Field(default=None, description="Linked page id.")
    children: list[SiteVisualSitemapNodeOut] = Field(default_factory=list, description="Child nodes.")


class SiteVisualSitemapOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    nodes: list[SiteVisualSitemapNodeOut] = Field(default_factory=list, description="Sitemap tree nodes.")
    updated_at_ms: int = Field(..., ge=0, description="Tree update timestamp in milliseconds (UTC).")


class SitePageUserSummaryOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="User id.")
    display_name: str | None = Field(default=None, description="Display name.")
    email: str | None = Field(default=None, description="Email.")
    avatar_url: str | None = Field(default=None, description="Avatar URL.")


class SitePageTreeNodeOut(BaseSchema):
    """
    Site page tree node (IA structure).

    Notes:
    - This is a tree node output schema, not an ORM schema. We build it explicitly in service layer.
    - Keep it stable and minimal to avoid coupling Admin UI to internal DB fields.
    """

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Page id.")
    title: str | None = Field(default=None, max_length=256, description="Page title.")
    description: str | None = Field(default=None, max_length=1024, description="Page description.")
    path: str = Field(..., description="Resolved unique pathname (e.g. /about).")
    parent_id: PublicUUID | None = Field(default=None, description="Parent page id (null for root).")
    sort_order: int = Field(default=0, description="Sort order within siblings.")
    visibility: Literal["public", "private"] = Field(..., description="Page visibility.")
    draft_revision: int = Field(default=0, ge=0, description="Current draft revision pointer.")
    published_revision: int | None = Field(default=None, ge=0, description="Current published revision pointer.")
    updated_at: datetime | None = Field(default=None, description="Last update time (UTC).")
    updated_by: SitePageUserSummaryOut | None = Field(
        default=None,
        description="Last updated-by user summary.",
    )
    children: list[SitePageTreeNodeOut] = Field(default_factory=list, description="Child pages.")


class SitePageCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=256, description="Page title.")
    description: str | None = Field(default=None, max_length=1024, description="Page description.")
    path: str = Field(..., description="Unique pathname (e.g. /about).", examples=["/about"])
    parent_id: PublicUUID | None = Field(default=None, description="Optional parent page id.")
    sort_order: int = Field(default=0, description="Sort order within siblings.")
    visibility: Literal["public", "private"] = Field(default="public", description="Page visibility.")


class SitePageUpdateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=256, description="Page title.")
    description: str | None = Field(default=None, max_length=1024, description="Page description.")
    path: str | None = Field(default=None, description="Unique pathname (e.g. /about).", examples=["/about"])
    parent_id: PublicUUID | None = Field(default=None, description="Parent page id (null for root).")
    sort_order: int | None = Field(default=None, description="Sort order within siblings.")
    visibility: Literal["public", "private"] | None = Field(default=None, description="Page visibility.")


class SitePageMoveIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    parent_id: PublicUUID | None = Field(default=None, description="New parent page id (null for root).")
    sort_order: int = Field(default=0, description="New sort order within siblings.")


class SitePageDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    page_id: PublicUUID = Field(..., description="Deleted page id.")


class SiteRouteTemplateOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Route template id.")
    site_id: PublicUUID = Field(..., description="Site id.")
    path_pattern: str = Field(..., description="Path pattern (e.g. /blog/:slug).")
    entry_type_id: PublicUUID = Field(..., description="Entry type id.")
    entry_type_code: str = Field(..., description="Entry type code (e.g. blog_post).")
    template_page_revision_id: PublicUUID | None = Field(
        default=None, description="Optional template page revision id used as layout skeleton."
    )
    is_active: bool = Field(default=True, description="Whether the template is active.")


class SiteRouteTemplateCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    path_pattern: str = Field(..., description="Path pattern (e.g. /blog/:slug).", examples=["/blog/:slug"])
    entry_type_code: str = Field(..., min_length=1, max_length=64, description="Entry type code (e.g. blog_post).")
    template_page_revision_id: PublicUUID | None = Field(
        default=None, description="Optional template page revision id used as layout skeleton."
    )
    is_active: bool = Field(default=True, description="Whether the template is active.")


class SiteRouteTemplateUpdateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    path_pattern: str | None = Field(default=None, description="Path pattern (e.g. /blog/:slug).")
    entry_type_code: str | None = Field(default=None, min_length=1, max_length=64, description="Entry type code.")
    template_page_revision_id: PublicUUID | None = Field(
        default=None, description="Optional template page revision id used as layout skeleton."
    )
    is_active: bool | None = Field(default=None, description="Whether the template is active.")


class SiteRouteTemplateDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    template_id: PublicUUID = Field(..., description="Deleted route template id.")


class SitePageRevisionOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    page_id: PublicUUID = Field(..., description="Page id.")
    state: Literal["draft", "published"] = Field(..., description="Revision state.")
    revision: int = Field(..., ge=1, description="Revision number.")
    created_at_ms: int = Field(..., description="Revision created timestamp in milliseconds (UTC).")
    page_blueprint: PageBlueprint = Field(
        ...,
        alias="pageBlueprint",
        description="PageBlueprint payload.",
    )
    meta: dict[str, Any] | None = Field(default=None, description="Optional metadata payload (JSON).")
    style_overrides: dict[str, Any] | None = Field(default=None, description="Optional style overrides payload (JSON).")
    variant_id: str | None = Field(default=None, description="Optional theme variant id.")
    deps: dict[str, Any] | None = Field(default=None, description="Optional dependency snapshot payload (JSON).")


class SitePageRollbackIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    revision: int = Field(..., ge=1, description="Target revision number to rollback to.")
    target: Literal["draft", "published"] = Field(..., description="Which revision pointer to rollback.")


class SitePageRollbackOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    page_id: PublicUUID = Field(..., description="Page id.")
    target: Literal["draft", "published"] = Field(..., description="Which revision pointer was rolled back.")
    from_revision: int | None = Field(default=None, ge=1, description="Previous revision pointer value (if any).")
    to_revision: int = Field(..., ge=1, description="New revision pointer value.")
    rolled_back_at_ms: int = Field(..., description="Rollback timestamp in milliseconds (UTC).")


class SiteEntryRevisionOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_id: PublicUUID = Field(..., description="Entry id.")
    state: Literal["draft", "published"] = Field(..., description="Revision state.")
    revision: int = Field(..., ge=1, description="Revision number.")
    created_at_ms: int = Field(..., description="Revision created timestamp in milliseconds (UTC).")
    page_blueprint: PageBlueprint | None = Field(
        default=None,
        alias="pageBlueprint",
        description="Optional PageBlueprint payload.",
    )
    data: dict[str, Any] | None = Field(default=None, description="Optional entry data payload (JSON).")
    meta: dict[str, Any] | None = Field(default=None, description="Optional metadata payload (JSON).")
    style_overrides: dict[str, Any] | None = Field(default=None, description="Optional style overrides payload (JSON).")
    variant_id: str | None = Field(default=None, description="Optional theme variant id.")
    deps: dict[str, Any] | None = Field(default=None, description="Optional dependency snapshot payload (JSON).")


class SiteEntryRollbackIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    revision: int = Field(..., ge=1, description="Target revision number to rollback to.")
    target: Literal["draft", "published"] = Field(..., description="Which revision pointer to rollback.")


class SiteEntryRollbackOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_id: PublicUUID = Field(..., description="Entry id.")
    target: Literal["draft", "published"] = Field(..., description="Which revision pointer was rolled back.")
    from_revision: int | None = Field(default=None, ge=1, description="Previous revision pointer value (if any).")
    to_revision: int = Field(..., ge=1, description="New revision pointer value.")
    rolled_back_at_ms: int = Field(..., description="Rollback timestamp in milliseconds (UTC).")


class SiteEntryDraftSaveIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_type_code: str = Field(..., min_length=1, max_length=64, description="Entry type code (e.g. blog_post).")
    slug: str = Field(..., min_length=1, max_length=256, description="Entry slug (unique within entry type).")
    page_blueprint: PageBlueprint | None = Field(
        default=None,
        alias="pageBlueprint",
        description="Optional PageBlueprint payload.",
    )
    data: dict[str, Any] | None = Field(default=None, description="Optional entry data payload (JSON).")
    meta: dict[str, Any] | None = Field(default=None, description="Optional metadata payload (JSON).")
    style_overrides: dict[str, Any] | None = Field(default=None, description="Optional style overrides payload (JSON).")
    variant_id: str | None = Field(default=None, description="Optional theme variant id.")
    deps: dict[str, Any] | None = Field(default=None, description="Optional dependency snapshot payload (JSON).")
    expected_revision: int | None = Field(
        default=None,
        ge=0,
        description="Optional optimistic lock revision. If provided, must match current draft revision.",
    )


class SiteEntryDraftSaveOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    site_id: PublicUUID = Field(..., description="Site id.")
    entry_id: PublicUUID = Field(..., description="Entry id.")
    entry_type_code: str = Field(..., description="Entry type code.")
    slug: str = Field(..., description="Entry slug.")
    revision: int = Field(..., ge=1, description="Draft revision number.")
    saved_at_ms: int = Field(..., description="Saved timestamp in milliseconds (UTC).")


class SiteEntryPublishIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_type_code: str = Field(..., min_length=1, max_length=64, description="Entry type code (e.g. blog_post).")
    slug: str = Field(..., min_length=1, max_length=256, description="Entry slug (unique within entry type).")
    revision: int | None = Field(
        default=None,
        ge=1,
        description="Draft revision number to publish. If omitted, publish the latest draft revision.",
    )


class SiteEntryPublishOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    site_id: PublicUUID = Field(..., description="Site id.")
    entry_id: PublicUUID = Field(..., description="Entry id.")
    entry_type_code: str = Field(..., description="Entry type code.")
    slug: str = Field(..., description="Entry slug.")
    revision: int = Field(..., ge=1, description="Published revision number.")
    published_at_ms: int = Field(..., description="Published timestamp in milliseconds (UTC).")


class SiteEntryUnpublishIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_type_code: str = Field(..., min_length=1, max_length=64, description="Entry type code (e.g. blog_post).")
    slug: str = Field(..., min_length=1, max_length=256, description="Entry slug (unique within entry type).")


class SiteEntryUnpublishOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    site_id: PublicUUID = Field(..., description="Site id.")
    entry_id: PublicUUID = Field(..., description="Entry id.")
    entry_type_code: str = Field(..., description="Entry type code.")
    slug: str = Field(..., description="Entry slug.")
    unpublished_at_ms: int = Field(..., description="Unpublished timestamp in milliseconds (UTC).")


class SiteEntryTypeOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Entry type id.")
    site_id: PublicUUID = Field(..., description="Site id.")
    code: str = Field(..., description="Entry type code.")
    name: str = Field(..., description="Entry type display name.")
    fields_schema: dict[str, Any] | None = Field(default=None, description="Entry field schema (JSON).")


class SiteEntryTypeCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    code: str = Field(..., min_length=1, max_length=64, description="Entry type code (e.g. blog_post).")
    name: str = Field(..., min_length=1, max_length=128, description="Entry type display name.")
    fields_schema: dict[str, Any] | None = Field(default=None, description="Entry field schema (JSON).")


class SiteEntryTypeUpdateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=128, description="Entry type display name.")
    fields_schema: dict[str, Any] | None = Field(default=None, description="Entry field schema (JSON).")


class SiteEntryTypeDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_type_id: PublicUUID = Field(..., description="Deleted entry type id.")


class SiteEntryOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Entry id.")
    site_id: PublicUUID = Field(..., description="Site id.")
    entry_type_id: PublicUUID = Field(..., description="Entry type id.")
    entry_type_code: str = Field(..., description="Entry type code.")
    slug: str = Field(..., description="Entry slug.")
    draft_revision: int = Field(default=0, ge=0, description="Current draft revision pointer.")
    published_revision: int | None = Field(default=None, ge=1, description="Current published revision pointer.")


class SiteEntryCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_type_code: str = Field(..., min_length=1, max_length=64, description="Entry type code (e.g. blog_post).")
    slug: str = Field(..., min_length=1, max_length=256, description="Entry slug (unique within entry type).")


class SiteEntryUpdateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    slug: str | None = Field(default=None, min_length=1, max_length=256, description="Entry slug (unique).")


class SiteEntryDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_id: PublicUUID = Field(..., description="Deleted entry id.")


# ---- Site Patterns ----


class SitePatternOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", from_attributes=True)

    id: PublicUUID = Field(..., description="Pattern id.")
    site_id: PublicUUID = Field(..., description="Site id.")
    code: str = Field(..., description="Pattern code (unique within site).")
    label: dict[str, str] = Field(
        default_factory=dict,
        validation_alias="label_json",
        description="Localized label map.",
    )
    category: str = Field(..., description="Pattern category.")
    preview_image_url: str | None = Field(default=None, description="Preview image URL.")
    page_blueprint_fragment: PageBlueprintFragment = Field(
        default_factory=lambda: PageBlueprintFragment(version=1),
        validation_alias="page_blueprint_fragment_json",
        description="Reusable PageBlueprint fragment (serialized JSON).",
    )
    created_at_ms: int = Field(
        ..., validation_alias="created_at", description="Created timestamp in milliseconds (UTC)."
    )

    @field_validator("created_at_ms", mode="before")
    @classmethod
    def _dt_to_ms(cls, v: datetime | int) -> int:
        if isinstance(v, datetime):
            return int(v.timestamp() * 1000)
        return v


class SitePatternCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    code: str = Field(..., min_length=1, max_length=128, description="Pattern code (unique within site).")
    label: dict[str, str] = Field(default_factory=dict, description="Localized label map.")
    category: str = Field(default="custom", max_length=64, description="Pattern category.")
    preview_image_url: str | None = Field(default=None, max_length=512, description="Preview image URL.")
    page_blueprint_fragment: PageBlueprintFragment = Field(
        default_factory=lambda: PageBlueprintFragment(version=1),
        description="Reusable PageBlueprint fragment (serialized JSON).",
    )


class SitePatternUpdateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    label: dict[str, str] | None = Field(default=None, description="Localized label map.")
    category: str | None = Field(default=None, max_length=64, description="Pattern category.")
    preview_image_url: str | None = Field(default=None, max_length=512, description="Preview image URL.")
    page_blueprint_fragment: PageBlueprintFragment | None = Field(
        default=None,
        description="Reusable PageBlueprint fragment (serialized JSON).",
    )


class SitePatternDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    pattern_id: PublicUUID = Field(..., description="Deleted pattern id.")


SitePageTreeNodeOut.model_rebuild()
SiteVisualSitemapNodeOut.model_rebuild()
