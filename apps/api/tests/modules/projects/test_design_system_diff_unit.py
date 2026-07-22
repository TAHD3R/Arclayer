from __future__ import annotations

from copy import deepcopy
from typing import Any

from src.modules.workspaces.design_systems.diff import compare_design_system_manifests
from src.modules.workspaces.design_systems.manifest import (
    DesignSystemManifestInputV1,
    build_design_system_manifest,
)


def _manifest_payload() -> dict[str, Any]:
    return {
        "manifestVersion": 1,
        "name": "Northstar v1",
        "primitiveTokens": {
            "primitive.color.action": {"type": "color", "value": "#155EEF"},
            "primitive.color.legacy": {"type": "color", "value": "#777777"},
        },
        "semanticTokens": {
            "semantic.color.action.primary": {
                "type": "color",
                "alias": "primitive.color.action",
            }
        },
        "componentTokens": {},
        "themes": [{"key": "light", "name": "Light", "mode": "light", "overrides": {}}],
        "typographyRoles": [],
        "componentRecipes": [],
        "motionTokens": [],
        "breakpoints": {"tablet": "48rem"},
        "assetReferences": [],
        "componentCatalogVersion": "arclayer-wireframe-v1",
        "extensions": {"arclayer:surface": "editorial"},
    }


def _manifest(payload: dict[str, Any]):
    return build_design_system_manifest(DesignSystemManifestInputV1.model_validate(payload))


def test_compare_design_system_manifests_returns_deterministic_semantic_entries() -> None:
    before_payload = _manifest_payload()
    after_payload = deepcopy(before_payload)
    after_payload["name"] = "Northstar v2"
    primitive_tokens = after_payload["primitiveTokens"]
    assert isinstance(primitive_tokens, dict)
    primitive_tokens["primitive.color.action"] = {"type": "color", "value": "#0B63E5"}
    primitive_tokens["primitive.color.focus"] = {"type": "color", "value": "#0B63E5"}
    primitive_tokens.pop("primitive.color.legacy")
    after_payload["themes"] = [
        {"key": "light", "name": "Daylight", "mode": "light", "overrides": {}},
        {"key": "dark", "name": "Dark", "mode": "dark", "overrides": {}},
    ]
    after_payload["breakpoints"] = {"tablet": "48rem", "desktop": "80rem"}

    result = compare_design_system_manifests(_manifest(before_payload), _manifest(after_payload))

    assert result.has_changes is True
    assert result.added_count == 3
    assert result.changed_count == 3
    assert result.removed_count == 1
    assert [(entry.kind, entry.operation, entry.path) for entry in result.entries] == [
        ("breakpoint", "added", "breakpoints.desktop"),
        ("metadata", "changed", "name"),
        ("primitive_token", "changed", "primitive.color.action"),
        ("primitive_token", "added", "primitive.color.focus"),
        ("primitive_token", "removed", "primitive.color.legacy"),
        ("theme", "added", "themes.dark"),
        ("theme", "changed", "themes.light"),
    ]
    assert result.entries[2].before == {
        "alias": None,
        "deprecated": False,
        "description": None,
        "replacement": None,
        "type": "color",
        "value": "#155EEF",
    }
    assert result.entries[2].after == {
        "alias": None,
        "deprecated": False,
        "description": None,
        "replacement": None,
        "type": "color",
        "value": "#0B63E5",
    }


def test_compare_design_system_manifests_reports_an_exact_no_change_result() -> None:
    manifest = _manifest(_manifest_payload())

    result = compare_design_system_manifests(manifest, manifest)

    assert result.has_changes is False
    assert result.added_count == 0
    assert result.changed_count == 0
    assert result.removed_count == 0
    assert result.entries == ()
