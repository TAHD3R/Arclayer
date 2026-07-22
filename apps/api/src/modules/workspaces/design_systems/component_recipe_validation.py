from __future__ import annotations

from collections.abc import Mapping
from typing import Literal

from pydantic import ConfigDict

from src.common.schemas import BaseSchema
from src.modules.sites.component_catalogs.registry import ComponentCatalogResolver
from src.modules.sites.component_catalogs.schema import ComponentCatalogStyleSlotV1
from src.modules.workspaces.design_systems.manifest import (
    DesignComponentRecipeV1,
    DesignComponentStateRecipeV1,
    DesignSystemManifestV1,
    DesignTokenDefinitionV1,
    all_design_tokens,
)


class DesignComponentRecipeFinding(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    code: str
    path: str | None = None
    related_path: str | None = None


class DesignComponentRecipeValidation(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    compatibility: Literal["not_evaluated", "compatible", "incompatible"]
    catalog_checksum: str | None = None
    findings: tuple[DesignComponentRecipeFinding, ...]


def validate_design_component_recipes(
    *,
    manifest: DesignSystemManifestV1,
    resolver: ComponentCatalogResolver | None,
) -> DesignComponentRecipeValidation:
    catalog_version = manifest.component_catalog_version
    if catalog_version is None:
        findings = (
            (_finding("DESIGN_SYSTEM_COMPONENT_CATALOG_REQUIRED", path="componentRecipes"),)
            if manifest.component_recipes
            else ()
        )
        return DesignComponentRecipeValidation(
            compatibility="incompatible" if findings else "not_evaluated",
            findings=findings,
        )
    if resolver is None:
        return DesignComponentRecipeValidation(
            compatibility="incompatible",
            findings=(_finding("DESIGN_SYSTEM_COMPONENT_RECIPE_GATED", path="componentCatalogVersion"),),
        )
    catalog = resolver.resolve(catalog_version)
    if catalog is None:
        return DesignComponentRecipeValidation(
            compatibility="incompatible",
            findings=(_finding("DESIGN_SYSTEM_COMPONENT_CATALOG_UNKNOWN", path="componentCatalogVersion"),),
        )

    components = {component.key: component for component in catalog.components}
    tokens = all_design_tokens(manifest)
    findings: list[DesignComponentRecipeFinding] = []
    for recipe in manifest.component_recipes:
        path = f"componentRecipes.{recipe.key}"
        component = components.get(recipe.component_key)
        if component is None:
            findings.append(_finding("DESIGN_SYSTEM_COMPONENT_UNKNOWN", path=path, related=recipe.component_key))
            continue
        variant = next((item for item in component.variants if item.key == recipe.variant_key), None)
        if variant is None:
            findings.append(_finding("DESIGN_SYSTEM_COMPONENT_VARIANT_UNKNOWN", path=path, related=recipe.variant_key))
            continue
        style_slots = {slot.key: slot for slot in component.style_slots}
        _validate_recipe_states(
            recipe=recipe,
            path=path,
            style_slots=style_slots,
            tokens=tokens,
            findings=findings,
        )
        for responsive in recipe.responsive_overrides:
            responsive_path = f"{path}.responsiveOverrides.{responsive.breakpoint}"
            if responsive.breakpoint not in manifest.breakpoints:
                findings.append(
                    _finding(
                        "DESIGN_SYSTEM_COMPONENT_BREAKPOINT_UNKNOWN",
                        path=responsive_path,
                        related=responsive.breakpoint,
                    )
                )
            _validate_declared_states(
                states=responsive.states,
                path=responsive_path,
                style_slots=style_slots,
                tokens=tokens,
                findings=findings,
            )
    return DesignComponentRecipeValidation(
        compatibility="incompatible" if findings else "compatible",
        catalog_checksum=catalog.checksum,
        findings=tuple(findings),
    )


def _validate_recipe_states(
    *,
    recipe: DesignComponentRecipeV1,
    path: str,
    style_slots: Mapping[str, ComponentCatalogStyleSlotV1],
    tokens: Mapping[str, DesignTokenDefinitionV1],
    findings: list[DesignComponentRecipeFinding],
) -> None:
    _validate_declared_states(
        states=recipe.states,
        path=path,
        style_slots=style_slots,
        tokens=tokens,
        findings=findings,
    )
    declared = {(state.state_key, slot_key) for state in recipe.states for slot_key in state.style_tokens}
    for slot in style_slots.values():
        for state_key in slot.required_states:
            if (state_key, slot.key) not in declared:
                findings.append(
                    _finding(
                        "DESIGN_SYSTEM_COMPONENT_STYLE_SLOT_REQUIRED",
                        path=f"{path}.states.{state_key}",
                        related=slot.key,
                    )
                )


def _validate_declared_states(
    *,
    states: tuple[DesignComponentStateRecipeV1, ...],
    path: str,
    style_slots: Mapping[str, ComponentCatalogStyleSlotV1],
    tokens: Mapping[str, DesignTokenDefinitionV1],
    findings: list[DesignComponentRecipeFinding],
) -> None:
    supported_states = {state for slot in style_slots.values() for state in slot.required_states}
    for state in states:
        state_path = f"{path}.states.{state.state_key}"
        if state.state_key not in supported_states:
            findings.append(_finding("DESIGN_SYSTEM_COMPONENT_STATE_UNKNOWN", path=state_path, related=state.state_key))
        for slot_key, token_path in state.style_tokens.items():
            slot = style_slots.get(slot_key)
            if slot is None:
                findings.append(
                    _finding("DESIGN_SYSTEM_COMPONENT_STYLE_SLOT_UNKNOWN", path=state_path, related=slot_key)
                )
                continue
            token = tokens.get(token_path)
            if token is None or token.type != slot.value_type:
                findings.append(
                    _finding(
                        "DESIGN_SYSTEM_COMPONENT_TOKEN_TYPE_MISMATCH",
                        path=f"{state_path}.{slot_key}",
                        related=token_path,
                    )
                )


def _finding(code: str, *, path: str, related: str | None = None) -> DesignComponentRecipeFinding:
    return DesignComponentRecipeFinding(code=code, path=path, related_path=related)


__all__ = [
    "DesignComponentRecipeFinding",
    "DesignComponentRecipeValidation",
    "validate_design_component_recipes",
]
