from __future__ import annotations

import hashlib
import re
import unicodedata
from typing import Literal, Self

import orjson
from pydantic import ConfigDict, Field, field_validator, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonValue
from src.common.types.public_uuid import PublicUUID

CHECKSUM_PATTERN = r"^sha256:[0-9a-f]{64}$"
TOKEN_PATH_PATTERN = re.compile(r"^(primitive|semantic|component)\.[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$")
STABLE_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$")
DIMENSION_PATTERN = re.compile(r"^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:px|rem|em|%)$")
DURATION_PATTERN = re.compile(r"^(?:0|[1-9]\d*)(?:\.\d+)?(?:ms|s)$")
COLOR_PATTERN = re.compile(r"^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$")

TokenValueType = Literal[
    "color",
    "dimension",
    "number",
    "duration",
    "cubic-bezier",
    "font-family",
    "font-weight",
    "shadow",
]
TokenValue = str | int | float | tuple[str, ...] | tuple[float, float, float, float]


def normalize_design_system_name(value: str) -> str:
    normalized = " ".join(unicodedata.normalize("NFKC", value).strip().casefold().split())
    if not normalized:
        raise ValueError("Design System name cannot be empty")
    return normalized


def validate_token_path(value: str) -> str:
    if not TOKEN_PATH_PATTERN.fullmatch(value):
        raise ValueError("Token path must be a normalized layered identifier")
    return value


def validate_stable_key(value: str) -> str:
    if not STABLE_KEY_PATTERN.fullmatch(value):
        raise ValueError("Key must be a normalized stable identifier")
    return value


class DesignTokenDefinitionV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    type: TokenValueType
    value: TokenValue | None = None
    alias: str | None = None
    description: str | None = Field(default=None, max_length=500)
    deprecated: bool = False
    replacement: str | None = None

    @field_validator("alias", "replacement")
    @classmethod
    def _validate_reference(cls, value: str | None) -> str | None:
        return validate_token_path(value) if value is not None else None

    @model_validator(mode="after")
    def _validate_value_contract(self) -> Self:
        if (self.value is None) == (self.alias is None):
            raise ValueError("A token must declare exactly one value or alias")
        if self.deprecated and self.replacement is None:
            raise ValueError("A deprecated token must declare a replacement")
        if not self.deprecated and self.replacement is not None:
            raise ValueError("Only deprecated tokens may declare a replacement")
        if self.value is not None:
            validate_typed_token_value(self.type, self.value)
        return self


class DesignThemeOverrideV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    value: TokenValue | None = None
    alias: str | None = None

    @field_validator("alias")
    @classmethod
    def _validate_alias(cls, value: str | None) -> str | None:
        return validate_token_path(value) if value is not None else None

    @model_validator(mode="after")
    def _require_one_source(self) -> Self:
        if (self.value is None) == (self.alias is None):
            raise ValueError("A theme override must declare exactly one value or alias")
        return self


class DesignThemeV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    key: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    mode: Literal["light", "dark", "high-contrast"]
    overrides: dict[str, DesignThemeOverrideV1] = Field(default_factory=dict, max_length=512)

    @field_validator("key")
    @classmethod
    def _validate_key(cls, value: str) -> str:
        return validate_stable_key(value)

    @field_validator("overrides")
    @classmethod
    def _validate_override_paths(
        cls,
        value: dict[str, DesignThemeOverrideV1],
    ) -> dict[str, DesignThemeOverrideV1]:
        for path in value:
            validate_token_path(path)
        return value


class DesignTypographyRoleV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    key: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    font_family_token: str
    font_weight_token: str
    font_size_token: str
    line_height_token: str
    letter_spacing_token: str | None = None

    @field_validator("key")
    @classmethod
    def _validate_key(cls, value: str) -> str:
        return validate_stable_key(value)

    @field_validator(
        "font_family_token",
        "font_weight_token",
        "font_size_token",
        "line_height_token",
        "letter_spacing_token",
    )
    @classmethod
    def _validate_token_reference(cls, value: str | None) -> str | None:
        return validate_token_path(value) if value is not None else None


class DesignMotionRoleV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    key: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    duration_token: str
    easing_token: str
    reduced_motion_duration_token: str

    @field_validator("key")
    @classmethod
    def _validate_key(cls, value: str) -> str:
        return validate_stable_key(value)

    @field_validator("duration_token", "easing_token", "reduced_motion_duration_token")
    @classmethod
    def _validate_token_reference(cls, value: str) -> str:
        return validate_token_path(value)


