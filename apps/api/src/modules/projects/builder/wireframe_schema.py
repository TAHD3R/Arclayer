from __future__ import annotations

from typing import Annotated, Literal, Self

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonValue
from src.common.types.public_uuid import PublicUUID


class WireframeFieldBindingV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["field"]
    slot_key: str = Field(min_length=1, max_length=128)
    field_key: str = Field(min_length=1, max_length=128)


class WireframeLiteralBindingV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["literal"]
    slot_key: str = Field(min_length=1, max_length=128)
    value: JsonValue


class WireframeMissingBindingV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["missing"]
    slot_key: str = Field(min_length=1, max_length=128)
    reason: Literal["content", "media", "binding"]


WireframeBindingV1 = Annotated[
    WireframeFieldBindingV1 | WireframeLiteralBindingV1 | WireframeMissingBindingV1,
    Field(discriminator="kind"),
]


class WireframeResponsiveRuleV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    breakpoint: Literal["desktop", "tablet", "mobile"]
    layout: Literal["stack", "grid", "split", "overlay"]
    columns: int = Field(default=1, ge=1, le=12)
    visible: bool = True


class WireframeInteractionRuleV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    event: Literal["click", "submit", "change", "hover", "focus"]
    action: Literal["navigate", "submit", "toggle", "open", "close"]
    target: str | None = Field(default=None, min_length=1, max_length=256)

    @model_validator(mode="after")
    def require_action_target(self) -> Self:
        if self.action in {"navigate", "toggle", "open", "close"} and self.target is None:
            raise ValueError("target is required for this interaction action")
        return self


class WireframeSectionV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    id: str = Field(min_length=1, max_length=128)
    intent_id: str = Field(min_length=1, max_length=128)
    component_key: str = Field(min_length=1, max_length=128)
    variant_key: str = Field(min_length=1, max_length=128)
    label: str = Field(min_length=1, max_length=128)
    global_reference_id: PublicUUID | None = None
    bindings: tuple[WireframeBindingV1, ...] = Field(default=(), max_length=128)
    responsive_rules: tuple[WireframeResponsiveRuleV1, ...] = Field(default=(), max_length=3)
    interaction_rules: tuple[WireframeInteractionRuleV1, ...] = Field(default=(), max_length=32)
    asset_references: tuple[PublicUUID, ...] = Field(default=(), max_length=64)

    @model_validator(mode="after")
    def require_unique_section_contracts(self) -> Self:
        slot_keys = [binding.slot_key for binding in self.bindings]
        if len(slot_keys) != len(set(slot_keys)):
            raise ValueError("wireframe binding slotKey values must be unique per section")
        breakpoints = [rule.breakpoint for rule in self.responsive_rules]
        if len(breakpoints) != len(set(breakpoints)):
            raise ValueError("wireframe responsive breakpoints must be unique per section")
        return self


class WireframeDocumentV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    schema_version: Literal[1] = 1
    page_item_id: PublicUUID
    design_system_version_id: PublicUUID
    component_catalog_version: str = Field(min_length=1, max_length=128)
    sections: tuple[WireframeSectionV1, ...] = Field(default=(), max_length=256)

    @model_validator(mode="after")
    def require_unique_section_identity(self) -> Self:
        section_ids = [section.id for section in self.sections]
        if len(section_ids) != len(set(section_ids)):
            raise ValueError("wireframe section ids must be unique")
        intent_ids = [section.intent_id for section in self.sections]
        if len(intent_ids) != len(set(intent_ids)):
            raise ValueError("wireframe section intentId values must be unique")
        return self


__all__ = [
    "WireframeBindingV1",
    "WireframeDocumentV1",
    "WireframeFieldBindingV1",
    "WireframeInteractionRuleV1",
    "WireframeLiteralBindingV1",
    "WireframeMissingBindingV1",
    "WireframeResponsiveRuleV1",
    "WireframeSectionV1",
]
