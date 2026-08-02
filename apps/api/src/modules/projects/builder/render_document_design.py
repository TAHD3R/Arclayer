from __future__ import annotations

from collections.abc import Mapping
from typing import cast
from uuid import UUID

from pydantic import ConfigDict

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonValue
from src.modules.projects.builder.render_document_errors import raise_render_conflict, raise_render_invalid
from src.modules.projects.builder.render_document_schema import (
    BuilderRenderComponentRecipeOut,
    BuilderRenderRecipeResponsiveOut,
    BuilderRenderRecipeStateOut,
    BuilderRenderThemeOut,
    BuilderResolvedMotionOut,
    BuilderResolvedTokenOut,
    BuilderResolvedTypographyOut,
)
from src.modules.projects.builder.visual_blueprint_schema import VisualBlueprintSectionV1
from src.modules.sites.component_catalogs.schema import (
    ComponentCatalogInputV1,
    ComponentCatalogV1,
    build_component_catalog,
)
from src.modules.workspaces.design_systems.component_recipe_validation import validate_design_component_recipes
from src.modules.workspaces.design_systems.manifest import (
    DesignComponentRecipeV1,
    DesignSystemManifestV1,
    DesignThemeV1,
    DesignTokenDefinitionV1,
    TokenValue,
    all_design_tokens,
    compute_design_system_manifest_checksum,
    validate_typed_token_value,
)

RENDERER_PROFILE = "arclayer-site-v1"
RENDERER_VERSION = "1.0.0"


