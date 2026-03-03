from __future__ import annotations

import re
from typing import Annotated, Literal

from pydantic import ConfigDict, Field, model_validator

from apps.api.src.common.schemas import BaseSchema
from apps.api.src.common.types.json_types import JsonObject
from apps.api.src.modules.sites.design_document.layout.schema import (
    DesignBindingExprV1,
    DesignLayoutV1,
    DesignMotionRefV1,
    DesignStyleV1,
    DesignTransformV1,
    DesignValueV1,
    LocalizedString,
)

SAFE_NODE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9:_-]*$")


def _is_safe_node_id(value: str) -> bool:
    return bool(SAFE_NODE_ID_RE.match(value or ""))


class DesignNodeResponsiveOverrideV1(BaseSchema):
    """
    Per-breakpoint overrides.

    Note: this schema intentionally accepts partial nested structures so editor can store diff-only payloads.
    """

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    layout: JsonObject | None = Field(default=None, description="Partial layout override (diff-only).")
    style: JsonObject | None = Field(default=None, description="Partial style override (diff-only).")
    transform: JsonObject | None = Field(default=None, description="Partial transform override (diff-only).")
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
    named: dict[str, JsonObject] | None = Field(default=None, description="Named sources map.")


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
