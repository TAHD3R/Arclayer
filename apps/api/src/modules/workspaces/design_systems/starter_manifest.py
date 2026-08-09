from __future__ import annotations

from typing import Any

from src.modules.workspaces.design_systems.manifest import DesignSystemManifestInputV1


def build_arclayer_starter_manifest() -> DesignSystemManifestInputV1:
    """Return the production starter manifest used by first-time Builder runs."""

    payload: dict[str, Any] = {
        "manifestVersion": 1,
        "name": "Arclayer Starter",
        "primitiveTokens": {
            "primitive.color.canvas": {"type": "color", "value": "#FFFFFF"},
            "primitive.color.ink": {"type": "color", "value": "#111111"},
            "primitive.color.muted": {"type": "color", "value": "#595959"},
            "primitive.color.action": {"type": "color", "value": "#155EEF"},
            "primitive.color.on-action": {"type": "color", "value": "#FFFFFF"},
            "primitive.color.border": {"type": "color", "value": "#D5D7DA"},
            "primitive.color.focus": {"type": "color", "value": "#155EEF"},
        },
        "semanticTokens": {
            "semantic.color.surface.canvas": {"type": "color", "alias": "primitive.color.canvas"},
            "semantic.color.text.primary": {"type": "color", "alias": "primitive.color.ink"},
            "semantic.color.text.secondary": {"type": "color", "alias": "primitive.color.muted"},
            "semantic.color.action.primary": {"type": "color", "alias": "primitive.color.action"},
            "semantic.color.action.on-primary": {"type": "color", "alias": "primitive.color.on-action"},
            "semantic.color.border.default": {"type": "color", "alias": "primitive.color.border"},
            "semantic.color.focus.ring": {"type": "color", "alias": "primitive.color.focus"},
        },
        "componentTokens": {},
        "themes": [{"key": "light", "name": "Light", "mode": "light", "overrides": {}}],
        "typographyRoles": [],
        "componentRecipes": [],
        "motionTokens": [],
        "breakpoints": {},
        "assetReferences": [],
        "componentCatalogVersion": "arclayer-wireframe-v1",
        "extensions": {},
    }
    return DesignSystemManifestInputV1.model_validate(payload)
