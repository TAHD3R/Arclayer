from __future__ import annotations

from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import AliasChoices, ConfigDict, Field

from apps.api.common.schemas import BaseSchema

# ---- Block Protocol (server-side, minimal for stub) ----

LocaleCode = str
LocalizedString = dict[LocaleCode, str]


class DocumentMeta(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    title: LocalizedString | None = Field(default=None, description="Document title (field-level i18n map).")
    description: LocalizedString | None = Field(
        default=None, description="Document description (field-level i18n map)."
    )


class ContainerBlockProps(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    as_tag: Literal["div", "section", "article"] | None = Field(
        default=None,
        validation_alias=AliasChoices("as", "asTag", "as_tag"),
        serialization_alias="as",
        description="Semantic HTML wrapper tag.",
    )
    class_name: str | None = Field(default=None, alias="className", description="Optional CSS class name.")


class HeadingBlockProps(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    level: int = Field(..., ge=1, le=6, description="Heading level (1-6).")
    text: LocalizedString = Field(..., description="Heading text (field-level i18n map).")
    align: Literal["left", "center", "right"] | None = Field(default=None, description="Optional text alignment.")


class ParagraphBlockProps(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    text: LocalizedString = Field(..., description="Paragraph text (field-level i18n map).")
    align: Literal["left", "center", "right"] | None = Field(default=None, description="Optional text alignment.")


class DividerBlockProps(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    variant: Literal["default", "subtle"] | None = Field(default=None, description="Divider visual variant.")


class ContainerBlock(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., description="Block id.")
    type: Literal["container"] = Field(..., description="Block type.")
    props: ContainerBlockProps = Field(..., description="Block props.")
    children: list[BlockNode] | None = Field(default=None, description="Child blocks.")


class HeadingBlock(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., description="Block id.")
    type: Literal["heading"] = Field(..., description="Block type.")
    props: HeadingBlockProps = Field(..., description="Block props.")


class ParagraphBlock(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., description="Block id.")
    type: Literal["paragraph"] = Field(..., description="Block type.")
    props: ParagraphBlockProps = Field(..., description="Block props.")


class DividerBlock(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., description="Block id.")
    type: Literal["divider"] = Field(..., description="Block type.")
    props: DividerBlockProps = Field(..., description="Block props.")


BlockNode = Annotated[
    ContainerBlock | HeadingBlock | ParagraphBlock | DividerBlock,
    Field(discriminator="type"),
]


class DocumentIR(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = Field(1, description="Document protocol version.")
    meta: DocumentMeta | None = Field(default=None, description="SEO metadata.")
    blocks: list[BlockNode] = Field(default_factory=list, description="Content blocks.")


# ---- Sites API (public consumption, stub) ----


class SiteResolveOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    site_id: str = Field(..., description="Resolved site id.")
    default_locale: str = Field(..., description="Default locale (e.g. zh-CN).")
    fallback_locale: str = Field(..., description="Fallback locale (e.g. en-US).")


class SiteThemeOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

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
    model_config = ConfigDict(extra="forbid")

    url: str = Field(..., description="Font file URL (typically self-hosted).")
    format: Literal["woff2", "woff", "truetype", "opentype"] | None = Field(default=None, description="Font format.")
    weight: str | None = Field(default=None, description="Font weight (CSS value).")
    style: Literal["normal", "italic", "oblique"] | None = Field(default=None, description="Font style.")


class SiteFontOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    family: str = Field(..., description="CSS font-family name.")
    display: Literal["auto", "block", "swap", "fallback", "optional"] | None = Field(
        default=None, description="font-display."
    )
    sources: list[SiteFontSourceOut] = Field(default_factory=list, description="Font sources.")


class SiteRuntimeOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    site_id: str = Field(..., description="Site id.")
    mode: Literal["public", "preview"] = Field(..., description="Runtime mode.")
    theme: SiteThemeOut = Field(..., description="Theme configuration.")
    fonts: list[SiteFontOut] = Field(default_factory=list, description="Self-hosted fonts.")


class SiteRouteMatchOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["page", "route_template", "redirect", "not_found"] = Field(..., description="Route match kind.")
    params: dict[str, str] = Field(default_factory=dict, description="Route params (e.g. {'slug': 'hello'}).")
    redirect_to: str | None = Field(default=None, description="Redirect target pathname (internal only).")
    redirect_status: Literal[301, 302] | None = Field(default=None, description="Redirect status code.")
    page_id: str | None = Field(default=None, description="Matched page id (kind=page only).")
    entry_id: str | None = Field(default=None, description="Matched entry id (kind=route_template only).")
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


class SiteRouteResolveOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    match: SiteRouteMatchOut = Field(..., description="Match result.")
    document: DocumentIR | None = Field(default=None, description="Resolved document (if any).")


class SitePreviewTokenCreateIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    ttl_seconds: int = Field(
        default=600,
        ge=60,
        le=60 * 60,
        description="Token TTL in seconds (stub-only).",
        examples=[600],
    )


class SitePreviewTokenOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    site_id: str = Field(..., description="Site id.")
    token: str = Field(..., description="Preview token.")
    expires_at_ms: int = Field(..., description="Expiration timestamp in milliseconds (UTC).")


class SiteRouteDraftSaveIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    path: str = Field(..., description="Route pathname to save (e.g. /about).", examples=["/about"])
    document: DocumentIR = Field(..., description="Draft document payload.")
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
    model_config = ConfigDict(extra="forbid")

    site_id: str = Field(..., description="Site id.")
    path: str = Field(..., description="Saved pathname.")
    revision: int = Field(..., ge=1, description="Draft revision number.")
    saved_at_ms: int = Field(..., description="Saved timestamp in milliseconds (UTC).")


class SiteRoutePublishIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    path: str = Field(..., description="Route pathname to publish (e.g. /about).", examples=["/about"])
    revision: int | None = Field(
        default=None,
        ge=1,
        description="Draft revision number to publish. If omitted, publish the latest draft revision.",
        examples=[1],
    )


class SiteRoutePublishOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    site_id: str = Field(..., description="Site id.")
    path: str = Field(..., description="Published pathname.")
    revision: int = Field(..., ge=1, description="Published revision number.")
    published_at_ms: int = Field(..., description="Published timestamp in milliseconds (UTC).")


class SitePageDraftSaveIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    document: DocumentIR = Field(..., description="Draft document payload.")
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
    model_config = ConfigDict(extra="forbid")

    site_id: str = Field(..., description="Site id.")
    page_id: str = Field(..., description="Page id.")
    path: str = Field(..., description="Page pathname (stable public URL).")
    revision: int = Field(..., ge=1, description="Draft revision number.")
    saved_at_ms: int = Field(..., description="Saved timestamp in milliseconds (UTC).")


class SitePagePublishIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    revision: int | None = Field(
        default=None,
        ge=1,
        description="Draft revision number to publish. If omitted, publish the latest draft revision.",
        examples=[1],
    )


class SitePagePublishOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    site_id: str = Field(..., description="Site id.")
    page_id: str = Field(..., description="Page id.")
    path: str = Field(..., description="Page pathname (stable public URL).")
    revision: int = Field(..., ge=1, description="Published revision number.")
    published_at_ms: int = Field(..., description="Published timestamp in milliseconds (UTC).")


class SitePageUnpublishOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    site_id: str = Field(..., description="Site id.")
    page_id: str = Field(..., description="Page id.")
    path: str = Field(..., description="Page pathname (stable public URL).")
    unpublished_at_ms: int = Field(..., description="Unpublished timestamp in milliseconds (UTC).")


class SitePresenceHeartbeatIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

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
    model_config = ConfigDict(extra="forbid")

    expires_at_ms: int = Field(..., description="Presence TTL expiration timestamp in milliseconds (UTC).")


class SitePresenceRecordOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    client_id: str = Field(..., description="Client instance id.")
    updated_at_ms: int = Field(..., description="Last heartbeat timestamp in milliseconds (UTC).")
    actor: dict[str, str] | None = Field(default=None, description="Actor metadata (optional).")


class SitePresenceListOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    doc_key: str = Field(..., description="Document key.")
    items: list[SitePresenceRecordOut] = Field(default_factory=list, description="Presence records.")


class SiteSettingGetOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    namespace: str = Field(..., description="Setting namespace.")
    value: dict[str, Any] | None = Field(default=None, description="Setting value (JSON).")


class SiteSettingUpsertIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    value: dict[str, Any] | None = Field(default=None, description="Setting value (JSON).")


class SitePageTreeNodeOut(BaseSchema):
    """
    Site page tree node (IA structure).

    Notes:
    - This is a tree node output schema, not an ORM schema. We build it explicitly in service layer.
    - Keep it stable and minimal to avoid coupling Admin UI to internal DB fields.
    """

    model_config = ConfigDict(extra="forbid")

    id: UUID = Field(..., description="Page id.")
    path: str = Field(..., description="Resolved unique pathname (e.g. /about).")
    parent_id: UUID | None = Field(default=None, description="Parent page id (null for root).")
    sort_order: int = Field(default=0, description="Sort order within siblings.")
    visibility: Literal["public", "private"] = Field(..., description="Page visibility.")
    draft_revision: int = Field(default=0, ge=0, description="Current draft revision pointer.")
    published_revision: int | None = Field(default=None, ge=0, description="Current published revision pointer.")
    children: list[SitePageTreeNodeOut] = Field(default_factory=list, description="Child pages.")


class SitePageCreateIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    path: str = Field(..., description="Unique pathname (e.g. /about).", examples=["/about"])
    parent_id: UUID | None = Field(default=None, description="Optional parent page id.")
    sort_order: int = Field(default=0, description="Sort order within siblings.")
    visibility: Literal["public", "private"] = Field(default="public", description="Page visibility.")


class SitePageUpdateIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    path: str | None = Field(default=None, description="Unique pathname (e.g. /about).", examples=["/about"])
    parent_id: UUID | None = Field(default=None, description="Parent page id (null for root).")
    sort_order: int | None = Field(default=None, description="Sort order within siblings.")
    visibility: Literal["public", "private"] | None = Field(default=None, description="Page visibility.")


class SitePageMoveIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    parent_id: UUID | None = Field(default=None, description="New parent page id (null for root).")
    sort_order: int = Field(default=0, description="New sort order within siblings.")


class SitePageDeleteOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    page_id: str = Field(..., description="Deleted page id.")


class SiteRouteTemplateOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    id: UUID = Field(..., description="Route template id.")
    site_id: str = Field(..., description="Site id.")
    path_pattern: str = Field(..., description="Path pattern (e.g. /blog/:slug).")
    entry_type_id: str = Field(..., description="Entry type id.")
    entry_type_code: str = Field(..., description="Entry type code (e.g. blog_post).")
    template_page_revision_id: str | None = Field(
        default=None, description="Optional template page revision id used as layout skeleton."
    )
    is_active: bool = Field(default=True, description="Whether the template is active.")


class SiteRouteTemplateCreateIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    path_pattern: str = Field(..., description="Path pattern (e.g. /blog/:slug).", examples=["/blog/:slug"])
    entry_type_code: str = Field(..., min_length=1, max_length=64, description="Entry type code (e.g. blog_post).")
    template_page_revision_id: UUID | None = Field(
        default=None, description="Optional template page revision id used as layout skeleton."
    )
    is_active: bool = Field(default=True, description="Whether the template is active.")


class SiteRouteTemplateUpdateIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    path_pattern: str | None = Field(default=None, description="Path pattern (e.g. /blog/:slug).")
    entry_type_code: str | None = Field(default=None, min_length=1, max_length=64, description="Entry type code.")
    template_page_revision_id: UUID | None = Field(
        default=None, description="Optional template page revision id used as layout skeleton."
    )
    is_active: bool | None = Field(default=None, description="Whether the template is active.")


class SiteRouteTemplateDeleteOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    template_id: str = Field(..., description="Deleted route template id.")


class SitePageRevisionOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    page_id: str = Field(..., description="Page id.")
    state: Literal["draft", "published"] = Field(..., description="Revision state.")
    revision: int = Field(..., ge=1, description="Revision number.")
    created_at_ms: int = Field(..., description="Revision created timestamp in milliseconds (UTC).")
    document: DocumentIR = Field(..., description="DocumentIR payload.")
    meta: dict[str, Any] | None = Field(default=None, description="Optional metadata payload (JSON).")
    style_overrides: dict[str, Any] | None = Field(default=None, description="Optional style overrides payload (JSON).")
    variant_id: str | None = Field(default=None, description="Optional theme variant id.")
    deps: dict[str, Any] | None = Field(default=None, description="Optional dependency snapshot payload (JSON).")


class SitePageRollbackIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    revision: int = Field(..., ge=1, description="Target revision number to rollback to.")
    target: Literal["draft", "published"] = Field(..., description="Which revision pointer to rollback.")


class SitePageRollbackOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    page_id: str = Field(..., description="Page id.")
    target: Literal["draft", "published"] = Field(..., description="Which revision pointer was rolled back.")
    from_revision: int | None = Field(default=None, ge=1, description="Previous revision pointer value (if any).")
    to_revision: int = Field(..., ge=1, description="New revision pointer value.")
    rolled_back_at_ms: int = Field(..., description="Rollback timestamp in milliseconds (UTC).")


class SiteEntryRevisionOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    entry_id: str = Field(..., description="Entry id.")
    state: Literal["draft", "published"] = Field(..., description="Revision state.")
    revision: int = Field(..., ge=1, description="Revision number.")
    created_at_ms: int = Field(..., description="Revision created timestamp in milliseconds (UTC).")
    document: DocumentIR | None = Field(default=None, description="Optional DocumentIR payload.")
    data: dict[str, Any] | None = Field(default=None, description="Optional entry data payload (JSON).")
    meta: dict[str, Any] | None = Field(default=None, description="Optional metadata payload (JSON).")
    style_overrides: dict[str, Any] | None = Field(default=None, description="Optional style overrides payload (JSON).")
    variant_id: str | None = Field(default=None, description="Optional theme variant id.")
    deps: dict[str, Any] | None = Field(default=None, description="Optional dependency snapshot payload (JSON).")


class SiteEntryRollbackIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    revision: int = Field(..., ge=1, description="Target revision number to rollback to.")
    target: Literal["draft", "published"] = Field(..., description="Which revision pointer to rollback.")


class SiteEntryRollbackOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    entry_id: str = Field(..., description="Entry id.")
    target: Literal["draft", "published"] = Field(..., description="Which revision pointer was rolled back.")
    from_revision: int | None = Field(default=None, ge=1, description="Previous revision pointer value (if any).")
    to_revision: int = Field(..., ge=1, description="New revision pointer value.")
    rolled_back_at_ms: int = Field(..., description="Rollback timestamp in milliseconds (UTC).")


class SiteEntryDraftSaveIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    entry_type_code: str = Field(..., min_length=1, max_length=64, description="Entry type code (e.g. blog_post).")
    slug: str = Field(..., min_length=1, max_length=256, description="Entry slug (unique within entry type).")
    document: DocumentIR | None = Field(default=None, description="Optional DocumentIR payload.")
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
    model_config = ConfigDict(extra="forbid")

    site_id: str = Field(..., description="Site id.")
    entry_id: str = Field(..., description="Entry id.")
    entry_type_code: str = Field(..., description="Entry type code.")
    slug: str = Field(..., description="Entry slug.")
    revision: int = Field(..., ge=1, description="Draft revision number.")
    saved_at_ms: int = Field(..., description="Saved timestamp in milliseconds (UTC).")


class SiteEntryPublishIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    entry_type_code: str = Field(..., min_length=1, max_length=64, description="Entry type code (e.g. blog_post).")
    slug: str = Field(..., min_length=1, max_length=256, description="Entry slug (unique within entry type).")
    revision: int | None = Field(
        default=None,
        ge=1,
        description="Draft revision number to publish. If omitted, publish the latest draft revision.",
    )


class SiteEntryPublishOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    site_id: str = Field(..., description="Site id.")
    entry_id: str = Field(..., description="Entry id.")
    entry_type_code: str = Field(..., description="Entry type code.")
    slug: str = Field(..., description="Entry slug.")
    revision: int = Field(..., ge=1, description="Published revision number.")
    published_at_ms: int = Field(..., description="Published timestamp in milliseconds (UTC).")


class SiteEntryUnpublishIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    entry_type_code: str = Field(..., min_length=1, max_length=64, description="Entry type code (e.g. blog_post).")
    slug: str = Field(..., min_length=1, max_length=256, description="Entry slug (unique within entry type).")


class SiteEntryUnpublishOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    site_id: str = Field(..., description="Site id.")
    entry_id: str = Field(..., description="Entry id.")
    entry_type_code: str = Field(..., description="Entry type code.")
    slug: str = Field(..., description="Entry slug.")
    unpublished_at_ms: int = Field(..., description="Unpublished timestamp in milliseconds (UTC).")


class SiteEntryTypeOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    id: UUID = Field(..., description="Entry type id.")
    site_id: str = Field(..., description="Site id.")
    code: str = Field(..., description="Entry type code.")
    name: str = Field(..., description="Entry type display name.")
    fields_schema: dict[str, Any] | None = Field(default=None, description="Entry field schema (JSON).")


class SiteEntryTypeCreateIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(..., min_length=1, max_length=64, description="Entry type code (e.g. blog_post).")
    name: str = Field(..., min_length=1, max_length=128, description="Entry type display name.")
    fields_schema: dict[str, Any] | None = Field(default=None, description="Entry field schema (JSON).")


class SiteEntryTypeUpdateIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=128, description="Entry type display name.")
    fields_schema: dict[str, Any] | None = Field(default=None, description="Entry field schema (JSON).")


class SiteEntryTypeDeleteOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    entry_type_id: str = Field(..., description="Deleted entry type id.")


class SiteEntryOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    id: UUID = Field(..., description="Entry id.")
    site_id: str = Field(..., description="Site id.")
    entry_type_id: str = Field(..., description="Entry type id.")
    entry_type_code: str = Field(..., description="Entry type code.")
    slug: str = Field(..., description="Entry slug.")
    draft_revision: int = Field(default=0, ge=0, description="Current draft revision pointer.")
    published_revision: int | None = Field(default=None, ge=1, description="Current published revision pointer.")


class SiteEntryCreateIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    entry_type_code: str = Field(..., min_length=1, max_length=64, description="Entry type code (e.g. blog_post).")
    slug: str = Field(..., min_length=1, max_length=256, description="Entry slug (unique within entry type).")


class SiteEntryUpdateIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    slug: str | None = Field(default=None, min_length=1, max_length=256, description="Entry slug (unique).")


class SiteEntryDeleteOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    entry_id: str = Field(..., description="Deleted entry id.")


ContainerBlock.model_rebuild()
DocumentIR.model_rebuild()
SitePageTreeNodeOut.model_rebuild()