class DesignComponentStateRecipeV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    state_key: str = Field(min_length=1, max_length=64)
    style_tokens: dict[str, str] = Field(min_length=1, max_length=64)

    @field_validator("state_key")
    @classmethod
    def _validate_state_key(cls, value: str) -> str:
        return validate_stable_key(value)

    @field_validator("style_tokens")
    @classmethod
    def _validate_style_tokens(cls, value: dict[str, str]) -> dict[str, str]:
        for slot_key, token_path in value.items():
            validate_stable_key(slot_key)
            validate_token_path(token_path)
        return value


class DesignComponentResponsiveRecipeV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    breakpoint: str = Field(min_length=1, max_length=64)
    states: tuple[DesignComponentStateRecipeV1, ...] = Field(min_length=1, max_length=16)

    @field_validator("breakpoint")
    @classmethod
    def _validate_breakpoint(cls, value: str) -> str:
        return validate_stable_key(value)

    @model_validator(mode="after")
    def _validate_unique_states(self) -> Self:
        _require_unique((state.state_key for state in self.states), "Responsive recipe state keys")
        return self


class DesignComponentRecipeV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    key: str = Field(min_length=1, max_length=128)
    component_key: str = Field(min_length=1, max_length=128)
    variant_key: str = Field(min_length=1, max_length=128)
    states: tuple[DesignComponentStateRecipeV1, ...] = Field(min_length=1, max_length=16)
    responsive_overrides: tuple[DesignComponentResponsiveRecipeV1, ...] = Field(default=(), max_length=16)

    @field_validator("key", "component_key", "variant_key")
    @classmethod
    def _validate_key(cls, value: str) -> str:
        return validate_stable_key(value)

    @model_validator(mode="after")
    def _validate_unique_contracts(self) -> Self:
        _require_unique((state.state_key for state in self.states), "Recipe state keys")
        _require_unique((item.breakpoint for item in self.responsive_overrides), "Recipe responsive breakpoints")
        return self


