from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import AliasChoices, ConfigDict, Field, field_validator

from apps.api.common.schemas import BaseSchema
from apps.api.common.types.public_uuid import PublicUUID
from apps.api.modules.sites.design_document_schema import DesignDocumentV1

# ---- Block Protocol (server-side, minimal for stub) ----

LocaleCode = str
LocalizedString = dict[LocaleCode, str]


class DocumentMeta(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    title: LocalizedString | None = Field(default=None, description="Document title (field-level i18n map).")
    description: LocalizedString | None = Field(
        default=None, description="Document description (field-level i18n map)."
    )
    layout: BlockLayoutProps | None = Field(default=None, description="Optional page layout settings.")
    style: BlockDesignProps | None = Field(default=None, description="Optional page style settings.")
    animation: BlockAnimationProps | None = Field(default=None, description="Optional page animation settings.")


class BlockLayoutProps(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    width: int | str | None = Field(default=None, description="Optional width value.")
    min_width: int | str | None = Field(default=None, alias="minWidth", description="Optional min width value.")
    max_width: int | str | None = Field(default=None, alias="maxWidth", description="Optional max width value.")
    height: int | str | None = Field(default=None, description="Optional height value.")
    min_height: int | str | None = Field(default=None, alias="minHeight", description="Optional min height value.")
    max_height: int | str | None = Field(default=None, alias="maxHeight", description="Optional max height value.")
    margin: int | str | None = Field(default=None, description="Optional margin value.")
    padding: int | str | None = Field(default=None, description="Optional padding value.")
    padding_x: int | str | None = Field(default=None, alias="paddingX", description="Optional horizontal padding.")
    padding_y: int | str | None = Field(default=None, alias="paddingY", description="Optional vertical padding.")
    gap: int | str | None = Field(default=None, description="Optional layout gap.")
    display: Literal["block", "flex"] | None = Field(default=None, description="Optional CSS display mode.")
    direction: Literal["row", "column"] | None = Field(default=None, description="Optional flex direction.")
    wrap: Literal["nowrap", "wrap"] | None = Field(default=None, description="Optional flex wrap mode.")
    justify_content: Literal["start", "center", "end", "space-between", "space-around"] | None = Field(
        default=None,
        alias="justifyContent",
        description="Optional flex justify-content value.",
    )
    align_items: Literal["start", "center", "end", "stretch"] | None = Field(
        default=None,
        alias="alignItems",
        description="Optional flex align-items value.",
    )


class BlockDesignProps(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    color: str | None = Field(default=None, description="Optional text color.")
    background_color: str | None = Field(
        default=None, alias="backgroundColor", description="Optional background color."
    )
    border_color: str | None = Field(default=None, alias="borderColor", description="Optional border color.")
    border_style: Literal["solid", "dashed", "dotted"] | None = Field(
        default=None,
        alias="borderStyle",
        description="Optional border style.",
    )
    border_width: int | str | None = Field(default=None, alias="borderWidth", description="Optional border width.")
    border_radius: int | str | None = Field(default=None, alias="borderRadius", description="Optional border radius.")
    box_shadow: str | None = Field(default=None, alias="boxShadow", description="Optional box-shadow.")
    opacity: float | None = Field(default=None, ge=0, le=1, description="Optional opacity value.")


class BlockAnimationProps(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    type: Literal["none", "fade", "slide-up", "slide-down", "zoom-in"] | None = Field(
        default=None,
        description="Animation type.",
    )
    trigger: Literal["load", "hover"] | None = Field(default=None, description="Animation trigger.")
    duration_ms: int | None = Field(default=None, alias="durationMs", ge=0, description="Animation duration in ms.")
    delay_ms: int | None = Field(default=None, alias="delayMs", ge=0, description="Animation delay in ms.")
    easing: str | None = Field(default=None, description="Animation easing expression.")
    iteration_count: int | None = Field(
        default=None,
        alias="iterationCount",
        ge=1,
        description="Animation iteration count.",
    )
    fill_mode: Literal["none", "forwards", "backwards", "both"] | None = Field(
        default=None,
        alias="fillMode",
        description="Animation fill mode.",
    )


class BlockVisualProps(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    layout: BlockLayoutProps | None = Field(default=None, description="Optional block layout settings.")
    style: BlockDesignProps | None = Field(default=None, description="Optional block style settings.")
    animation: BlockAnimationProps | None = Field(default=None, description="Optional block animation settings.")


class ContainerBlockProps(BlockVisualProps):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    as_tag: Literal["div", "section", "article"] | None = Field(
        default=None,
        validation_alias=AliasChoices("as", "asTag", "as_tag"),
        serialization_alias="as",
        description="Semantic HTML wrapper tag.",
    )
    class_name: str | None = Field(default=None, alias="className", description="Optional CSS class name.")


class HeadingBlockProps(BlockVisualProps):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    level: int = Field(..., ge=1, le=6, description="Heading level (1-6).")
    text: LocalizedString = Field(..., description="Heading text (field-level i18n map).")
    align: Literal["left", "center", "right"] | None = Field(default=None, description="Optional text alignment.")


class ParagraphBlockProps(BlockVisualProps):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    text: LocalizedString = Field(..., description="Paragraph text (field-level i18n map).")
    align: Literal["left", "center", "right"] | None = Field(default=None, description="Optional text alignment.")


class DividerBlockProps(BlockVisualProps):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    variant: Literal["default", "subtle"] | None = Field(default=None, description="Divider visual variant.")


class ImageBlockProps(BlockVisualProps):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    src: LocalizedString = Field(..., description="Image source URL (field-level i18n map).")
    alt: LocalizedString | None = Field(default=None, description="Alt text (field-level i18n map).")
    object_fit: Literal["cover", "contain", "fill", "none"] | None = Field(
        default=None, alias="objectFit", description="CSS object-fit."
    )


class ButtonBlockProps(BlockVisualProps):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    text: LocalizedString = Field(..., description="Button label (field-level i18n map).")
    href: str | None = Field(default=None, description="Link URL.")
    variant: Literal["primary", "secondary", "outline", "ghost"] | None = Field(
        default=None, description="Button variant."
    )
    size: Literal["sm", "md", "lg"] | None = Field(default=None, description="Button size.")


class VideoBlockProps(BlockVisualProps):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    src: str = Field(..., description="Video source URL.")
    poster: str | None = Field(default=None, description="Poster image URL.")
    autoplay: bool = Field(default=False, description="Autoplay on load.")
    loop: bool = Field(default=False, description="Loop playback.")
    muted: bool = Field(default=True, description="Muted by default.")


class GridBlockProps(BlockVisualProps):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    columns: int = Field(default=2, ge=1, le=12, description="Number of grid columns.")
    column_gap: int | str | None = Field(default=None, alias="columnGap", description="Column gap.")
    row_gap: int | str | None = Field(default=None, alias="rowGap", description="Row gap.")


class SpacerBlockProps(BlockVisualProps):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    size: int | str = Field(default=24, description="Spacer height (px or CSS value).")


class IconBlockProps(BlockVisualProps):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    name: str = Field(..., description="Icon name (e.g. lucide icon id).")
    size: int | str | None = Field(default=None, description="Icon size.")
    color: str | None = Field(default=None, description="Icon color.")


class ListBlockProps(BlockVisualProps):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    ordered: bool = Field(default=False, description="Ordered (numbered) list.")
    items: list[LocalizedString] = Field(default_factory=list, description="List items (field-level i18n).")


class QuoteBlockProps(BlockVisualProps):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    text: LocalizedString = Field(..., description="Quote text (field-level i18n map).")
    citation: LocalizedString | None = Field(default=None, description="Citation / attribution.")
    variant: Literal["default", "large"] | None = Field(default=None, description="Quote visual variant.")


class ContainerBlock(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., description="Block id.")
    type: Literal["container"] = Field(..., description="Block type.")
    props: ContainerBlockProps = Field(..., description="Block props.")
    responsive: dict[str, BlockVisualProps] | None = Field(
        default=None,
        description="Per-breakpoint visual overrides (layout/style/animation).",
    )
    children: list[BlockNode] | None = Field(default=None, description="Child blocks.")


class HeadingBlock(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., description="Block id.")
    type: Literal["heading"] = Field(..., description="Block type.")
    props: HeadingBlockProps = Field(..., description="Block props.")
    responsive: dict[str, BlockVisualProps] | None = Field(
        default=None,
        description="Per-breakpoint visual overrides (layout/style/animation).",
    )


class ParagraphBlock(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., description="Block id.")
    type: Literal["paragraph"] = Field(..., description="Block type.")
    props: ParagraphBlockProps = Field(..., description="Block props.")
    responsive: dict[str, BlockVisualProps] | None = Field(
        default=None,
        description="Per-breakpoint visual overrides (layout/style/animation).",
    )


class DividerBlock(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., description="Block id.")
    type: Literal["divider"] = Field(..., description="Block type.")
    props: DividerBlockProps = Field(..., description="Block props.")
    responsive: dict[str, BlockVisualProps] | None = Field(
        default=None,
        description="Per-breakpoint visual overrides (layout/style/animation).",
    )


class ImageBlock(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., description="Block id.")
    type: Literal["image"] = Field(..., description="Block type.")
    props: ImageBlockProps = Field(..., description="Block props.")
    responsive: dict[str, BlockVisualProps] | None = Field(
        default=None,
        description="Per-breakpoint visual overrides (layout/style/animation).",
    )


class ButtonBlock(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., description="Block id.")
    type: Literal["button"] = Field(..., description="Block type.")
    props: ButtonBlockProps = Field(..., description="Block props.")
    responsive: dict[str, BlockVisualProps] | None = Field(
        default=None,
        description="Per-breakpoint visual overrides (layout/style/animation).",
    )


class VideoBlock(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., description="Block id.")
    type: Literal["video"] = Field(..., description="Block type.")
    props: VideoBlockProps = Field(..., description="Block props.")
    responsive: dict[str, BlockVisualProps] | None = Field(
        default=None,
        description="Per-breakpoint visual overrides (layout/style/animation).",
    )


class GridBlock(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., description="Block id.")
    type: Literal["grid"] = Field(..., description="Block type.")
    props: GridBlockProps = Field(..., description="Block props.")
    responsive: dict[str, BlockVisualProps] | None = Field(
        default=None,
        description="Per-breakpoint visual overrides (layout/style/animation).",
    )
    children: list[BlockNode] | None = Field(default=None, description="Child blocks.")


class SpacerBlock(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., description="Block id.")
    type: Literal["spacer"] = Field(..., description="Block type.")
    props: SpacerBlockProps = Field(..., description="Block props.")
    responsive: dict[str, BlockVisualProps] | None = Field(
        default=None,
        description="Per-breakpoint visual overrides (layout/style/animation).",
    )


class IconBlock(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., description="Block id.")
    type: Literal["icon"] = Field(..., description="Block type.")
    props: IconBlockProps = Field(..., description="Block props.")
    responsive: dict[str, BlockVisualProps] | None = Field(
        default=None,
        description="Per-breakpoint visual overrides (layout/style/animation).",
    )


class ListBlock(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., description="Block id.")
    type: Literal["list"] = Field(..., description="Block type.")
    props: ListBlockProps = Field(..., description="Block props.")
    responsive: dict[str, BlockVisualProps] | None = Field(
        default=None,
        description="Per-breakpoint visual overrides (layout/style/animation).",
    )


class QuoteBlock(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., description="Block id.")
    type: Literal["quote"] = Field(..., description="Block type.")
    props: QuoteBlockProps = Field(..., description="Block props.")
    responsive: dict[str, BlockVisualProps] | None = Field(
        default=None,
        description="Per-breakpoint visual overrides (layout/style/animation).",
    )


class PrefabBlockProps(BlockVisualProps):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    prefab: str = Field(..., min_length=1, max_length=128, description="Prefab code (e.g. 'card').")
    props: dict[str, Any] | None = Field(default=None, description="Prefab props payload (JSON).")
    # Backwards-compatible alias: older drafts may use `data` to store prefab props.
    data: dict[str, Any] | None = Field(default=None, description="Legacy prefab data payload (JSON).")


class PrefabBlock(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., description="Block id.")
    type: Literal["__prefab__"] = Field(..., description="Prefab instance block type.")
    props: PrefabBlockProps = Field(..., description="Prefab instance props.")
    responsive: dict[str, BlockVisualProps] | None = Field(
        default=None,
        description="Per-breakpoint visual overrides (layout/style/animation).",
    )
    children: list[BlockNode] | None = Field(default=None, description="Child blocks (slots).")


BlockNode = Annotated[
    ContainerBlock
    | HeadingBlock
    | ParagraphBlock
    | DividerBlock
    | ImageBlock
    | ButtonBlock
    | VideoBlock
    | GridBlock
    | SpacerBlock
    | IconBlock
    | ListBlock
    | QuoteBlock
    | PrefabBlock,
    Field(discriminator="type"),
]


class DocumentIR(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    version: Literal[1] = Field(1, description="Document protocol version.")
    meta: DocumentMeta | None = Field(default=None, description="SEO metadata.")
    blocks: list[BlockNode] = Field(default_factory=list, description="Content blocks.")


# ---- Sites API (public consumption, stub) ----


class SiteResolveOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    site_id: PublicUUID = Field(..., description="Resolved site id.")
    default_locale: str = Field(..., description="Default locale (e.g. zh-CN).")
    fallback_locale: str = Field(..., description="Fallback locale (e.g. en-US).")


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


class SiteRuntimeOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    site_id: PublicUUID = Field(..., description="Site id.")
    mode: Literal["public", "preview"] = Field(..., description="Runtime mode.")
    theme: SiteThemeOut = Field(..., description="Theme configuration.")
    fonts: list[SiteFontOut] = Field(default_factory=list, description="Self-hosted fonts.")


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


class SiteRouteResolveOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    match: SiteRouteMatchOut = Field(..., description="Match result.")
    document: DesignDocumentV1 | None = Field(default=None, description="Resolved design document (if any).")


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
    document: DesignDocumentV1 = Field(..., description="Draft design document payload.")
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

    document: DesignDocumentV1 = Field(..., description="Draft design document payload.")
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
    document: DesignDocumentV1 = Field(..., description="DesignDocumentV1 payload.")
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
    document: DesignDocumentV1 | None = Field(default=None, description="Optional DesignDocumentV1 payload.")
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
    document: DesignDocumentV1 | None = Field(default=None, description="Optional DesignDocumentV1 payload.")
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
    blocks: list[dict[str, Any]] = Field(
        default_factory=list,
        validation_alias="blocks_json",
        description="Block nodes (serialized JSON).",
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
    blocks: list[dict[str, Any]] = Field(default_factory=list, description="Block nodes (serialized JSON).")


class SitePatternUpdateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    label: dict[str, str] | None = Field(default=None, description="Localized label map.")
    category: str | None = Field(default=None, max_length=64, description="Pattern category.")
    preview_image_url: str | None = Field(default=None, max_length=512, description="Preview image URL.")
    blocks: list[dict[str, Any]] | None = Field(default=None, description="Block nodes (serialized JSON).")


class SitePatternDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    pattern_id: PublicUUID = Field(..., description="Deleted pattern id.")


ContainerBlock.model_rebuild()
GridBlock.model_rebuild()
PrefabBlock.model_rebuild()
DocumentIR.model_rebuild()
SitePageTreeNodeOut.model_rebuild()
SiteVisualSitemapNodeOut.model_rebuild()
