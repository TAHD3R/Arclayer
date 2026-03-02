from __future__ import annotations

import re
from typing import Annotated, Literal

from pydantic import ConfigDict, Field, model_validator

from apps.api.common.schemas import BaseSchema

LocaleCode = str
LocalizedString = dict[LocaleCode, str]


SAFE_NODE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9:_-]*$")


def _is_safe_node_id(value: str) -> bool:
    return bool(SAFE_NODE_ID_RE.match(value or ""))


type JsonScalar = str | int | float | bool | None
type JsonValue = JsonScalar | list["JsonValue"] | dict[str, "JsonValue"]


class DesignBindingExprV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    kind: Literal["binding"] = Field(..., description="Binding expression marker.")
    source: Literal["primaryEntry", "prefabProps", "routeParams", "site", "viewer"] = Field(
        ..., description="Binding source."
    )
    path: str = Field(..., min_length=1, description="Dot path, e.g. 'fields.title' or 'params.slug'.")


class DesignLiteralValueV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    kind: Literal["literal"] = Field(..., description="Literal value marker.")
    value: JsonValue = Field(..., description="JSON literal payload.")


DesignValueV1 = Annotated[
    DesignLiteralValueV1 | DesignBindingExprV1,
    Field(discriminator="kind"),
]


class DesignMotionRefV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    motion_id: str = Field(..., alias="motionId", min_length=1, description="Referenced motion definition id.")


class DesignConstraintsV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    horizontal: Literal["left", "right", "leftRight", "center", "scale"] = Field(
        ..., description="Horizontal constraint."
    )
    vertical: Literal["top", "bottom", "topBottom", "center", "scale"] = Field(..., description="Vertical constraint.")


class DesignConstraintsPartialV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    horizontal: Literal["left", "right", "leftRight", "center", "scale"] | None = Field(
        default=None, description="Horizontal constraint."
    )
    vertical: Literal["top", "bottom", "topBottom", "center", "scale"] | None = Field(
        default=None, description="Vertical constraint."
    )


class DesignAbsoluteRectV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    x: float = Field(..., description="X offset (px).")
    y: float = Field(..., description="Y offset (px).")
    width: float = Field(..., ge=0, description="Width (px).")
    height: float = Field(..., ge=0, description="Height (px).")


class DesignAbsoluteLayoutV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    rect: DesignAbsoluteRectV1 = Field(..., description="Absolute rectangle.")
    constraints: DesignConstraintsPartialV1 | None = Field(default=None, description="Optional constraints (partial).")
    align_x: Literal["start", "center", "end"] | None = Field(default=None, alias="alignX", description="X anchor.")
    align_y: Literal["start", "center", "end"] | None = Field(default=None, alias="alignY", description="Y anchor.")


class DesignAutoLayoutV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    direction: Literal["row", "column"] = Field(..., description="Auto layout direction.")
    gap: float | None = Field(default=None, ge=0, description="Gap (px).")
    padding: float | None = Field(default=None, ge=0, description="Padding (px).")
    align_items: Literal["start", "center", "end", "stretch"] | None = Field(
        default=None, alias="alignItems", description="Cross-axis alignment."
    )
    justify_content: Literal["start", "center", "end", "space-between", "space-around"] | None = Field(
        default=None, alias="justifyContent", description="Main-axis justification."
    )
    wrap: Literal["nowrap", "wrap"] | None = Field(default=None, description="Wrap mode.")


class DesignChildrenLayoutAbsoluteV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    mode: Literal["absolute"] = Field(..., description="Absolute children layout mode.")


class DesignChildrenLayoutAutoV1(DesignAutoLayoutV1):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    mode: Literal["auto"] = Field(..., description="Auto children layout mode.")


DesignChildrenLayoutV1 = Annotated[
    DesignChildrenLayoutAbsoluteV1 | DesignChildrenLayoutAutoV1,
    Field(discriminator="mode"),
]


class DesignTypographyV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    font_family: str | None = Field(default=None, alias="fontFamily", description="CSS font-family.")
    font_size: float | None = Field(default=None, alias="fontSize", ge=1, description="Font size (px).")
    line_height: float | None = Field(default=None, alias="lineHeight", ge=1, description="Line height (px).")
    letter_spacing: float | None = Field(default=None, alias="letterSpacing", description="Letter spacing.")
    font_weight: float | None = Field(default=None, alias="fontWeight", description="Font weight.")


class DesignStyleV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    color: str | None = Field(default=None, description="Text color.")
    background_color: str | None = Field(default=None, alias="backgroundColor", description="Background color.")
    border_color: str | None = Field(default=None, alias="borderColor", description="Border color.")
    border_style: Literal["solid", "dashed", "dotted"] | None = Field(
        default=None, alias="borderStyle", description="Border style."
    )
    border_width: float | str | None = Field(default=None, alias="borderWidth", description="Border width.")
    border_radius: float | str | None = Field(default=None, alias="borderRadius", description="Border radius.")
    box_shadow: str | None = Field(default=None, alias="boxShadow", description="Box shadow.")
    opacity: float | None = Field(default=None, ge=0, le=1, description="Opacity.")
    typography: DesignTypographyV1 | None = Field(default=None, description="Typography.")


