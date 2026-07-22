from __future__ import annotations

from copy import deepcopy
from typing import Any

import pytest
from pydantic import ValidationError

from src.models.design_systems._enums import DesignSystemValidationStatus
from src.modules.sites.component_catalogs.official import get_official_component_catalog_registry
from src.modules.workspaces.design_systems.manifest import (
    DesignSystemManifestInputV1,
    build_design_system_manifest,
    compute_design_system_manifest_checksum,
)
from src.modules.workspaces.design_systems.validator import validate_design_system_foundation


def _manifest_payload() -> dict[str, Any]:
    return {
        "manifestVersion": 1,
        "name": "Editorial Contrast",
        "primitiveTokens": {
            "primitive.color.white": {"type": "color", "value": "#FFFFFF"},
            "primitive.color.ink": {"type": "color", "value": "#111111"},
            "primitive.color.muted": {"type": "color", "value": "#595959"},
            "primitive.color.action": {"type": "color", "value": "#155EEF"},
            "primitive.color.on-action": {"type": "color", "value": "#FFFFFF"},
            "primitive.color.border": {"type": "color", "value": "#D5D7DA"},
            "primitive.color.focus": {"type": "color", "value": "#155EEF"},
            "primitive.font.family.body": {"type": "font-family", "value": ["Figtree", "sans-serif"]},
            "primitive.font.weight.regular": {"type": "font-weight", "value": 400},
            "primitive.font.size.body": {"type": "dimension", "value": "1rem"},
            "primitive.font.line-height.body": {"type": "number", "value": 1.5},
            "primitive.motion.duration.standard": {"type": "duration", "value": "180ms"},
            "primitive.motion.duration.reduced": {"type": "duration", "value": "0ms"},
            "primitive.motion.easing.standard": {
                "type": "cubic-bezier",
                "value": [0.2, 0.8, 0.2, 1.0],
            },
        },
        "semanticTokens": {
            "semantic.color.surface.canvas": {"type": "color", "alias": "primitive.color.white"},
            "semantic.color.text.primary": {"type": "color", "alias": "primitive.color.ink"},
            "semantic.color.text.secondary": {"type": "color", "alias": "primitive.color.muted"},
            "semantic.color.action.primary": {"type": "color", "alias": "primitive.color.action"},
            "semantic.color.action.on-primary": {"type": "color", "alias": "primitive.color.on-action"},
            "semantic.color.border.default": {"type": "color", "alias": "primitive.color.border"},
            "semantic.color.focus.ring": {"type": "color", "alias": "primitive.color.focus"},
        },
        "componentTokens": {},
        "themes": [{"key": "light", "name": "Light", "mode": "light", "overrides": {}}],
        "typographyRoles": [
            {
                "key": "body",
                "name": "Body",
                "fontFamilyToken": "primitive.font.family.body",
                "fontWeightToken": "primitive.font.weight.regular",
                "fontSizeToken": "primitive.font.size.body",
                "lineHeightToken": "primitive.font.line-height.body",
            }
        ],
        "componentRecipes": [],
        "motionTokens": [
            {
                "key": "standard",
                "name": "Standard transition",
                "durationToken": "primitive.motion.duration.standard",
                "easingToken": "primitive.motion.easing.standard",
                "reducedMotionDurationToken": "primitive.motion.duration.reduced",
            }
        ],
        "breakpoints": {"tablet": "48rem", "desktop": "80rem"},
        "assetReferences": [],
        "componentCatalogVersion": None,
        "extensions": {},
    }


def test_manifest_is_strict_canonical_and_foundation_valid_but_not_publishable() -> None:
    manifest_input = DesignSystemManifestInputV1.model_validate(_manifest_payload())
    manifest = build_design_system_manifest(manifest_input)

    assert compute_design_system_manifest_checksum(manifest) == manifest.checksum
    outcome = validate_design_system_foundation(manifest)

    assert outcome.status == DesignSystemValidationStatus.VALID
    assert outcome.publish_ready is False
    assert outcome.compatibility["renderer"] == "not_evaluated"
    assert [finding.code for finding in outcome.findings] == ["DESIGN_SYSTEM_RENDERER_NOT_EVALUATED"]


