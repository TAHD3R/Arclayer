from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from src.common.types.public_uuid import PublicUUID
from src.modules.projects.builder.change_set_operation_schema import BuilderOperationBaseV1
from src.modules.projects.builder.wireframe_schema import (
    WireframeBindingV1,
    WireframeInteractionRuleV1,
    WireframeLayoutV1,
    WireframeResponsiveLayoutV1,
    WireframeResponsiveRuleV1,
    WireframeSectionV1,
)


class BuilderWireframeTargetOperationV1(BuilderOperationBaseV1):
    item_id: PublicUUID
    expected_draft_version: int = Field(ge=1)


class BuilderWireframeInitializeOperationV1(BuilderWireframeTargetOperationV1):
    type: Literal["wireframe.initialize"]
    component_catalog_version: str = Field(min_length=1, max_length=128)
    sections: tuple[WireframeSectionV1, ...] = Field(default=(), max_length=256)


class BuilderWireframeSectionAddOperationV1(BuilderWireframeTargetOperationV1):
    type: Literal["wireframe.section.add"]
    section: WireframeSectionV1
    index: int = Field(ge=0, le=255)


class BuilderWireframeSectionDuplicateOperationV1(BuilderWireframeTargetOperationV1):
    type: Literal["wireframe.section.duplicate"]
    section_id: str = Field(min_length=1, max_length=128)
    new_section_id: str = Field(min_length=1, max_length=128)
    new_intent_id: str = Field(min_length=1, max_length=128)
    index: int = Field(ge=0, le=255)


class BuilderWireframeSectionRemoveOperationV1(BuilderWireframeTargetOperationV1):
    type: Literal["wireframe.section.remove"]
    section_id: str = Field(min_length=1, max_length=128)


class BuilderWireframeSectionReorderOperationV1(BuilderWireframeTargetOperationV1):
    type: Literal["wireframe.section.reorder"]
    section_id: str = Field(min_length=1, max_length=128)
    index: int = Field(ge=0, le=255)


class BuilderWireframeSectionConfigureOperationV1(BuilderWireframeTargetOperationV1):
    type: Literal["wireframe.section.configure"]
    section_id: str = Field(min_length=1, max_length=128)
    component_key: str = Field(min_length=1, max_length=128)
    variant_key: str = Field(min_length=1, max_length=128)
    bindings: tuple[WireframeBindingV1, ...] = Field(default=(), max_length=128)
    responsive_rules: tuple[WireframeResponsiveRuleV1, ...] = Field(default=(), max_length=3)
    interaction_rules: tuple[WireframeInteractionRuleV1, ...] = Field(default=(), max_length=32)


class BuilderWireframeSetLayoutOperationV1(BuilderWireframeTargetOperationV1):
    type: Literal["wireframe.set_layout"]
    section_id: str = Field(min_length=1, max_length=128)
    layout: WireframeLayoutV1
    responsive_layouts: tuple[WireframeResponsiveLayoutV1, ...] = Field(default=(), max_length=3)


class BuilderWireframeSetComponentOperationV1(BuilderWireframeTargetOperationV1):
    type: Literal["wireframe.set_component"]
    section_id: str = Field(min_length=1, max_length=128)
    component_key: str = Field(min_length=1, max_length=128)


class BuilderWireframeSetVariantOperationV1(BuilderWireframeTargetOperationV1):
    type: Literal["wireframe.set_variant"]
    section_id: str = Field(min_length=1, max_length=128)
    variant_key: str = Field(min_length=1, max_length=128)


class BuilderWireframeSetBindingOperationV1(BuilderWireframeTargetOperationV1):
    type: Literal["wireframe.set_binding"]
    section_id: str = Field(min_length=1, max_length=128)
    binding: WireframeBindingV1


class BuilderWireframeClearBindingOperationV1(BuilderWireframeTargetOperationV1):
    type: Literal["wireframe.clear_binding"]
    section_id: str = Field(min_length=1, max_length=128)
    slot_key: str = Field(min_length=1, max_length=128)


class BuilderWireframeSetResponsiveRuleOperationV1(BuilderWireframeTargetOperationV1):
    type: Literal["wireframe.set_responsive_rule"]
    section_id: str = Field(min_length=1, max_length=128)
    rule: WireframeResponsiveRuleV1


class BuilderWireframeClearResponsiveRuleOperationV1(BuilderWireframeTargetOperationV1):
    type: Literal["wireframe.clear_responsive_rule"]
    section_id: str = Field(min_length=1, max_length=128)
    breakpoint: Literal["desktop", "tablet", "mobile"]


class BuilderWireframeSetInteractionsOperationV1(BuilderWireframeTargetOperationV1):
    type: Literal["wireframe.set_interactions"]
    section_id: str = Field(min_length=1, max_length=128)
    rules: tuple[WireframeInteractionRuleV1, ...] = Field(default=(), max_length=32)


class BuilderWireframeSetGlobalReferenceOperationV1(BuilderWireframeTargetOperationV1):
    type: Literal["wireframe.set_global_reference"]
    section_id: str = Field(min_length=1, max_length=128)
    global_section_item_id: PublicUUID


class BuilderWireframeClearGlobalReferenceOperationV1(BuilderWireframeTargetOperationV1):
    type: Literal["wireframe.clear_global_reference"]
    section_id: str = Field(min_length=1, max_length=128)


BuilderWireframeOperationV1 = Annotated[
    BuilderWireframeInitializeOperationV1
    | BuilderWireframeSectionAddOperationV1
    | BuilderWireframeSectionDuplicateOperationV1
    | BuilderWireframeSectionRemoveOperationV1
    | BuilderWireframeSectionReorderOperationV1
    | BuilderWireframeSectionConfigureOperationV1
    | BuilderWireframeSetLayoutOperationV1
    | BuilderWireframeSetComponentOperationV1
    | BuilderWireframeSetVariantOperationV1
    | BuilderWireframeSetBindingOperationV1
    | BuilderWireframeClearBindingOperationV1
    | BuilderWireframeSetResponsiveRuleOperationV1
    | BuilderWireframeClearResponsiveRuleOperationV1
    | BuilderWireframeSetInteractionsOperationV1
    | BuilderWireframeSetGlobalReferenceOperationV1
    | BuilderWireframeClearGlobalReferenceOperationV1,
    Field(discriminator="type"),
]


__all__ = [
    "BuilderWireframeClearBindingOperationV1",
    "BuilderWireframeClearGlobalReferenceOperationV1",
    "BuilderWireframeClearResponsiveRuleOperationV1",
    "BuilderWireframeInitializeOperationV1",
    "BuilderWireframeOperationV1",
    "BuilderWireframeSectionAddOperationV1",
    "BuilderWireframeSectionConfigureOperationV1",
    "BuilderWireframeSectionDuplicateOperationV1",
    "BuilderWireframeSectionRemoveOperationV1",
    "BuilderWireframeSectionReorderOperationV1",
    "BuilderWireframeSetLayoutOperationV1",
    "BuilderWireframeSetBindingOperationV1",
    "BuilderWireframeSetComponentOperationV1",
    "BuilderWireframeSetGlobalReferenceOperationV1",
    "BuilderWireframeSetInteractionsOperationV1",
    "BuilderWireframeSetResponsiveRuleOperationV1",
    "BuilderWireframeSetVariantOperationV1",
    "BuilderWireframeTargetOperationV1",
]