class DesignTransformV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    rotation: float | None = Field(default=None, description="Rotation (deg).")
    scale_x: float | None = Field(default=None, alias="scaleX", description="Scale X.")
    scale_y: float | None = Field(default=None, alias="scaleY", description="Scale Y.")


class DesignLayoutV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    self: DesignAbsoluteLayoutV1 | None = Field(default=None, description="Self layout inside parent.")
    children: DesignChildrenLayoutV1 = Field(..., description="Children layout definition.")


class DesignNodeResponsiveOverrideV1(BaseSchema):
    """
    Per-breakpoint overrides.

    Note: this schema intentionally accepts partial nested structures so editor can store diff-only payloads.
    """

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    layout: dict | None = Field(default=None, description="Partial layout override (diff-only).")
    style: dict | None = Field(default=None, description="Partial style override (diff-only).")
    transform: dict | None = Field(default=None, description="Partial transform override (diff-only).")
    motion_refs: list[DesignMotionRefV1] | None = Field(
        default=None, alias="motionRefs", description="Motion refs override."
    )


class DesignNodeBaseV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., min_length=1, description="Stable node id.")
    name: str | None = Field(default=None, description="Layer name.")
    locked: bool | None = Field(default=None, description="Lock editing.")
    hidden: bool | None = Field(default=None, description="Hide in render tree.")
    layout: DesignLayoutV1 | None = Field(default=None, description="Layout definition.")
    style: DesignStyleV1 | None = Field(default=None, description="Style definition.")
    transform: DesignTransformV1 | None = Field(default=None, description="Transform definition.")
    motion_refs: list[DesignMotionRefV1] | None = Field(default=None, alias="motionRefs", description="Motion refs.")
    responsive: dict[str, DesignNodeResponsiveOverrideV1] | None = Field(
        default=None, description="Per-breakpoint overrides."
    )

    @model_validator(mode="after")
    def _validate_id(self) -> DesignNodeBaseV1:
        if not _is_safe_node_id(self.id):
            raise ValueError("Invalid node id")
        return self


class DesignPageRootSeoV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    title: LocalizedString | DesignBindingExprV1 | None = Field(default=None, description="SEO title.")
    description: LocalizedString | DesignBindingExprV1 | None = Field(default=None, description="SEO description.")


class DesignPageRootDataSourcesV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    primary_entry_id: str | None = Field(default=None, alias="primaryEntryId", description="Primary entry id.")
    primary_entry_type_hint: str | None = Field(
        default=None,
        alias="primaryEntryTypeHint",
        description="Stable content type hint for primary entry (recommended: content type code).",
    )
    named: dict[str, dict] | None = Field(default=None, description="Named sources map.")


class DesignPageRootNodeV1(DesignNodeBaseV1):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    type: Literal["page_root"] = Field(..., description="Node type.")
    children: list[str] = Field(default_factory=list, description="Child node ids.")
    seo: DesignPageRootSeoV1 | None = Field(default=None, description="Page-level SEO.")
    data_sources: DesignPageRootDataSourcesV1 | None = Field(
        default=None, alias="dataSources", description="Data sources."
    )


class DesignFrameNodeV1(DesignNodeBaseV1):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    type: Literal["frame"] = Field(..., description="Node type.")
    children: list[str] = Field(default_factory=list, description="Child node ids.")


class DesignGroupNodeV1(DesignNodeBaseV1):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    type: Literal["group"] = Field(..., description="Node type.")
    children: list[str] = Field(default_factory=list, description="Child node ids.")


class DesignRectNodeV1(DesignNodeBaseV1):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    type: Literal["rect"] = Field(..., description="Node type.")


class DesignTextNodeV1(DesignNodeBaseV1):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    type: Literal["text"] = Field(..., description="Node type.")
    text: LocalizedString | DesignBindingExprV1 = Field(..., description="Text payload (localized or binding).")
    tag: Literal["p", "span", "h1", "h2", "h3"] | None = Field(default=None, description="HTML tag.")
    align: Literal["left", "center", "right"] | None = Field(default=None, description="Text align.")


class DesignImageNodeV1(DesignNodeBaseV1):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    type: Literal["image"] = Field(..., description="Node type.")
    src: str | DesignBindingExprV1 = Field(..., min_length=1, description="Image source URL.")
    alt: LocalizedString | DesignBindingExprV1 | None = Field(default=None, description="Alt text.")
    object_fit: Literal["cover", "contain", "fill", "none"] | None = Field(
        default=None, alias="objectFit", description="CSS object-fit."
    )


class DesignEmbedNodeV1(DesignNodeBaseV1):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    type: Literal["embed"] = Field(..., description="Node type.")
    url: str | DesignBindingExprV1 = Field(..., min_length=1, description="Embed URL.")


