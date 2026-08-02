from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Final

import orjson
from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject, JsonValue
from src.modules.workspaces.design_systems.manifest import (
    DesignMotionRoleV1,
    DesignSystemManifestV1,
    DesignThemeV1,
    DesignTokenDefinitionV1,
    TokenValue,
    all_design_tokens,
    design_system_content_digest,
)
from src.modules.workspaces.design_systems.publication_assets import DesignSystemAssetPin

DESIGN_SYSTEM_COMPILER_VERSION: Final = "arclayer-design-system-compiler/1"
DESIGN_SYSTEM_RENDERER_PROFILE: Final = "arclayer-site-v1"
DESIGN_SYSTEM_RENDERER_VERSION: Final = "1.0.0"


class CompiledDesignSystemArtifact(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    artifact_input_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    artifact_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    payload: JsonObject


class DesignSystemCompilationError(ValueError):
    pass


def compile_design_system_artifact(
    *,
    manifest: DesignSystemManifestV1,
    validation_finding_hash: str,
    validator_version: int,
    asset_pins: Sequence[DesignSystemAssetPin],
    component_catalog_version: str | None,
    compiler_version: str = DESIGN_SYSTEM_COMPILER_VERSION,
    renderer_profile: str = DESIGN_SYSTEM_RENDERER_PROFILE,
    renderer_version: str = DESIGN_SYSTEM_RENDERER_VERSION,
) -> CompiledDesignSystemArtifact:
    normalized_pins = tuple(sorted(asset_pins, key=lambda pin: str(pin.asset_id)))
    artifact_input_hash = design_system_artifact_input_hash(
        manifest_checksum=manifest.checksum,
        validation_finding_hash=validation_finding_hash,
        validator_version=validator_version,
        asset_pins=normalized_pins,
        component_catalog_version=component_catalog_version,
        compiler_version=compiler_version,
        renderer_profile=renderer_profile,
        renderer_version=renderer_version,
    )
    themes = tuple(sorted(manifest.themes, key=lambda item: item.key))
    token_definitions = all_design_tokens(manifest)
    theme_payloads = tuple(
        _compile_theme(theme=theme, tokens=token_definitions, motion_tokens=manifest.motion_tokens) for theme in themes
    )
    payload: JsonObject = {
        "format": "design_system.compile.v1",
        "manifestChecksum": manifest.checksum,
        "componentCatalogVersion": component_catalog_version,
        "compilerVersion": compiler_version,
        "renderer": {"profile": renderer_profile, "version": renderer_version},
        "assetPins": [pin.model_dump(mode="json", by_alias=True) for pin in normalized_pins],
        "themes": list(theme_payloads),
        "componentRecipes": [
            recipe.model_dump(mode="json", by_alias=True)
            for recipe in sorted(manifest.component_recipes, key=lambda item: item.key)
        ],
    }
    artifact_hash = design_system_content_digest(orjson.dumps(payload, option=orjson.OPT_SORT_KEYS))
    return CompiledDesignSystemArtifact(
        artifact_input_hash=artifact_input_hash,
        artifact_hash=artifact_hash,
        payload=payload,
    )


def design_system_artifact_input_hash(
    *,
    manifest_checksum: str,
    validation_finding_hash: str,
    validator_version: int,
    asset_pins: Sequence[DesignSystemAssetPin],
    component_catalog_version: str | None,
    compiler_version: str,
    renderer_profile: str,
    renderer_version: str,
) -> str:
    normalized_pins = tuple(sorted(asset_pins, key=lambda pin: str(pin.asset_id)))
    input_payload: JsonObject = {
        "manifestChecksum": manifest_checksum,
        "validationFindingHash": validation_finding_hash,
        "validatorVersion": validator_version,
        "componentCatalogVersion": component_catalog_version,
        "compilerVersion": compiler_version,
        "rendererProfile": renderer_profile,
        "rendererVersion": renderer_version,
        "assetPins": [pin.model_dump(mode="json", by_alias=True) for pin in normalized_pins],
    }
    return design_system_content_digest(orjson.dumps(input_payload, option=orjson.OPT_SORT_KEYS))


def _compile_theme(
    *,
    theme: DesignThemeV1,
    tokens: Mapping[str, DesignTokenDefinitionV1],
    motion_tokens: Sequence[DesignMotionRoleV1],
) -> JsonObject:
    resolved = {
        path: _resolve_token(path=path, theme=theme, tokens=tokens, active=frozenset()) for path in sorted(tokens)
    }
    if any(value is None for value in resolved.values()):
        missing = next(path for path, value in resolved.items() if value is None)
        raise DesignSystemCompilationError(f"Unable to resolve token '{missing}' for theme '{theme.key}'")
    css_lines = [f"  --arclayer-{_css_name(path)}: {_css_value(value)};" for path, value in resolved.items()]
    reduced_motion_lines = _reduced_motion_css(theme=theme, tokens=tokens, motion_tokens=motion_tokens)
    css = "\n".join((
        f':root[data-arclayer-theme="{theme.key}"] {{',
        *css_lines,
        "}",
        *reduced_motion_lines,
    ))
    typed_tokens: JsonObject = {
        path: {
            "type": tokens[path].type,
            "value": _json_value(value),
        }
        for path, value in resolved.items()
    }
    return {
        "key": theme.key,
        "mode": theme.mode,
        "css": css,
        "tokens": typed_tokens,
    }


def _resolve_token(
    *,
    path: str,
    theme: DesignThemeV1,
    tokens: Mapping[str, DesignTokenDefinitionV1],
    active: frozenset[str],
) -> TokenValue | None:
    if path in active:
        return None
    token = tokens.get(path)
    if token is None:
        return None
    override = theme.overrides.get(path)
    if override is not None:
        if override.value is not None:
            return override.value
        if override.alias is None:
            return None
        return _resolve_token(path=override.alias, theme=theme, tokens=tokens, active=active | {path})
    if token.value is not None:
        return token.value
    if token.alias is None:
        return None
    return _resolve_token(path=token.alias, theme=theme, tokens=tokens, active=active | {path})


def _reduced_motion_css(
    *,
    theme: DesignThemeV1,
    tokens: Mapping[str, DesignTokenDefinitionV1],
    motion_tokens: Sequence[DesignMotionRoleV1],
) -> tuple[str, ...]:
    values: list[str] = []
    for role in sorted(motion_tokens, key=lambda item: item.key):
        value = _resolve_token(
            path=role.reduced_motion_duration_token,
            theme=theme,
            tokens=tokens,
            active=frozenset(),
        )
        if value is None:
            raise DesignSystemCompilationError(f"Unable to resolve reduced-motion duration for '{role.key}'")
        values.append(f"  --arclayer-motion-{_css_name(role.key)}-duration: {_css_value(value)};")
    if not values:
        return ()
    return (
        "@media (prefers-reduced-motion: reduce) {",
        f'  :root[data-arclayer-theme="{theme.key}"] {{',
        *values,
        "  }",
        "}",
    )


def _css_name(path: str) -> str:
    return path.replace(".", "-")


def _css_value(value: TokenValue | None) -> str:
    if value is None:
        raise DesignSystemCompilationError("A CSS token value cannot be null")
    if isinstance(value, tuple):
        return ", ".join(str(item) for item in value)
    return str(value)


def _json_value(value: TokenValue | None) -> JsonValue:
    if value is None:
        raise DesignSystemCompilationError("A typed token value cannot be null")
    if isinstance(value, tuple):
        return list(value)
    return value
