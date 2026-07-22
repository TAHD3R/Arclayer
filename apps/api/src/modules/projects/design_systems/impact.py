from __future__ import annotations

import hashlib
from collections.abc import Mapping
from typing import Literal
from uuid import UUID

import orjson
from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1, WireframeSectionV1
from src.modules.projects.design_systems.schema import (
    DesignSystemImpactReasonCode,
    DesignSystemImpactSeverity,
    ProjectDesignSystemImpactAnalysisOut,
    ProjectDesignSystemImpactCoverageOut,
    ProjectDesignSystemImpactEntryOut,
    ProjectDesignSystemImpactSummaryOut,
)
from src.modules.workspaces.design_systems.diff import compare_design_system_manifests
from src.modules.workspaces.design_systems.manifest import (
    DesignComponentRecipeV1,
    DesignSystemManifestV1,
    DesignTokenDefinitionV1,
)
from src.modules.workspaces.design_systems.schema import DesignSystemManifestDiffEntryOut


class ProjectDesignSystemImpactRevision(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    site_revision_id: UUID
    revision_number: int = Field(ge=1)
    is_current: Literal[True] = True
    wireframes: tuple[WireframeDocumentV1, ...] = ()


def analyze_project_design_system_impact(
    *,
    before: DesignSystemManifestV1,
    after: DesignSystemManifestV1,
    from_version_id: UUID,
    to_version_id: UUID,
    assignment_version_id: UUID | None,
    referenced_site_revision_count: int,
    current_revisions: tuple[ProjectDesignSystemImpactRevision, ...],
) -> ProjectDesignSystemImpactAnalysisOut:
    diff = compare_design_system_manifests(before, after)
    token_diff_entries = tuple(entry for entry in diff.entries if entry.kind.endswith("_token"))
    recipe_diff_entries = {_recipe_key(entry.path): entry for entry in diff.entries if entry.kind == "component_recipe"}
    recipes = _recipes_by_key(before, after)
    token_paths_by_recipe = _token_diff_paths_by_recipe(
        before=before,
        after=after,
        token_diff_entries=token_diff_entries,
        recipes=recipes,
    )
    affected_recipe_keys = set(recipe_diff_entries) | set(token_paths_by_recipe)
    impacts = _wireframe_impacts(
        current_revisions=current_revisions,
        recipes=recipes,
        affected_recipe_keys=affected_recipe_keys,
        recipe_diff_entries=recipe_diff_entries,
        token_paths_by_recipe=token_paths_by_recipe,
    )
    mapped_paths = {path for impact in impacts for path in impact.diff_paths}
    affected_pages = {impact.page_item_id for impact in impacts}
    affected_sections = {(impact.page_item_id, impact.section_id) for impact in impacts}
    summary = ProjectDesignSystemImpactSummaryOut(
        has_impact=bool(impacts),
        assignment_uses_from_version=assignment_version_id == from_version_id,
        referenced_site_revision_count=referenced_site_revision_count,
        historical_site_revision_count=max(referenced_site_revision_count - len(current_revisions), 0),
        current_site_revision_count=len(current_revisions),
        affected_page_count=len(affected_pages),
        affected_section_count=len(affected_sections),
        blocker_count=sum(impact.severity == "blocker" for impact in impacts),
        warning_count=sum(impact.severity == "warning" for impact in impacts),
        mapped_diff_count=len(mapped_paths),
        unmapped_diff_count=sum(entry.path not in mapped_paths for entry in diff.entries),
    )
    coverage = ProjectDesignSystemImpactCoverageOut()
    impact_hash = _impact_hash(
        before=before,
        after=after,
        from_version_id=from_version_id,
        to_version_id=to_version_id,
        coverage=coverage,
        summary=summary,
        impacts=impacts,
    )
    return ProjectDesignSystemImpactAnalysisOut(
        impact_hash=impact_hash,
        diff=diff,
        coverage=coverage,
        summary=summary,
        impacts=impacts,
    )


def _recipes_by_key(
    before: DesignSystemManifestV1,
    after: DesignSystemManifestV1,
) -> dict[str, tuple[DesignComponentRecipeV1 | None, DesignComponentRecipeV1 | None]]:
    before_by_key = {recipe.key: recipe for recipe in before.component_recipes}
    after_by_key = {recipe.key: recipe for recipe in after.component_recipes}
    return {
        key: (before_by_key.get(key), after_by_key.get(key))
        for key in sorted(before_by_key.keys() | after_by_key.keys())
    }


def _token_diff_paths_by_recipe(
    *,
    before: DesignSystemManifestV1,
    after: DesignSystemManifestV1,
    token_diff_entries: tuple[DesignSystemManifestDiffEntryOut, ...],
    recipes: Mapping[str, tuple[DesignComponentRecipeV1 | None, DesignComponentRecipeV1 | None]],
) -> dict[str, tuple[str, ...]]:
    result: dict[str, set[str]] = {}
    for entry in token_diff_entries:
        affected_tokens = _reverse_token_closure((before, after), entry.path)
        for recipe_key, versions in recipes.items():
            if any(recipe is not None and _recipe_token_paths(recipe) & affected_tokens for recipe in versions):
                result.setdefault(recipe_key, set()).add(entry.path)
    return {key: tuple(sorted(paths)) for key, paths in sorted(result.items())}


def _reverse_token_closure(
    manifests: tuple[DesignSystemManifestV1, DesignSystemManifestV1],
    source_path: str,
) -> set[str]:
    aliases: dict[str, set[str]] = {}
    for manifest in manifests:
        for path, token in _tokens(manifest).items():
            for reference in (token.alias, token.replacement):
                if reference is not None:
                    aliases.setdefault(reference, set()).add(path)
    affected = {source_path}
    pending = [source_path]
    while pending:
        referenced_path = pending.pop()
        for dependent in sorted(aliases.get(referenced_path, ())):
            if dependent in affected:
                continue
            affected.add(dependent)
            pending.append(dependent)
    return affected


def _tokens(manifest: DesignSystemManifestV1) -> dict[str, DesignTokenDefinitionV1]:
    return {
        **manifest.primitive_tokens,
        **manifest.semantic_tokens,
        **manifest.component_tokens,
    }


def _recipe_token_paths(recipe: DesignComponentRecipeV1) -> set[str]:
    paths = {token_path for state in recipe.states for token_path in state.style_tokens.values()}
    paths.update(
        token_path
        for responsive in recipe.responsive_overrides
        for state in responsive.states
        for token_path in state.style_tokens.values()
    )
    return paths


def _wireframe_impacts(
    *,
    current_revisions: tuple[ProjectDesignSystemImpactRevision, ...],
    recipes: Mapping[str, tuple[DesignComponentRecipeV1 | None, DesignComponentRecipeV1 | None]],
    affected_recipe_keys: set[str],
    recipe_diff_entries: Mapping[str, DesignSystemManifestDiffEntryOut],
    token_paths_by_recipe: Mapping[str, tuple[str, ...]],
) -> tuple[ProjectDesignSystemImpactEntryOut, ...]:
    impacts: list[ProjectDesignSystemImpactEntryOut] = []
    for revision in sorted(current_revisions, key=lambda item: str(item.site_revision_id)):
        for wireframe in sorted(revision.wireframes, key=lambda item: str(item.page_item_id)):
            for section in sorted(wireframe.sections, key=lambda item: item.id):
                impacts.extend(
                    _section_impacts(
                        revision=revision,
                        wireframe=wireframe,
                        section=section,
                        recipes=recipes,
                        affected_recipe_keys=affected_recipe_keys,
                        recipe_diff_entries=recipe_diff_entries,
                        token_paths_by_recipe=token_paths_by_recipe,
                    )
                )
    return tuple(impacts)


def _section_impacts(
    *,
    revision: ProjectDesignSystemImpactRevision,
    wireframe: WireframeDocumentV1,
    section: WireframeSectionV1,
    recipes: Mapping[str, tuple[DesignComponentRecipeV1 | None, DesignComponentRecipeV1 | None]],
    affected_recipe_keys: set[str],
    recipe_diff_entries: Mapping[str, DesignSystemManifestDiffEntryOut],
    token_paths_by_recipe: Mapping[str, tuple[str, ...]],
) -> list[ProjectDesignSystemImpactEntryOut]:
    impacts: list[ProjectDesignSystemImpactEntryOut] = []
    for recipe_key in sorted(affected_recipe_keys):
        before_recipe, after_recipe = recipes[recipe_key]
        recipe = after_recipe or before_recipe
        if recipe is None or not _recipe_matches_section(recipe, section):
            continue
        recipe_diff = recipe_diff_entries.get(recipe_key)
        diff_paths = tuple(
            sorted({
                *token_paths_by_recipe.get(recipe_key, ()),
                *((recipe_diff.path,) if recipe_diff is not None else ()),
            })
        )
        severity, reason_code = _impact_reason(recipe_diff, token_paths_by_recipe.get(recipe_key, ()))
        impacts.append(
            ProjectDesignSystemImpactEntryOut(
                severity=severity,
                reason_code=reason_code,
                site_revision_id=revision.site_revision_id,
                revision_number=revision.revision_number,
                page_item_id=wireframe.page_item_id,
                section_id=section.id,
                component_key=section.component_key,
                variant_key=section.variant_key,
                recipe_key=recipe_key,
                diff_paths=diff_paths,
            )
        )
    return impacts


def _recipe_matches_section(recipe: DesignComponentRecipeV1, section: WireframeSectionV1) -> bool:
    return recipe.component_key == section.component_key and recipe.variant_key == section.variant_key


def _impact_reason(
    recipe_diff: DesignSystemManifestDiffEntryOut | None,
    token_diff_paths: tuple[str, ...],
) -> tuple[DesignSystemImpactSeverity, DesignSystemImpactReasonCode]:
    if recipe_diff is not None and recipe_diff.operation == "removed":
        return "blocker", "DESIGN_SYSTEM_COMPONENT_RECIPE_REMOVED"
    if recipe_diff is not None and recipe_diff.operation == "added":
        return "warning", "DESIGN_SYSTEM_COMPONENT_RECIPE_ADDED"
    if recipe_diff is not None:
        return "warning", "DESIGN_SYSTEM_COMPONENT_RECIPE_CHANGED"
    if token_diff_paths:
        return "warning", "DESIGN_SYSTEM_TOKEN_CHANGE_REACHES_COMPONENT_RECIPE"
    raise RuntimeError("affected recipe has no impact evidence")


def _recipe_key(path: str) -> str:
    return path.removeprefix("componentRecipes.")


def _impact_hash(
    *,
    before: DesignSystemManifestV1,
    after: DesignSystemManifestV1,
    from_version_id: UUID,
    to_version_id: UUID,
    coverage: ProjectDesignSystemImpactCoverageOut,
    summary: ProjectDesignSystemImpactSummaryOut,
    impacts: tuple[ProjectDesignSystemImpactEntryOut, ...],
) -> str:
    payload = {
        "fromVersionId": str(from_version_id),
        "fromChecksum": before.checksum,
        "toVersionId": str(to_version_id),
        "toChecksum": after.checksum,
        "coverage": coverage.model_dump(mode="json", by_alias=True),
        "summary": summary.model_dump(mode="json", by_alias=True),
        "impacts": [impact.model_dump(mode="json", by_alias=True) for impact in impacts],
    }
    encoded = orjson.dumps(payload, option=orjson.OPT_SORT_KEYS)
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"


__all__ = [
    "ProjectDesignSystemImpactRevision",
    "analyze_project_design_system_impact",
]