class DesignPrefabInstanceNodeV1(DesignNodeBaseV1):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    type: Literal["prefab_instance"] = Field(..., description="Node type.")
    prefab_id: str = Field(..., alias="prefabId", min_length=1, max_length=256, description="Prefab id/code.")
    props: dict[str, DesignValueV1] = Field(default_factory=dict, description="Prefab props map.")
    slot_children: dict[str, list[str]] | None = Field(
        default=None, alias="slotChildren", description="Slot children ids."
    )


class DesignContentRefNodeV1(DesignNodeBaseV1):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    type: Literal["content_ref"] = Field(..., description="Node type.")
    ref_entry_id: str = Field(
        ...,
        alias="refEntryId",
        min_length=1,
        description="PublicUUID of the referenced content entry.",
    )
    ref_state: Literal["draft", "published", "auto"] = Field(
        default="auto",
        alias="refState",
        description="Revision state. 'auto' = published in public, draft in preview.",
    )
    props: dict[str, DesignValueV1] | None = Field(
        default=None,
        description="Override props for the referenced document.",
    )
    style_override_whitelist: list[str] | None = Field(
        default=None,
        alias="styleOverrideWhitelist",
        description="Allowed style override keys.",
    )


DesignNodeV1 = Annotated[
    DesignPageRootNodeV1
    | DesignFrameNodeV1
    | DesignGroupNodeV1
    | DesignRectNodeV1
    | DesignTextNodeV1
    | DesignImageNodeV1
    | DesignEmbedNodeV1
    | DesignPrefabInstanceNodeV1
    | DesignContentRefNodeV1,
    Field(discriminator="type"),
]


class PageBlueprint(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    version: Literal[1] = Field(1, description="PageBlueprint version.")
    root_id: str = Field(..., alias="rootId", min_length=1, description="Root node id (must be page_root).")
    nodes_by_id: dict[str, DesignNodeV1] = Field(default_factory=dict, alias="nodesById", description="Node table.")

    @model_validator(mode="after")
    def _validate_graph(self) -> PageBlueprint:
        if not _is_safe_node_id(self.root_id):
            raise ValueError("Invalid rootId")

        # root must exist and be page_root.
        root = self.nodes_by_id.get(self.root_id)
        if root is None:
            raise ValueError("Missing root node")
        if getattr(root, "type", None) != "page_root":
            raise ValueError("rootId must point to a page_root node")

        # key <-> node.id consistency
        for key, node in self.nodes_by_id.items():
            if not _is_safe_node_id(key):
                raise ValueError("Invalid node key")
            if node.id != key:
                raise ValueError("Node id mismatch")

        # children references must exist
        for node in self.nodes_by_id.values():
            children = getattr(node, "children", None)
            if children is None:
                continue
            for child_id in children:
                if child_id not in self.nodes_by_id:
                    raise ValueError("Dangling child reference")

        # prefab slotChildren references must exist
        for node in self.nodes_by_id.values():
            if getattr(node, "type", None) != "prefab_instance":
                continue
            slot_children = getattr(node, "slot_children", None)
            if not slot_children:
                continue
            for ids in slot_children.values():
                for child_id in ids:
                    if child_id not in self.nodes_by_id:
                        raise ValueError("Dangling slotChildren reference")

        return self


class PageBlueprintFragment(BaseSchema):
    """
    Reusable PageBlueprint fragment (insertable subtree).

    Unlike `PageBlueprint`, a fragment may have one or multiple roots, and roots are not required
    to be `page_root`.
    """

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    version: Literal[1] = Field(1, description="PageBlueprintFragment version.")
    root_ids: list[str] = Field(default_factory=list, alias="rootIds", description="Root node ids.")
    nodes_by_id: dict[str, DesignNodeV1] = Field(default_factory=dict, alias="nodesById", description="Node table.")

    @model_validator(mode="after")
    def _validate_fragment(self) -> PageBlueprintFragment:
        # key <-> node.id consistency + safe ids
        for key, node in self.nodes_by_id.items():
            if not _is_safe_node_id(key):
                raise ValueError("Invalid node key")
            if node.id != key:
                raise ValueError("Node id mismatch")

        # roots must exist (when provided)
        for rid in self.root_ids:
            if not _is_safe_node_id(rid):
                raise ValueError("Invalid rootId")
            if rid not in self.nodes_by_id:
                raise ValueError("Missing root node")

        # children references must exist
        for node in self.nodes_by_id.values():
            children = getattr(node, "children", None)
            if children is None:
                continue
            for child_id in children:
                if child_id not in self.nodes_by_id:
                    raise ValueError("Dangling child reference")

        # prefab slotChildren references must exist
        for node in self.nodes_by_id.values():
            if getattr(node, "type", None) != "prefab_instance":
                continue
            slot_children = getattr(node, "slot_children", None)
            if not slot_children:
                continue
            for ids in slot_children.values():
                for child_id in ids:
                    if child_id not in self.nodes_by_id:
                        raise ValueError("Dangling slotChildren reference")

        return self
