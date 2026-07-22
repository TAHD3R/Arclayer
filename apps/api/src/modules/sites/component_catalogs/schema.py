from __future__ import annotations

import hashlib
import re
from typing import Literal, Self

import orjson
from pydantic import ConfigDict, Field, field_validator, model_validator

from src.common.schemas import BaseSchema

CATALOG_VERSION_PATTERN = re.compile(r"^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*-v[1-9]\d*$")
CATALOG_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$")
SUPPORTED_LOCALES = frozenset({"zh-CN", "en-US"})

CatalogBindingKind = Literal["field", "literal"]
CatalogSlotValueKind = Literal["text", "rich-text", "image", "link", "action", "list", "boolean", "number"]
CatalogResponsiveLayout = Literal["stack", "grid", "split", "overlay"]
CatalogInteractionEvent = Literal["click", "submit", "change", "hover", "focus"]
CatalogInteractionAction = Literal["navigate", "submit", "toggle", "open", "close"]
CatalogStyleValueType = Literal[
    "color",
    "dimension",
    "number",
    "duration",
    "cubic-bezier",
    "font-family",
    "font-weight",
    "shadow",
]


def _validate_catalog_key(value: str) -> str:
    if not CATALOG_KEY_PATTERN.fullmatch(value):
        raise ValueError("Catalog keys must use lowercase dot-separated segments")
    return value


def _validate_localized_text(value: dict[str, str]) -> dict[str, str]:
    if set(value) != SUPPORTED_LOCALES or any(not text.strip() for text in value.values()):
        raise ValueError("Catalog text must contain non-empty zh-CN and en-US values")
    return value


class ComponentCatalogSlotV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    key: str = Field(min_length=1, max_length=128)
    label_by_locale: dict[str, str]
    description_by_locale: dict[str, str]
    value_kind: CatalogSlotValueKind
    required: bool = False
    repeatable: bool = False
    accepted_binding_kinds: tuple[CatalogBindingKind, ...] = Field(min_length=1, max_length=2)

    @field_validator("key")
    @classmethod
    def validate_key(cls, value: str) -> str:
        return _validate_catalog_key(value)

    @field_validator("label_by_locale", "description_by_locale")
    @classmethod
    def validate_text(cls, value: dict[str, str]) -> dict[str, str]:
        return _validate_localized_text(value)

    @model_validator(mode="after")
    def require_unique_binding_kinds(self) -> Self:
        if len(self.accepted_binding_kinds) != len(set(self.accepted_binding_kinds)):
            raise ValueError("acceptedBindingKinds values must be unique")
        return self


