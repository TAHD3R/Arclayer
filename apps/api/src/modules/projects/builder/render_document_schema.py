from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonValue
from src.common.types.public_uuid import PublicUUID
from src.modules.projects.builder.wireframe_schema import (
    WireframeInteractionRuleV1,
    WireframeLayoutV1,
    WireframeResponsiveLayoutV1,
    WireframeResponsiveRuleV1,
)


class BuilderRendererIdentityOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    profile: Literal["arclayer-site-v1"]
    version: Literal["1.0.0"]


class BuilderRenderPinsOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    site_revision_id: PublicUUID
    site_revision_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    content_structure_revision_id: PublicUUID
    content_structure_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    page_item_id: PublicUUID
    page_content_version_id: PublicUUID
    page_version_number: int = Field(ge=1)
    design_system_id: PublicUUID
    design_system_version_id: PublicUUID
    design_system_manifest_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    component_catalog_version: str = Field(min_length=1, max_length=128)
    component_catalog_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    visual_blueprint_checksum: str | None = Field(
        default=None,
        pattern=r"^sha256:[0-9a-f]{64}$",
    )


class BuilderResolvedTokenOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    path: str = Field(min_length=1, max_length=256)
    type: Literal[
        "color",
        "dimension",
        "number",
        "duration",
        "cubic-bezier",
        "font-family",
        "font-weight",
        "shadow",
    ]
    value: JsonValue


class BuilderResolvedTypographyOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    key: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    font_family: tuple[str, ...]
    font_weight: int = Field(ge=1, le=1000)
    font_size: str
    line_height: int | float
    letter_spacing: str | None = None


class BuilderResolvedMotionOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    key: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    duration: str
    easing: tuple[float, float, float, float]
    reduced_motion_duration: str


class BuilderRenderThemeOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    key: str = Field(min_length=1, max_length=64)
    mode: Literal["light", "dark", "high-contrast"]
    tokens: tuple[BuilderResolvedTokenOut, ...]
    typography: tuple[BuilderResolvedTypographyOut, ...]
    motion: tuple[BuilderResolvedMotionOut, ...]


class BuilderRenderRecipeStateOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    state_key: str = Field(min_length=1, max_length=64)
    style_values: dict[str, JsonValue]


class BuilderRenderRecipeResponsiveOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    breakpoint: str = Field(min_length=1, max_length=64)
    states: tuple[BuilderRenderRecipeStateOut, ...]


class BuilderRenderComponentRecipeOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    key: str = Field(min_length=1, max_length=128)
    states: tuple[BuilderRenderRecipeStateOut, ...]
    responsive_overrides: tuple[BuilderRenderRecipeResponsiveOut, ...] = ()


class BuilderRenderSlotOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    key: str = Field(min_length=1, max_length=128)
    value_kind: Literal["text", "rich-text", "image", "link", "action", "list", "boolean", "number"]
    value: JsonValue
    source: Literal["field", "literal"]
    field_key: str | None = Field(default=None, min_length=1, max_length=128)


class BuilderRenderGlobalReferenceHopOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    host_item_id: PublicUUID
    host_section_id: str = Field(min_length=1, max_length=128)
    target_item_id: PublicUUID


class BuilderRenderSectionOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    instance_id: str = Field(min_length=1, max_length=2048)
    source_kind: Literal["page", "global_section"]
    source_item_id: PublicUUID
    source_content_version_id: PublicUUID
    source_section_id: str = Field(min_length=1, max_length=128)
    reference_lineage: tuple[BuilderRenderGlobalReferenceHopOut, ...] = ()
    intent_id: str = Field(min_length=1, max_length=128)
    component_key: str = Field(min_length=1, max_length=128)
    variant_key: str = Field(min_length=1, max_length=128)
    label: str = Field(min_length=1, max_length=128)
    slots: tuple[BuilderRenderSlotOut, ...]
    layout: WireframeLayoutV1 = Field(default_factory=WireframeLayoutV1)
    responsive_layouts: tuple[WireframeResponsiveLayoutV1, ...] = ()
    responsive_rules: tuple[WireframeResponsiveRuleV1, ...]
    interaction_rules: tuple[WireframeInteractionRuleV1, ...]
    asset_references: tuple[PublicUUID, ...]
    component_recipe: BuilderRenderComponentRecipeOut | None = None


class BuilderRenderSeoOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    title: str | None = Field(default=None, max_length=512)
    description: str | None = Field(default=None, max_length=2000)
    canonical_url: str | None = Field(default=None, max_length=1024)
    robots_directive: str | None = Field(default=None, max_length=128)


class BuilderRenderEvidenceOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    concern: Literal[
        "manifest",
        "content_structure",
        "content_versions",
        "presentations_and_bindings",
        "wireframe_and_catalog",
        "global_sections",
        "design_system",
        "visual_blueprint",
        "document_hash",
        "assets_and_font_rights",
        "compiler",
        "smoke",
        "publication",
    ]
    status: Literal["passed", "not_evaluated"]


class BuilderPageRenderDocumentOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    schema_version: Literal[1] = 1
    renderer: BuilderRendererIdentityOut
    render_source: Literal["wireframe_preview", "visual_blueprint"]
    pins: BuilderRenderPinsOut
    locale: str = Field(min_length=1, max_length=16)
    route_path: str = Field(min_length=1, max_length=512)
    theme: BuilderRenderThemeOut
    seo: BuilderRenderSeoOut
    sections: tuple[BuilderRenderSectionOut, ...] = Field(min_length=1, max_length=1024)
    evidence: tuple[BuilderRenderEvidenceOut, ...]
    renderable: Literal[True] = True
    document_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")


__all__ = [
    "BuilderPageRenderDocumentOut",
    "BuilderRenderComponentRecipeOut",
    "BuilderRenderEvidenceOut",
    "BuilderRenderGlobalReferenceHopOut",
    "BuilderRenderPinsOut",
    "BuilderRenderRecipeResponsiveOut",
    "BuilderRenderRecipeStateOut",
    "BuilderRenderSectionOut",
    "BuilderRenderSeoOut",
    "BuilderRenderSlotOut",
    "BuilderRendererIdentityOut",
    "BuilderRenderThemeOut",
    "BuilderResolvedMotionOut",
    "BuilderResolvedTokenOut",
    "BuilderResolvedTypographyOut",
]