class DesignAssetReferenceV1(BaseSchema):
    """An immutable Workspace Asset pin consumed by the publication compiler."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    asset_id: PublicUUID
    checksum_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    kind: Literal["font", "image", "icon", "logo"]
    font_family: str | None = Field(default=None, min_length=1, max_length=256)

    @model_validator(mode="after")
    def _validate_font_metadata(self) -> Self:
        if self.kind == "font" and self.font_family is None:
            raise ValueError("Font Asset references require fontFamily")
        if self.kind != "font" and self.font_family is not None:
            raise ValueError("Only font Asset references may declare fontFamily")
        return self


class DesignSystemManifestInputV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    manifest_version: Literal[1] = 1
    name: str = Field(min_length=1, max_length=128)
    primitive_tokens: dict[str, DesignTokenDefinitionV1] = Field(default_factory=dict, max_length=512)
    semantic_tokens: dict[str, DesignTokenDefinitionV1] = Field(default_factory=dict, max_length=512)
    component_tokens: dict[str, DesignTokenDefinitionV1] = Field(default_factory=dict, max_length=512)
    themes: tuple[DesignThemeV1, ...] = Field(min_length=1, max_length=8)
    typography_roles: tuple[DesignTypographyRoleV1, ...] = Field(default_factory=tuple, max_length=64)
    component_recipes: tuple[DesignComponentRecipeV1, ...] = Field(default_factory=tuple, max_length=128)
    motion_tokens: tuple[DesignMotionRoleV1, ...] = Field(default_factory=tuple, max_length=64)
    breakpoints: dict[str, str] = Field(default_factory=dict, max_length=16)
    asset_references: tuple[DesignAssetReferenceV1, ...] = Field(default_factory=tuple, max_length=128)
    component_catalog_version: str | None = Field(default=None, min_length=1, max_length=128)
    extensions: dict[str, JsonValue] = Field(default_factory=dict, max_length=64)

    @field_validator("primitive_tokens", "semantic_tokens", "component_tokens")
    @classmethod
    def _validate_token_paths(
        cls,
        value: dict[str, DesignTokenDefinitionV1],
        info,
    ) -> dict[str, DesignTokenDefinitionV1]:
        expected_layer = str(info.field_name).removesuffix("_tokens")
        for path in value:
            validate_token_path(path)
            if not path.startswith(f"{expected_layer}."):
                raise ValueError(f"Token path must belong to the {expected_layer} layer")
        return value

    @field_validator("breakpoints")
    @classmethod
    def _validate_breakpoints(cls, value: dict[str, str]) -> dict[str, str]:
        for key, dimension in value.items():
            validate_stable_key(key)
            if not DIMENSION_PATTERN.fullmatch(dimension):
                raise ValueError("Breakpoint values must be dimensions")
        return value

    @field_validator("extensions")
    @classmethod
    def _validate_extensions(cls, value: dict[str, JsonValue]) -> dict[str, JsonValue]:
        if any(":" not in key or key.startswith(":") or key.endswith(":") for key in value):
            raise ValueError("Extension keys must be explicitly namespaced")
        return value

    @model_validator(mode="after")
    def _validate_unique_keys(self) -> Self:
        _require_unique((theme.key for theme in self.themes), "Theme keys")
        _require_unique((role.key for role in self.typography_roles), "Typography role keys")
        _require_unique((role.key for role in self.motion_tokens), "Motion role keys")
        _require_unique((str(reference.asset_id) for reference in self.asset_references), "Asset reference ids")
        _require_unique((recipe.key for recipe in self.component_recipes), "Component recipe keys")
        return self


class DesignSystemManifestV1(DesignSystemManifestInputV1):
    checksum: str = Field(pattern=CHECKSUM_PATTERN)


def build_design_system_manifest(payload: DesignSystemManifestInputV1) -> DesignSystemManifestV1:
    checksum = design_system_content_digest(_canonical_manifest_bytes(payload))
    return DesignSystemManifestV1.model_validate({
        **payload.model_dump(mode="json", by_alias=True),
        "checksum": checksum,
    })


def compute_design_system_manifest_checksum(manifest: DesignSystemManifestV1) -> str:
    payload = DesignSystemManifestInputV1.model_validate(manifest.model_dump(mode="json", exclude={"checksum"}))
    return design_system_content_digest(_canonical_manifest_bytes(payload))


def compute_design_token_index_hash(manifest: DesignSystemManifestV1) -> str:
    tokens = all_design_tokens(manifest)
    index = {
        "tokens": [{"path": path, "type": token.type, "alias": token.alias} for path, token in sorted(tokens.items())],
        "themes": [
            {"key": theme.key, "mode": theme.mode, "paths": sorted(theme.overrides)}
            for theme in sorted(manifest.themes, key=lambda item: item.key)
        ],
    }
    return design_system_content_digest(orjson.dumps(index, option=orjson.OPT_SORT_KEYS))


def all_design_tokens(manifest: DesignSystemManifestInputV1) -> dict[str, DesignTokenDefinitionV1]:
    return {
        **manifest.primitive_tokens,
        **manifest.semantic_tokens,
        **manifest.component_tokens,
    }


def design_system_content_digest(content: bytes) -> str:
    return f"sha256:{hashlib.sha256(content).hexdigest()}"


def _canonical_manifest_bytes(manifest: DesignSystemManifestInputV1) -> bytes:
    return orjson.dumps(manifest.model_dump(mode="json", by_alias=True), option=orjson.OPT_SORT_KEYS)


def _require_unique(values, label: str) -> None:
    materialized = tuple(values)
    if len(materialized) != len(set(materialized)):
        raise ValueError(f"{label} must be unique")


def validate_typed_token_value(value_type: TokenValueType, value: TokenValue) -> None:
    if value_type == "color" and not (isinstance(value, str) and COLOR_PATTERN.fullmatch(value)):
        raise ValueError("Color tokens must use six- or eight-digit hex values")
    if value_type == "dimension" and not (isinstance(value, str) and DIMENSION_PATTERN.fullmatch(value)):
        raise ValueError("Dimension tokens must use px, rem, em, or percent values")
    if value_type == "number" and (isinstance(value, bool) or not isinstance(value, (int, float))):
        raise ValueError("Number tokens must be numeric")
    if value_type == "duration" and not (isinstance(value, str) and DURATION_PATTERN.fullmatch(value)):
        raise ValueError("Duration tokens must use ms or s values")
    if value_type == "cubic-bezier":
        if not isinstance(value, tuple) or len(value) != 4 or any(isinstance(item, bool) for item in value):
            raise ValueError("Cubic-bezier tokens require four numeric values")
        if any(not isinstance(item, (int, float)) for item in value):
            raise ValueError("Cubic-bezier tokens require four numeric values")
        first_x = value[0]
        second_x = value[2]
        if not isinstance(first_x, (int, float)) or not isinstance(second_x, (int, float)):
            raise ValueError("Cubic-bezier x coordinates must be numeric")
        if not 0 <= first_x <= 1 or not 0 <= second_x <= 1:
            raise ValueError("Cubic-bezier x coordinates must be between zero and one")
    if value_type == "font-family":
        if not isinstance(value, tuple) or not value or any(not isinstance(item, str) or not item for item in value):
            raise ValueError("Font-family tokens require a non-empty family stack")
    if value_type == "font-weight" and (
        isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 1000
    ):
        raise ValueError("Font-weight tokens must be integers from 1 to 1000")
    if value_type == "shadow" and not (isinstance(value, str) and value):
        raise ValueError("Shadow tokens require a non-empty value")