class BuilderRenderDesignPins(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    design_system_id: UUID
    design_system_version_id: UUID
    design_system_manifest_checksum: str


def resolve_design_token_values(
    *,
    design_manifest: DesignSystemManifestV1,
    theme_key: str | None = None,
) -> tuple[DesignThemeV1, dict[str, TokenValue]]:
    theme = _select_theme(design_manifest=design_manifest, theme_key=theme_key)
    return theme, _resolved_token_values(design_manifest=design_manifest, theme=theme)


def resolve_renderer_design(
    *,
    design_manifest: DesignSystemManifestV1,
    catalog: ComponentCatalogV1,
    expected_manifest_checksum: str,
    theme_key: str | None,
) -> tuple[
    BuilderRenderThemeOut,
    dict[str, TokenValue],
    dict[tuple[str, str], DesignComponentRecipeV1],
]:
    _validate_design_contract(
        design_manifest=design_manifest,
        catalog=catalog,
        expected_manifest_checksum=expected_manifest_checksum,
    )
    theme, token_values = resolve_design_token_values(
        design_manifest=design_manifest,
        theme_key=theme_key,
    )
    recipes = _validated_recipes(design_manifest=design_manifest, catalog=catalog)
    return (
        _render_theme(design_manifest=design_manifest, theme=theme, values=token_values),
        token_values,
        recipes,
    )


def render_component_recipe(
    *,
    recipe: DesignComponentRecipeV1,
    token_values: Mapping[str, TokenValue],
) -> BuilderRenderComponentRecipeOut:
    def state_out(state) -> BuilderRenderRecipeStateOut:
        return BuilderRenderRecipeStateOut(
            state_key=state.state_key,
            style_values={key: cast(JsonValue, token_values[path]) for key, path in sorted(state.style_tokens.items())},
        )

    return BuilderRenderComponentRecipeOut(
        key=recipe.key,
        states=tuple(state_out(state) for state in recipe.states),
        responsive_overrides=tuple(
            BuilderRenderRecipeResponsiveOut(
                breakpoint=item.breakpoint,
                states=tuple(state_out(state) for state in item.states),
            )
            for item in recipe.responsive_overrides
        ),
    )


def render_component_recipe_with_blueprint(
    *,
    recipe: DesignComponentRecipeV1 | None,
    blueprint_section: VisualBlueprintSectionV1 | None,
    token_values: Mapping[str, TokenValue],
) -> BuilderRenderComponentRecipeOut | None:
    if recipe is None and blueprint_section is None:
        return None
    base = render_component_recipe(recipe=recipe, token_values=token_values) if recipe is not None else None
    states = {state.state_key: dict(state.style_values) for state in base.states} if base is not None else {}
    responsive = (
        {
            item.breakpoint: {state.state_key: dict(state.style_values) for state in item.states}
            for item in base.responsive_overrides
        }
        if base is not None
        else {}
    )
    if blueprint_section is not None:
        for state in blueprint_section.states:
            target = states.setdefault(state.state_key, {})
            target.update(_resolve_blueprint_tokens(state.style_tokens, token_values))
        for override in blueprint_section.responsive_overrides:
            target_states = responsive.setdefault(override.breakpoint, {})
            for state in override.states:
                target = target_states.setdefault(state.state_key, {})
                target.update(_resolve_blueprint_tokens(state.style_tokens, token_values))
    return BuilderRenderComponentRecipeOut(
        key=(
            base.key
            if base is not None
            else f"visual.{blueprint_section.section_id if blueprint_section is not None else 'section'}"
        ),
        states=tuple(
            BuilderRenderRecipeStateOut(state_key=state_key, style_values=values)
            for state_key, values in sorted(states.items())
        ),
        responsive_overrides=tuple(
            BuilderRenderRecipeResponsiveOut(
                breakpoint=breakpoint,
                states=tuple(
                    BuilderRenderRecipeStateOut(state_key=state_key, style_values=values)
                    for state_key, values in sorted(state_values.items())
                ),
            )
            for breakpoint, state_values in sorted(responsive.items())
        ),
    )


def _resolve_blueprint_tokens(
    style_tokens: Mapping[str, str],
    token_values: Mapping[str, TokenValue],
) -> dict[str, JsonValue]:
    result: dict[str, JsonValue] = {}
    for style_slot, token_path in sorted(style_tokens.items()):
        if token_path not in token_values:
            raise_render_invalid("BUILDER_DESIGN_TOKEN_REQUIRED", tokenPath=token_path)
        result[style_slot] = cast(JsonValue, token_values[token_path])
    return result


def _validate_design_contract(
    *,
    design_manifest: DesignSystemManifestV1,
    catalog: ComponentCatalogV1,
    expected_manifest_checksum: str,
) -> None:
    catalog_input = ComponentCatalogInputV1.model_validate(catalog.model_dump(mode="json", exclude={"checksum"}))
    catalog_checksum = build_component_catalog(catalog_input).checksum
    if (
        compute_design_system_manifest_checksum(design_manifest) != design_manifest.checksum
        or design_manifest.checksum != expected_manifest_checksum
        or catalog_checksum != catalog.checksum
        or design_manifest.component_catalog_version != catalog.catalog_version
        or catalog.renderer_profile != RENDERER_PROFILE
        or catalog.renderer_version != RENDERER_VERSION
    ):
        raise_render_invalid("BUILDER_RENDER_DESIGN_CONTRACT_INVALID")


def _select_theme(*, design_manifest: DesignSystemManifestV1, theme_key: str | None) -> DesignThemeV1:
    if theme_key is not None:
        theme = next((item for item in design_manifest.themes if item.key == theme_key), None)
    else:
        light_themes = tuple(item for item in design_manifest.themes if item.mode == "light")
        theme = light_themes[0] if len(light_themes) == 1 else None
    if theme is None:
        raise_render_conflict("BUILDER_RENDER_THEME_NOT_FOUND", details={"theme": theme_key})
    return theme


def _resolved_token_values(
    *,
    design_manifest: DesignSystemManifestV1,
    theme: DesignThemeV1,
) -> dict[str, TokenValue]:
    tokens = all_design_tokens(design_manifest)
    result: dict[str, TokenValue] = {}
    for path, token in sorted(tokens.items()):
        value = _resolve_token(path=path, theme=theme, tokens=tokens, active=frozenset())
        try:
            validate_typed_token_value(token.type, value)
        except ValueError:
            raise_render_invalid("BUILDER_RENDER_TOKEN_INVALID", tokenPath=path)
        result[path] = value
    return result


def _resolve_token(
    *,
    path: str,
    theme: DesignThemeV1,
    tokens: Mapping[str, DesignTokenDefinitionV1],
    active: frozenset[str],
) -> TokenValue:
    if path in active:
        raise_render_invalid("BUILDER_RENDER_TOKEN_CYCLE", tokenPath=path)
    token = tokens.get(path)
    if token is None:
        raise_render_invalid("BUILDER_RENDER_TOKEN_REQUIRED", tokenPath=path)
    override = theme.overrides.get(path)
    value = override.value if override is not None else token.value
    alias = override.alias if override is not None else token.alias
    if value is not None:
        return value
    if alias is None:
        raise_render_invalid("BUILDER_RENDER_TOKEN_REQUIRED", tokenPath=path)
    return _resolve_token(path=alias, theme=theme, tokens=tokens, active=active | {path})


def _render_theme(
    *,
    design_manifest: DesignSystemManifestV1,
    theme: DesignThemeV1,
    values: Mapping[str, TokenValue],
) -> BuilderRenderThemeOut:
    tokens = all_design_tokens(design_manifest)
    typography = tuple(
        BuilderResolvedTypographyOut(
            key=role.key,
            name=role.name,
            font_family=cast(tuple[str, ...], values[role.font_family_token]),
            font_weight=cast(int, values[role.font_weight_token]),
            font_size=cast(str, values[role.font_size_token]),
            line_height=cast(int | float, values[role.line_height_token]),
            letter_spacing=(cast(str, values[role.letter_spacing_token]) if role.letter_spacing_token else None),
        )
        for role in design_manifest.typography_roles
    )
    motion = tuple(
        BuilderResolvedMotionOut(
            key=role.key,
            name=role.name,
            duration=cast(str, values[role.duration_token]),
            easing=cast(tuple[float, float, float, float], values[role.easing_token]),
            reduced_motion_duration=cast(str, values[role.reduced_motion_duration_token]),
        )
        for role in design_manifest.motion_tokens
    )
    return BuilderRenderThemeOut(
        key=theme.key,
        mode=theme.mode,
        tokens=tuple(
            BuilderResolvedTokenOut(path=path, type=tokens[path].type, value=cast(JsonValue, values[path]))
            for path in sorted(values)
        ),
        typography=typography,
        motion=motion,
    )


def _validated_recipes(
    *,
    design_manifest: DesignSystemManifestV1,
    catalog: ComponentCatalogV1,
) -> dict[tuple[str, str], DesignComponentRecipeV1]:
    resolver = _SingleCatalogResolver(catalog)
    validation = validate_design_component_recipes(manifest=design_manifest, resolver=resolver)
    if validation.compatibility != "compatible":
        raise_render_invalid(
            "BUILDER_RENDER_COMPONENT_RECIPE_INVALID",
            findings=[item.model_dump(mode="json", by_alias=True) for item in validation.findings],
        )
    recipes: dict[tuple[str, str], DesignComponentRecipeV1] = {}
    for recipe in design_manifest.component_recipes:
        identity = (recipe.component_key, recipe.variant_key)
        if identity in recipes:
            raise_render_invalid(
                "BUILDER_RENDER_COMPONENT_RECIPE_AMBIGUOUS",
                componentKey=recipe.component_key,
                variantKey=recipe.variant_key,
            )
        recipes[identity] = recipe
    return recipes


class _SingleCatalogResolver:
    def __init__(self, catalog: ComponentCatalogV1) -> None:
        self._catalog = catalog

    def resolve(self, catalog_version: str) -> ComponentCatalogV1 | None:
        return self._catalog if catalog_version == self._catalog.catalog_version else None

    def list_catalogs(self) -> tuple[ComponentCatalogV1, ...]:
        return (self._catalog,)


__all__ = [
    "BuilderRenderDesignPins",
    "RENDERER_PROFILE",
    "RENDERER_VERSION",
    "render_component_recipe",
    "render_component_recipe_with_blueprint",
    "resolve_renderer_design",
]
