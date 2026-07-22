from __future__ import annotations

from uuid import UUID, uuid4

from src.common.utils.public_ids import encode_uuid
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1, WireframeSectionV1
from src.modules.projects.design_systems.impact import (
    ProjectDesignSystemImpactRevision,
    analyze_project_design_system_impact,
)
from src.modules.workspaces.design_systems.manifest import (
    DesignSystemManifestInputV1,
    DesignSystemManifestV1,
    build_design_system_manifest,
)


def _manifest(
    *,
    action_color: str,
    include_hero_recipe: bool = True,
    include_alternate_hero_recipe: bool = False,
) -> DesignSystemManifestV1:
    component_recipes = (
        [
            {
                "key": "landing.hero.default",
                "componentKey": "landing.hero",
                "variantKey": "default",
                "states": [
                    {
                        "stateKey": "default",
                        "styleTokens": {
                            "action.background": "semantic.color.action.primary",
                        },
                    }
                ],
            }
        ]
        if include_hero_recipe
        else []
    )
    if include_alternate_hero_recipe:
        component_recipes.append({
            "key": "landing.hero.alternate",
            "componentKey": "landing.hero",
            "variantKey": "default",
            "states": [
                {
                    "stateKey": "default",
                    "styleTokens": {
                        "action.background": "semantic.color.action.primary",
                    },
                }
            ],
        })
    return build_design_system_manifest(
        DesignSystemManifestInputV1.model_validate({
            "manifestVersion": 1,
            "name": "Impact fixture",
            "primitiveTokens": {
                "primitive.color.action": {"type": "color", "value": action_color},
            },
            "semanticTokens": {
                "semantic.color.action.primary": {
                    "type": "color",
                    "alias": "primitive.color.action",
                },
            },
            "componentTokens": {},
            "themes": [
                {
                    "key": "light",
                    "name": "Light",
                    "mode": "light",
                    "overrides": {},
                }
            ],
            "typographyRoles": [],
            "componentRecipes": component_recipes,
            "motionTokens": [],
            "breakpoints": {},
            "assetReferences": [],
            "componentCatalogVersion": "arclayer-wireframe-v1",
            "extensions": {},
        })
    )


def _revision(*, site_revision_id: UUID, page_item_id: UUID) -> ProjectDesignSystemImpactRevision:
    return ProjectDesignSystemImpactRevision(
        site_revision_id=site_revision_id,
        revision_number=4,
        is_current=True,
        wireframes=(
            WireframeDocumentV1(
                page_item_id=page_item_id,
                design_system_version_id=uuid4(),
                component_catalog_version="arclayer-wireframe-v1",
                sections=(
                    WireframeSectionV1(
                        id="hero",
                        intent_id="intent-hero",
                        component_key="landing.hero",
                        variant_key="default",
                        label="Hero",
                    ),
                ),
            ),
        ),
    )


def test_design_system_impact_traces_token_changes_to_current_wireframe_sections() -> None:
    from_version_id = uuid4()
    to_version_id = uuid4()
    site_revision_id = uuid4()
    page_item_id = uuid4()

    analysis = analyze_project_design_system_impact(
        before=_manifest(action_color="#335CFF"),
        after=_manifest(action_color="#2448CC"),
        from_version_id=from_version_id,
        to_version_id=to_version_id,
        assignment_version_id=from_version_id,
        referenced_site_revision_count=3,
        current_revisions=(_revision(site_revision_id=site_revision_id, page_item_id=page_item_id),),
    )

    assert analysis.impact_hash.startswith("sha256:")
    assert analysis.summary.has_impact is True
    assert analysis.summary.assignment_uses_from_version is True
    assert analysis.summary.referenced_site_revision_count == 3
    assert analysis.summary.historical_site_revision_count == 2
    assert analysis.summary.current_site_revision_count == 1
    assert analysis.summary.affected_page_count == 1
    assert analysis.summary.affected_section_count == 1
    assert analysis.summary.blocker_count == 0
    assert analysis.summary.warning_count == 1
    assert analysis.summary.mapped_diff_count == 1
    assert analysis.summary.unmapped_diff_count == 0
    assert analysis.coverage.assignment == "evaluated"
    assert analysis.coverage.site_revisions == "evaluated"
    assert analysis.coverage.wireframes == "evaluated"
    assert analysis.coverage.asset_authorization == "manifest_only"
    assert analysis.coverage.active_release == "not_evaluated"
    assert analysis.coverage.renderer == "not_evaluated"
    assert analysis.coverage.compiler_artifacts == "not_evaluated"
    assert [impact.model_dump(mode="json", by_alias=True) for impact in analysis.impacts] == [
        {
            "severity": "warning",
            "reasonCode": "DESIGN_SYSTEM_TOKEN_CHANGE_REACHES_COMPONENT_RECIPE",
            "siteRevisionId": encode_uuid(site_revision_id),
            "revisionNumber": 4,
            "pageItemId": encode_uuid(page_item_id),
            "sectionId": "hero",
            "componentKey": "landing.hero",
            "variantKey": "default",
            "recipeKey": "landing.hero.default",
            "diffPaths": ["primitive.color.action"],
        }
    ]

    replay = analyze_project_design_system_impact(
        before=_manifest(action_color="#335CFF"),
        after=_manifest(action_color="#2448CC"),
        from_version_id=from_version_id,
        to_version_id=to_version_id,
        assignment_version_id=from_version_id,
        referenced_site_revision_count=3,
        current_revisions=(_revision(site_revision_id=site_revision_id, page_item_id=page_item_id),),
    )
    assert replay == analysis


def test_design_system_impact_blocks_removed_recipes_used_by_current_wireframes() -> None:
    from_version_id = uuid4()
    site_revision_id = uuid4()
    page_item_id = uuid4()

    analysis = analyze_project_design_system_impact(
        before=_manifest(action_color="#335CFF"),
        after=_manifest(action_color="#335CFF", include_hero_recipe=False),
        from_version_id=from_version_id,
        to_version_id=uuid4(),
        assignment_version_id=None,
        referenced_site_revision_count=1,
        current_revisions=(_revision(site_revision_id=site_revision_id, page_item_id=page_item_id),),
    )

    assert analysis.summary.has_impact is True
    assert analysis.summary.assignment_uses_from_version is False
    assert analysis.summary.blocker_count == 1
    assert analysis.summary.warning_count == 0
    assert analysis.summary.mapped_diff_count == 1
    assert analysis.summary.unmapped_diff_count == 0
    assert len(analysis.impacts) == 1
    impact = analysis.impacts[0]
    assert impact.severity == "blocker"
    assert impact.reason_code == "DESIGN_SYSTEM_COMPONENT_RECIPE_REMOVED"
    assert impact.recipe_key == "landing.hero.default"
    assert impact.diff_paths == ("componentRecipes.landing.hero.default",)


def test_design_system_impact_counts_each_wireframe_section_once_across_matching_recipes() -> None:
    from_version_id = uuid4()
    site_revision_id = uuid4()
    page_item_id = uuid4()

    analysis = analyze_project_design_system_impact(
        before=_manifest(action_color="#335CFF", include_alternate_hero_recipe=True),
        after=_manifest(action_color="#2448CC", include_alternate_hero_recipe=True),
        from_version_id=from_version_id,
        to_version_id=uuid4(),
        assignment_version_id=from_version_id,
        referenced_site_revision_count=1,
        current_revisions=(_revision(site_revision_id=site_revision_id, page_item_id=page_item_id),),
    )

    assert len(analysis.impacts) == 2
    assert analysis.summary.warning_count == 2
    assert analysis.summary.affected_section_count == 1