def test_manifest_rejects_unknown_fields_and_invalid_typed_values() -> None:
    extra = _manifest_payload()
    extra["inventedFallback"] = True
    with pytest.raises(ValidationError):
        DesignSystemManifestInputV1.model_validate(extra)

    invalid_value = _manifest_payload()
    invalid_value["primitiveTokens"]["primitive.color.white"]["value"] = "white"
    with pytest.raises(ValidationError):
        DesignSystemManifestInputV1.model_validate(invalid_value)


def test_foundation_validation_exposes_graph_theme_and_contrast_blockers() -> None:
    payload = deepcopy(_manifest_payload())
    primitive = payload["primitiveTokens"]
    semantic = payload["semanticTokens"]
    primitive["primitive.color.white"]["value"] = "#FFFFFF"
    primitive["primitive.color.muted"]["value"] = "#F5F5F5"
    semantic["semantic.color.text.primary"]["alias"] = "component.color.future"
    semantic.pop("semantic.color.focus.ring")

    manifest = build_design_system_manifest(DesignSystemManifestInputV1.model_validate(payload))
    outcome = validate_design_system_foundation(manifest)
    codes = {finding.code for finding in outcome.findings}

    assert outcome.status == DesignSystemValidationStatus.INVALID
    assert "DESIGN_SYSTEM_TOKEN_REFERENCE_MISSING" in codes
    assert "DESIGN_SYSTEM_TOKEN_LAYER_INVALID" not in codes
    assert "DESIGN_SYSTEM_SEMANTIC_ROLE_MISSING" in codes
    assert "DESIGN_SYSTEM_CONTRAST_FAILED" in codes


def test_component_recipe_validates_against_exact_registered_catalog() -> None:
    payload = _manifest_payload()
    payload["componentCatalogVersion"] = "arclayer-wireframe-v1"
    payload["componentRecipes"] = [
        {
            "key": "hero.default",
            "componentKey": "landing.hero",
            "variantKey": "default",
            "states": [
                {
                    "stateKey": "default",
                    "styleTokens": {
                        "surface.background": "semantic.color.surface.canvas",
                        "text.primary": "semantic.color.text.primary",
                        "action.background": "semantic.color.action.primary",
                    },
                },
                {
                    "stateKey": "hover",
                    "styleTokens": {"action.background": "semantic.color.action.primary"},
                },
                {
                    "stateKey": "focus",
                    "styleTokens": {"action.background": "semantic.color.action.primary"},
                },
            ],
            "responsiveOverrides": [],
        }
    ]
    manifest = build_design_system_manifest(DesignSystemManifestInputV1.model_validate(payload))

    outcome = validate_design_system_foundation(
        manifest,
        component_catalog_resolver=get_official_component_catalog_registry(),
    )

    assert outcome.status == DesignSystemValidationStatus.VALID
    assert outcome.compatibility["componentCatalog"] == "compatible"
    assert outcome.compatibility["componentCatalogChecksum"].startswith("sha256:")
    assert [finding.code for finding in outcome.findings] == ["DESIGN_SYSTEM_RENDERER_NOT_EVALUATED"]


def test_component_recipe_unknown_component_is_a_publication_blocker() -> None:
    payload = _manifest_payload()
    payload["componentCatalogVersion"] = "arclayer-wireframe-v1"
    payload["componentRecipes"] = [
        {
            "key": "unknown.default",
            "componentKey": "landing.unknown",
            "variantKey": "default",
            "states": [
                {
                    "stateKey": "default",
                    "styleTokens": {"surface.background": "semantic.color.surface.canvas"},
                }
            ],
        }
    ]
    manifest = build_design_system_manifest(DesignSystemManifestInputV1.model_validate(payload))

    outcome = validate_design_system_foundation(
        manifest,
        component_catalog_resolver=get_official_component_catalog_registry(),
    )

    assert outcome.status == DesignSystemValidationStatus.INVALID
    assert outcome.compatibility["componentCatalog"] == "incompatible"
    assert "DESIGN_SYSTEM_COMPONENT_UNKNOWN" in {finding.code for finding in outcome.findings}
