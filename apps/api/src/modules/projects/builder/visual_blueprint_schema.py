from __future__ import annotations

from typing import Literal, Self

from pydantic import ConfigDict, Field, field_validator, model_validator

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.modules.workspaces.design_systems.manifest import validate_stable_key, validate_token_path


class VisualBlueprintStateV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    state_key: str = Field(min_length=1, max_length=64)
    style_tokens: dict[str, str] = Field(default_factory=dict, max_length=64)

    @field_validator("state_key")
    @classmethod
    def validate_state_key(cls, value: str) -> str:
        return validate_stable_key(value)

    @field_validator("style_tokens")
    @classmethod
    def validate_style_tokens(cls, value: dict[str, str]) -> dict[str, str]:
        for slot_key, token_path in value.items():
            validate_stable_key(slot_key)
            validate_token_path(token_path)
        return value


class VisualBlueprintResponsiveV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    breakpoint: str = Field(min_length=1, max_length=64)
    states: tuple[VisualBlueprintStateV1, ...] = Field(default=(), max_length=16)

    @field_validator("breakpoint")
    @classmethod
    def validate_breakpoint(cls, value: str) -> str:
        return validate_stable_key(value)

    @model_validator(mode="after")
    def require_unique_states(self) -> Self:
        _require_unique((state.state_key for state in self.states), "responsive state keys")
        return self


class VisualBlueprintSectionV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    section_id: str = Field(min_length=1, max_length=128)
    component_key: str = Field(min_length=1, max_length=128)
    variant_key: str = Field(min_length=1, max_length=128)
    states: tuple[VisualBlueprintStateV1, ...] = Field(default=(), max_length=16)
    responsive_overrides: tuple[VisualBlueprintResponsiveV1, ...] = Field(default=(), max_length=16)

    @model_validator(mode="after")
    def require_unique_contracts(self) -> Self:
        _require_unique((state.state_key for state in self.states), "section state keys")
        _require_unique(
            (override.breakpoint for override in self.responsive_overrides),
            "section responsive breakpoints",
        )
        return self


class VisualBlueprintDocumentV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    schema_version: Literal[1] = 1
    item_id: PublicUUID
    source_wireframe_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    design_system_version_id: PublicUUID
    design_system_manifest_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    component_catalog_version: str = Field(min_length=1, max_length=128)
    component_catalog_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    sections: tuple[VisualBlueprintSectionV1, ...] = Field(default=(), max_length=256)

    @model_validator(mode="after")
    def require_unique_sections(self) -> Self:
        _require_unique((section.section_id for section in self.sections), "visual section ids")
        return self


def _require_unique(values, label: str) -> None:
    materialized = tuple(values)
    if len(materialized) != len(set(materialized)):
        raise ValueError(f"{label} must be unique")


__all__ = [
    "VisualBlueprintDocumentV1",
    "VisualBlueprintResponsiveV1",
    "VisualBlueprintSectionV1",
    "VisualBlueprintStateV1",
]