class ComponentCatalogVariantV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    key: str = Field(min_length=1, max_length=128)
    label_by_locale: dict[str, str]
    description_by_locale: dict[str, str]
    required_slot_keys: tuple[str, ...] = Field(default=(), max_length=64)
    supported_responsive_layouts: tuple[CatalogResponsiveLayout, ...] = Field(min_length=1, max_length=4)
    max_columns: int = Field(default=1, ge=1, le=12)

    @field_validator("key")
    @classmethod
    def validate_key(cls, value: str) -> str:
        return _validate_catalog_key(value)

    @field_validator("required_slot_keys")
    @classmethod
    def validate_required_slots(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        for key in value:
            _validate_catalog_key(key)
        if len(value) != len(set(value)):
            raise ValueError("requiredSlotKeys values must be unique")
        return value

    @field_validator("label_by_locale", "description_by_locale")
    @classmethod
    def validate_text(cls, value: dict[str, str]) -> dict[str, str]:
        return _validate_localized_text(value)

    @model_validator(mode="after")
    def require_unique_layouts(self) -> Self:
        if len(self.supported_responsive_layouts) != len(set(self.supported_responsive_layouts)):
            raise ValueError("supportedResponsiveLayouts values must be unique")
        return self


class ComponentCatalogInteractionV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    event: CatalogInteractionEvent
    action: CatalogInteractionAction
    target_required: bool = False


class ComponentCatalogStyleSlotV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    key: str = Field(min_length=1, max_length=128)
    value_type: CatalogStyleValueType
    required_states: tuple[str, ...] = Field(default=("default",), min_length=1, max_length=16)

    @field_validator("key")
    @classmethod
    def validate_key(cls, value: str) -> str:
        return _validate_catalog_key(value)

    @field_validator("required_states")
    @classmethod
    def validate_states(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        for state in value:
            _validate_catalog_key(state)
        if len(value) != len(set(value)):
            raise ValueError("requiredStates values must be unique")
        return value


class ComponentCatalogComponentV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    key: str = Field(min_length=1, max_length=128)
    label_by_locale: dict[str, str]
    description_by_locale: dict[str, str]
    category: Literal["navigation", "hero", "social-proof", "content", "conversion", "footer"]
    variants: tuple[ComponentCatalogVariantV1, ...] = Field(min_length=1, max_length=32)
    slots: tuple[ComponentCatalogSlotV1, ...] = Field(default=(), max_length=128)
    interactions: tuple[ComponentCatalogInteractionV1, ...] = Field(default=(), max_length=32)
    style_slots: tuple[ComponentCatalogStyleSlotV1, ...] = Field(default=(), max_length=64)

    @field_validator("key")
    @classmethod
    def validate_key(cls, value: str) -> str:
        return _validate_catalog_key(value)

    @field_validator("label_by_locale", "description_by_locale")
    @classmethod
    def validate_text(cls, value: dict[str, str]) -> dict[str, str]:
        return _validate_localized_text(value)

    @model_validator(mode="after")
    def validate_component_contract(self) -> Self:
        slot_keys = {slot.key for slot in self.slots}
        _require_unique((variant.key for variant in self.variants), "variant keys")
        _require_unique((slot.key for slot in self.slots), "slot keys")
        _require_unique((slot.key for slot in self.style_slots), "style slot keys")
        _require_unique(((rule.event, rule.action) for rule in self.interactions), "interaction pairs")
        for variant in self.variants:
            if not set(variant.required_slot_keys).issubset(slot_keys):
                raise ValueError("Variant requiredSlotKeys must reference declared component slots")
        return self


class ComponentCatalogInputV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    schema_version: Literal[1] = 1
    catalog_version: str = Field(min_length=1, max_length=128)
    name_by_locale: dict[str, str]
    description_by_locale: dict[str, str]
    source: Literal["official", "extension"]
    source_version: str = Field(min_length=1, max_length=64)
    renderer_profile: str = Field(min_length=1, max_length=128)
    renderer_version: str = Field(min_length=1, max_length=64)
    compiler_version: str = Field(min_length=1, max_length=64)
    components: tuple[ComponentCatalogComponentV1, ...] = Field(min_length=1, max_length=512)

    @field_validator("catalog_version")
    @classmethod
    def validate_catalog_version(cls, value: str) -> str:
        if not CATALOG_VERSION_PATTERN.fullmatch(value):
            raise ValueError("catalogVersion must be a stable versioned identifier")
        return value

    @field_validator("name_by_locale", "description_by_locale")
    @classmethod
    def validate_text(cls, value: dict[str, str]) -> dict[str, str]:
        return _validate_localized_text(value)

    @model_validator(mode="after")
    def require_unique_components(self) -> Self:
        _require_unique((component.key for component in self.components), "component keys")
        return self


class ComponentCatalogV1(ComponentCatalogInputV1):
    checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")


def build_component_catalog(payload: ComponentCatalogInputV1) -> ComponentCatalogV1:
    checksum = (
        "sha256:"
        + hashlib.sha256(
            orjson.dumps(payload.model_dump(mode="json", by_alias=True), option=orjson.OPT_SORT_KEYS)
        ).hexdigest()
    )
    return ComponentCatalogV1.model_validate({
        **payload.model_dump(mode="json", by_alias=True),
        "checksum": checksum,
    })


def _require_unique(values, label: str) -> None:
    materialized = tuple(values)
    if len(materialized) != len(set(materialized)):
        raise ValueError(f"{label} must be unique")


__all__ = [
    "CatalogBindingKind",
    "CatalogInteractionAction",
    "CatalogInteractionEvent",
    "CatalogResponsiveLayout",
    "ComponentCatalogComponentV1",
    "ComponentCatalogInputV1",
    "ComponentCatalogInteractionV1",
    "ComponentCatalogSlotV1",
    "ComponentCatalogStyleSlotV1",
    "ComponentCatalogV1",
    "ComponentCatalogVariantV1",
    "build_component_catalog",
]
