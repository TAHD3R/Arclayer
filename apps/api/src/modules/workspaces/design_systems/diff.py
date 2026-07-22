from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import cast

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonValue
from src.modules.workspaces.design_systems.manifest import (
    DesignComponentRecipeV1,
    DesignMotionRoleV1,
    DesignSystemManifestV1,
    DesignThemeV1,
    DesignTypographyRoleV1,
)
from src.modules.workspaces.design_systems.schema import (
    DesignSystemManifestDiffEntryOut,
    DesignSystemManifestDiffKind,
    DesignSystemManifestDiffOut,
)

ManifestEntryKey = tuple[DesignSystemManifestDiffKind, str]
ManifestEntryMap = dict[ManifestEntryKey, JsonValue]
type KeyedManifestModel = DesignThemeV1 | DesignTypographyRoleV1 | DesignComponentRecipeV1 | DesignMotionRoleV1


def compare_design_system_manifests(
    before: DesignSystemManifestV1,
    after: DesignSystemManifestV1,
) -> DesignSystemManifestDiffOut:
    before_entries = _manifest_entries(before)
    after_entries = _manifest_entries(after)
    entries: list[DesignSystemManifestDiffEntryOut] = []
    for kind, path in sorted(before_entries.keys() | after_entries.keys()):
        before_present = (kind, path) in before_entries
        after_present = (kind, path) in after_entries
        before_value = before_entries.get((kind, path))
        after_value = after_entries.get((kind, path))
        if before_present and after_present and before_value == after_value:
            continue
        operation = "changed" if before_present and after_present else "removed" if before_present else "added"
        entries.append(
            DesignSystemManifestDiffEntryOut(
                kind=kind,
                operation=operation,
                path=path,
                before=before_value,
                after=after_value,
            )
        )
    return DesignSystemManifestDiffOut(
        has_changes=bool(entries),
        added_count=sum(entry.operation == "added" for entry in entries),
        changed_count=sum(entry.operation == "changed" for entry in entries),
        removed_count=sum(entry.operation == "removed" for entry in entries),
        entries=tuple(entries),
    )


def _manifest_entries(manifest: DesignSystemManifestV1) -> ManifestEntryMap:
    entries: ManifestEntryMap = {
        ("metadata", "name"): manifest.name,
        ("asset_reference", "assetReferences"): cast(
            JsonValue,
            list(manifest.asset_references),
        ),
        ("component_catalog", "componentCatalogVersion"): manifest.component_catalog_version,
    }
    _add_mapping(entries, "primitive_token", manifest.primitive_tokens)
    _add_mapping(entries, "semantic_token", manifest.semantic_tokens)
    _add_mapping(entries, "component_token", manifest.component_tokens)
    _add_mapping(entries, "breakpoint", manifest.breakpoints, prefix="breakpoints")
    _add_mapping(entries, "extension", manifest.extensions, prefix="extensions")
    _add_keyed_models(entries, "theme", "themes", manifest.themes)
    _add_keyed_models(entries, "typography_role", "typographyRoles", manifest.typography_roles)
    _add_keyed_models(entries, "component_recipe", "componentRecipes", manifest.component_recipes)
    _add_keyed_models(entries, "motion_role", "motionTokens", manifest.motion_tokens)
    return entries


def _add_mapping(
    entries: ManifestEntryMap,
    kind: DesignSystemManifestDiffKind,
    values: Mapping[str, BaseSchema | JsonValue],
    *,
    prefix: str | None = None,
) -> None:
    for key, value in values.items():
        path = f"{prefix}.{key}" if prefix else key
        serialized = value.model_dump(mode="json", by_alias=True) if isinstance(value, BaseSchema) else value
        entries[(kind, path)] = cast(JsonValue, serialized)


def _add_keyed_models(
    entries: ManifestEntryMap,
    kind: DesignSystemManifestDiffKind,
    prefix: str,
    values: Iterable[KeyedManifestModel],
) -> None:
    for value in values:
        entries[(kind, f"{prefix}.{value.key}")] = cast(
            JsonValue,
            value.model_dump(mode="json", by_alias=True),
        )
