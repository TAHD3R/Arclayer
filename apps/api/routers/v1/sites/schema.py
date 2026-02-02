from __future__ import annotations

from typing import Annotated, Literal

from pydantic import ConfigDict, Field

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

    as_: Literal["div", "section", "article"] | None = Field(
        default=None,
        alias="as",
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


ContainerBlock.model_rebuild()
DocumentIR.model_rebuild()
