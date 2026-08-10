from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.entity_manager.manager import EntityAfterCommitHook
from src.core.exceptions import Conflict
from src.core.lifecycles.specs import LifecycleAction
from src.models.builder._enums import BuilderApprovalClass, BuilderProvenanceSource
from src.modules.projects.builder.change_set_schema import BuilderChangeSetPreviewRequest
from src.modules.projects.builder.schema import (
    BuilderGlobalSectionNodeSnapshotV1,
    BuilderGlobalSectionVersionPinV1,
    BuilderPageNodeSnapshotV1,
    BuilderPageVersionPinV1,
    BuilderSectionIntentV1,
    ContentStructureSnapshotV1,
    SiteRevisionManifestV1,
)
from src.modules.projects.builder.snapshot import canonical_hash
from src.modules.projects.builder.wireframe_change_set import analyze_wireframe_change_set
from src.modules.projects.builder.wireframe_change_set_apply import apply_wireframe_operations
from src.modules.projects.builder.wireframe_change_set_schema import (
    BuilderWireframeClearBindingOperationV1,
    BuilderWireframeClearGlobalReferenceOperationV1,
    BuilderWireframeClearResponsiveRuleOperationV1,
    BuilderWireframeInitializeOperationV1,
    BuilderWireframeSectionAddOperationV1,
    BuilderWireframeSectionConfigureOperationV1,
    BuilderWireframeSectionDuplicateOperationV1,
    BuilderWireframeSectionRemoveOperationV1,
    BuilderWireframeSectionReorderOperationV1,
    BuilderWireframeSetBindingOperationV1,
    BuilderWireframeSetComponentOperationV1,
    BuilderWireframeSetGlobalReferenceOperationV1,
    BuilderWireframeSetInteractionsOperationV1,
    BuilderWireframeSetLayoutOperationV1,
    BuilderWireframeSetResponsiveRuleOperationV1,
    BuilderWireframeSetVariantOperationV1,
)
from src.modules.projects.builder.wireframe_schema import (
    WireframeDocumentV1,
    WireframeFieldBindingV1,
    WireframeInteractionRuleV1,
    WireframeLayoutV1,
    WireframeLiteralBindingV1,
    WireframeResponsiveLayoutV1,
    WireframeResponsiveRuleV1,
    WireframeSectionV1,
)
from src.modules.projects.content.items.transaction_commands import ContentItemAfterCommitEffect
from src.modules.sites.component_catalogs.official import get_official_component_catalog_registry
from src.modules.sites.component_catalogs.schema import ComponentCatalogV1

CATALOG_VERSION = "arclayer-wireframe-v1"


def _catalog() -> ComponentCatalogV1:
    catalog = get_official_component_catalog_registry().resolve(CATALOG_VERSION)
    if catalog is None:
        raise AssertionError("Official component catalog fixture is unavailable")
    return catalog


def _state() -> tuple[ContentStructureSnapshotV1, SiteRevisionManifestV1, UUID, UUID]:
    workspace_id, project_id, site_id, environment_id, page_id = (uuid4() for _ in range(5))
    content_version_id, design_system_id, design_system_version_id = (uuid4() for _ in range(3))
    structure = ContentStructureSnapshotV1(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        locales=("zh-CN",),
        pages=(
            BuilderPageNodeSnapshotV1(
                item_id=page_id,
                sort_order=0,
                purpose="Explain why teams should use Arclayer",
                section_intents=tuple(
                    BuilderSectionIntentV1(
                        id=intent_id,
                        label=label,
                        goal=goal,
                    )
                    for intent_id, label, goal in (
                        ("hero-intent", "Hero", "Establish the primary value proposition"),
                        ("hero-copy-intent", "Hero proof", "Reinforce the value proposition"),
                        ("banner-intent", "Banner", "Prompt the next action"),
                        ("footer-intent", "Footer", "Provide final navigation and trust links"),
                    )
                ),
            ),
        ),
    )
    manifest = SiteRevisionManifestV1(
        id=uuid4(),
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        revision_number=1,
        project_authoring_mode="builder_managed",
        content_structure_revision_id=uuid4(),
        content_structure_hash=canonical_hash(structure.model_dump(mode="json", by_alias=True)),
        page_versions=(
            BuilderPageVersionPinV1(
                item_id=page_id,
                content_version_id=content_version_id,
                version_number=2,
                presentation_set_hash=canonical_hash([]),
                component_binding_set_hash=canonical_hash([]),
            ),
        ),
        presentation_set_hash=canonical_hash([]),
        design_system_id=design_system_id,
        design_system_version_id=design_system_version_id,
        design_system_manifest_checksum=canonical_hash({"tokens": {}}),
        provenance_source=BuilderProvenanceSource.HUMAN,
        actor_user_id=uuid4(),
        created_at=datetime(2026, 7, 21, tzinfo=UTC),
        manifest_hash=canonical_hash({"revision": 1}),
    )
    return structure, manifest, page_id, content_version_id


def _section(section_id: str, intent_id: str, component_key: str = "landing.hero") -> WireframeSectionV1:
    bindings = (
        (WireframeLiteralBindingV1(kind="literal", slot_key="brand", value="Arclayer"),)
        if component_key == "site.footer"
        else (
            WireframeFieldBindingV1(kind="field", slot_key="heading", field_key="title"),
            WireframeLiteralBindingV1(kind="literal", slot_key="media.primary", value="/hero.webp"),
        )
    )
    return WireframeSectionV1(
        id=section_id,
        intent_id=intent_id,
        component_key=component_key,
        variant_key="default",
        label=section_id.title(),
        bindings=bindings,
        responsive_rules=(WireframeResponsiveRuleV1(breakpoint="mobile", layout="stack", columns=1),),
    )


def _wireframe(page_id: UUID, design_system_version_id: UUID) -> WireframeDocumentV1:
    return WireframeDocumentV1(
        page_item_id=page_id,
        design_system_version_id=design_system_version_id,
        component_catalog_version=CATALOG_VERSION,
        sections=(
            _section("hero", "hero-intent"),
            _section("footer", "footer-intent", "site.footer"),
        ),
    )


def _with_global_sections(
    *,
    structure: ContentStructureSnapshotV1,
    manifest: SiteRevisionManifestV1,
    item_ids: tuple[UUID, ...],
) -> tuple[ContentStructureSnapshotV1, SiteRevisionManifestV1]:
    global_nodes = tuple(
        BuilderGlobalSectionNodeSnapshotV1(
            item_id=item_id,
            locale="zh-CN",
            slug=f"global-{index}",
            section_intents=(
                BuilderSectionIntentV1(
                    id="global-intent",
                    label="Global section",
                    goal="Provide reusable site structure",
                ),
            ),
        )
        for index, item_id in enumerate(item_ids)
    )
    global_pins = tuple(
        BuilderGlobalSectionVersionPinV1(
            item_id=item_id,
            content_version_id=uuid4(),
            version_number=1,
            presentation_set_hash=canonical_hash([]),
            component_binding_set_hash=canonical_hash([]),
        )
        for item_id in item_ids
    )
    return (
        structure.model_copy(update={"global_references": global_nodes}),
        manifest.model_copy(update={"global_section_versions": global_pins}),
    )


def _global_wireframe(
    *,
    item_id: UUID,
    design_system_version_id: UUID,
    reference_id: UUID | None = None,
) -> WireframeDocumentV1:
    section = _section("global", "global-intent")
    if reference_id is not None:
        section = section.model_copy(update={"global_reference_id": reference_id})
    return WireframeDocumentV1(
        page_item_id=item_id,
        design_system_version_id=design_system_version_id,
        component_catalog_version=CATALOG_VERSION,
        sections=(section,),
    )


def test_preview_request_rejects_mixed_sitemap_and_wireframe_families() -> None:
    _, manifest, page_id, _ = _state()

    with pytest.raises(ValidationError, match="cannot mix Sitemap, Wireframe, Design, and Design System"):
        BuilderChangeSetPreviewRequest.model_validate({
            "baseRevisionId": manifest.id,
            "baseEtag": manifest.manifest_hash,
            "operations": [
                {
                    "type": "page.reorder",
                    "operationId": "page-order",
                    "itemId": page_id,
                    "sortOrder": 1,
                },
                {
                    "type": "wireframe.initialize",
                    "operationId": "wireframe-init",
                    "itemId": page_id,
                    "expectedDraftVersion": 2,
                    "componentCatalogVersion": CATALOG_VERSION,
                },
            ],
        })


def test_initialize_returns_exact_server_wireframe_candidate() -> None:
    structure, manifest, page_id, content_version_id = _state()
    operation = BuilderWireframeInitializeOperationV1(
        type="wireframe.initialize",
        operation_id="initialize",
        item_id=page_id,
        expected_draft_version=2,
        component_catalog_version=f" {CATALOG_VERSION} ",
        sections=(_section("hero", "hero-intent"),),
    )

    analysis = analyze_wireframe_change_set(
        structure=structure,
        manifest=manifest,
        wireframes_by_item={page_id: None},
        component_catalog=_catalog(),
        operations=(operation,),
        provenance_source=BuilderProvenanceSource.HUMAN,
    )

    candidate = analysis.wireframe_candidates[0]
    assert candidate.item_id == page_id
    assert candidate.base_content_version_id == content_version_id
    assert candidate.base_version_number == 2
    assert candidate.wireframe.page_item_id == page_id
    assert candidate.wireframe.design_system_version_id == manifest.design_system_version_id
    assert candidate.wireframe.component_catalog_version == CATALOG_VERSION
    assert [section.id for section in candidate.wireframe.sections] == ["hero"]
    assert analysis.approval_class is BuilderApprovalClass.NONE


def test_set_global_reference_returns_exact_candidate_and_dependency_graph() -> None:
    structure, manifest, page_id, _ = _state()
    global_item_id, global_version_id = uuid4(), uuid4()
    structure = structure.model_copy(
        update={
            "global_references": (
                BuilderGlobalSectionNodeSnapshotV1(
                    item_id=global_item_id,
                    locale="zh-CN",
                    slug="site-header",
                ),
            )
        }
    )
    manifest = manifest.model_copy(
        update={
            "global_section_versions": (
                BuilderGlobalSectionVersionPinV1(
                    item_id=global_item_id,
                    content_version_id=global_version_id,
                    version_number=1,
                    presentation_set_hash=canonical_hash([]),
                    component_binding_set_hash=canonical_hash([]),
                ),
            )
        }
    )
    global_wireframe = WireframeDocumentV1(
        page_item_id=global_item_id,
        design_system_version_id=manifest.design_system_version_id,
        component_catalog_version=CATALOG_VERSION,
    )
    operation = BuilderWireframeSetGlobalReferenceOperationV1(
        type="wireframe.set_global_reference",
        operation_id="reference-site-header",
        item_id=page_id,
        expected_draft_version=2,
        section_id="hero",
        global_section_item_id=global_item_id,
    )

    analysis = analyze_wireframe_change_set(
        structure=structure,
        manifest=manifest,
        wireframes_by_item={
            page_id: _wireframe(page_id, UUID(str(manifest.design_system_version_id))),
            global_item_id: global_wireframe,
        },
        component_catalog=_catalog(),
        operations=(operation,),
        provenance_source=BuilderProvenanceSource.HUMAN,
    )

    candidate = analysis.wireframe_candidates[0]
    assert candidate.host_kind == "page"
    assert candidate.wireframe.sections[0].global_reference_id == global_item_id
    assert analysis.global_section_graph.references[0].host_item_id == page_id
    assert analysis.global_section_graph.references[0].target_item_id == global_item_id
    assert analysis.global_section_graph.unknown_references == ()
    assert not [issue for issue in analysis.issues if issue.severity == "blocker"]


def test_clear_global_reference_restores_local_authority_and_removes_graph_edge() -> None:
    structure, manifest, page_id, _ = _state()
    global_item_id = uuid4()
    structure, manifest = _with_global_sections(
        structure=structure,
        manifest=manifest,
        item_ids=(global_item_id,),
    )
    wireframe = _wireframe(page_id, UUID(str(manifest.design_system_version_id)))
    wireframe = wireframe.model_copy(
        update={
            "sections": (
                wireframe.sections[0].model_copy(update={"global_reference_id": global_item_id}),
                *wireframe.sections[1:],
            )
        }
    )
    operation = BuilderWireframeClearGlobalReferenceOperationV1(
        type="wireframe.clear_global_reference",
        operation_id="clear-site-header",
        item_id=page_id,
        expected_draft_version=2,
        section_id="hero",
    )

    analysis = analyze_wireframe_change_set(
        structure=structure,
        manifest=manifest,
        wireframes_by_item={
            page_id: wireframe,
            global_item_id: _global_wireframe(
                item_id=global_item_id,
                design_system_version_id=UUID(str(manifest.design_system_version_id)),
            ),
        },
        component_catalog=_catalog(),
        operations=(operation,),
        provenance_source=BuilderProvenanceSource.HUMAN,
    )

    candidate = analysis.wireframe_candidates[0]
    assert candidate.wireframe.sections[0].global_reference_id is None
    assert analysis.global_section_graph.references == ()
    assert not [issue for issue in analysis.issues if issue.severity == "blocker"]


def test_clear_global_reference_rejects_a_section_without_reference() -> None:
    structure, manifest, page_id, _ = _state()
    operation = BuilderWireframeClearGlobalReferenceOperationV1(
        type="wireframe.clear_global_reference",
        operation_id="clear-unset-reference",
        item_id=page_id,
        expected_draft_version=2,
        section_id="hero",
    )

    with pytest.raises(Conflict) as exc_info:
        analyze_wireframe_change_set(
            structure=structure,
            manifest=manifest,
            wireframes_by_item={page_id: _wireframe(page_id, UUID(str(manifest.design_system_version_id)))},
            component_catalog=_catalog(),
            operations=(operation,),
            provenance_source=BuilderProvenanceSource.HUMAN,
        )

    assert exc_info.value.error == "BUILDER_GLOBAL_SECTION_REFERENCE_NOT_SET"


def test_set_global_reference_preserves_unknown_candidate_as_explicit_blocker() -> None:
    structure, manifest, page_id, _ = _state()
    unknown_id = uuid4()
    operation = BuilderWireframeSetGlobalReferenceOperationV1(
        type="wireframe.set_global_reference",
        operation_id="reference-unknown",
        item_id=page_id,
        expected_draft_version=2,
        section_id="hero",
        global_section_item_id=unknown_id,
    )

    analysis = analyze_wireframe_change_set(
        structure=structure,
        manifest=manifest,
        wireframes_by_item={page_id: _wireframe(page_id, UUID(str(manifest.design_system_version_id)))},
        component_catalog=_catalog(),
        operations=(operation,),
        provenance_source=BuilderProvenanceSource.HUMAN,
    )

    assert analysis.wireframe_candidates[0].wireframe.sections[0].global_reference_id == unknown_id
    blockers = [issue for issue in analysis.issues if issue.severity == "blocker"]
    assert [issue.code for issue in blockers] == ["BUILDER_GLOBAL_SECTION_REFERENCE_UNKNOWN"]
    assert analysis.global_section_graph.unknown_references[0].target_item_id == unknown_id
    assert blockers[0].meta == analysis.global_section_graph.unknown_references[0].model_dump(
        mode="json", by_alias=True
    )


def test_set_global_reference_requires_exact_target_wireframe() -> None:
    structure, manifest, page_id, _ = _state()
    global_item_id = uuid4()
    structure, manifest = _with_global_sections(
        structure=structure,
        manifest=manifest,
        item_ids=(global_item_id,),
    )
    operation = BuilderWireframeSetGlobalReferenceOperationV1(
        type="wireframe.set_global_reference",
        operation_id="reference-missing-wireframe",
        item_id=page_id,
        expected_draft_version=2,
        section_id="hero",
        global_section_item_id=global_item_id,
    )

    analysis = analyze_wireframe_change_set(
        structure=structure,
        manifest=manifest,
        wireframes_by_item={
            page_id: _wireframe(page_id, UUID(str(manifest.design_system_version_id))),
            global_item_id: None,
        },
        component_catalog=_catalog(),
        operations=(operation,),
        provenance_source=BuilderProvenanceSource.HUMAN,
    )

    blockers = [issue for issue in analysis.issues if issue.severity == "blocker"]
    assert [issue.code for issue in blockers] == ["BUILDER_GLOBAL_SECTION_WIREFRAME_REQUIRED"]
    assert analysis.global_section_graph.missing_wireframe_references[0].target_item_id == global_item_id
    assert blockers[0].meta == analysis.global_section_graph.missing_wireframe_references[0].model_dump(
        mode="json", by_alias=True
    )


def test_global_section_host_reports_exact_self_cycle_path() -> None:
    structure, manifest, _, _ = _state()
    global_item_id = UUID("00000000-0000-4000-8000-000000000101")
    structure, manifest = _with_global_sections(
        structure=structure,
        manifest=manifest,
        item_ids=(global_item_id,),
    )
    operation = BuilderWireframeSetGlobalReferenceOperationV1(
        type="wireframe.set_global_reference",
        operation_id="self-reference",
        item_id=global_item_id,
        expected_draft_version=1,
        section_id="global",
        global_section_item_id=global_item_id,
    )

    analysis = analyze_wireframe_change_set(
        structure=structure,
        manifest=manifest,
        wireframes_by_item={
            global_item_id: _global_wireframe(
                item_id=global_item_id,
                design_system_version_id=UUID(str(manifest.design_system_version_id)),
            )
        },
        component_catalog=_catalog(),
        operations=(operation,),
        provenance_source=BuilderProvenanceSource.HUMAN,
    )

    assert analysis.wireframe_candidates[0].host_kind == "global_section"
    cycle = next(issue for issue in analysis.issues if issue.code == "BUILDER_GLOBAL_SECTION_REFERENCE_CYCLE")
    assert analysis.global_section_graph.cycles[0].item_path == (global_item_id, global_item_id)
    assert cycle.meta == analysis.global_section_graph.cycles[0].model_dump(mode="json", by_alias=True)


def test_global_section_host_reports_deterministic_multi_node_cycle_path() -> None:
    structure, manifest, page_id, _ = _state()
    first_id = UUID("00000000-0000-4000-8000-000000000201")
    second_id = UUID("00000000-0000-4000-8000-000000000202")
    structure, manifest = _with_global_sections(
        structure=structure,
        manifest=manifest,
        item_ids=(first_id, second_id),
    )
    operation = BuilderWireframeSetGlobalReferenceOperationV1(
        type="wireframe.set_global_reference",
        operation_id="close-cycle",
        item_id=second_id,
        expected_draft_version=1,
        section_id="global",
        global_section_item_id=first_id,
    )

    analysis = analyze_wireframe_change_set(
        structure=structure,
        manifest=manifest,
        wireframes_by_item={
            page_id: _wireframe(page_id, UUID(str(manifest.design_system_version_id))),
            first_id: _global_wireframe(
                item_id=first_id,
                design_system_version_id=UUID(str(manifest.design_system_version_id)),
                reference_id=second_id,
            ),
            second_id: _global_wireframe(
                item_id=second_id,
                design_system_version_id=UUID(str(manifest.design_system_version_id)),
            ),
        },
        component_catalog=_catalog(),
        operations=(operation,),
        provenance_source=BuilderProvenanceSource.HUMAN,
    )

    cycle = next(issue for issue in analysis.issues if issue.code == "BUILDER_GLOBAL_SECTION_REFERENCE_CYCLE")
    assert analysis.global_section_graph.cycles[0].item_path == (first_id, second_id, first_id)
    assert cycle.meta == analysis.global_section_graph.cycles[0].model_dump(mode="json", by_alias=True)


def test_unknown_wireframe_intent_is_a_traceability_blocker() -> None:
    structure, manifest, page_id, _ = _state()
    operation = BuilderWireframeInitializeOperationV1(
        type="wireframe.initialize",
        operation_id="initialize-unknown-intent",
        item_id=page_id,
        expected_draft_version=2,
        component_catalog_version=CATALOG_VERSION,
        sections=(_section("hero", "intent.unknown"),),
    )

    analysis = analyze_wireframe_change_set(
        structure=structure,
        manifest=manifest,
        wireframes_by_item={page_id: None},
        component_catalog=_catalog(),
        operations=(operation,),
        provenance_source=BuilderProvenanceSource.HUMAN,
    )

    blockers = [issue for issue in analysis.issues if issue.severity == "blocker"]
    assert [issue.code for issue in blockers] == ["BUILDER_WIREFRAME_INTENT_UNKNOWN"]
    assert blockers[0].meta == {
        "itemId": str(page_id),
        "intentId": "intent.unknown",
        "sectionIds": ["hero"],
    }


def test_unmapped_canonical_intent_is_an_explicit_incomplete_warning() -> None:
    structure, manifest, page_id, _ = _state()
    operation = BuilderWireframeInitializeOperationV1(
        type="wireframe.initialize",
        operation_id="initialize-partial",
        item_id=page_id,
        expected_draft_version=2,
        component_catalog_version=CATALOG_VERSION,
        sections=(_section("hero", "hero-intent"),),
    )

    analysis = analyze_wireframe_change_set(
        structure=structure,
        manifest=manifest,
        wireframes_by_item={page_id: None},
        component_catalog=_catalog(),
        operations=(operation,),
        provenance_source=BuilderProvenanceSource.HUMAN,
    )

    warnings = [issue for issue in analysis.issues if issue.code == "BUILDER_WIREFRAME_INTENT_UNMAPPED"]
    assert [issue.meta for issue in warnings] == [
        {
            "itemId": str(page_id),
            "intentId": "hero-copy-intent",
        },
        {
            "itemId": str(page_id),
            "intentId": "banner-intent",
        },
        {
            "itemId": str(page_id),
            "intentId": "footer-intent",
        },
    ]
    assert not [issue for issue in analysis.issues if issue.severity == "blocker"]


def test_typed_operations_compose_one_candidate_in_request_order() -> None:
    structure, manifest, page_id, _ = _state()
    wireframe = _wireframe(page_id, UUID(str(manifest.design_system_version_id)))
    operations = (
        BuilderWireframeSectionAddOperationV1(
            type="wireframe.section.add",
            operation_id="add-banner",
            item_id=page_id,
            expected_draft_version=2,
            section=_section("banner", "banner-intent"),
            index=2,
        ),
        BuilderWireframeSectionDuplicateOperationV1(
            type="wireframe.section.duplicate",
            operation_id="duplicate-hero",
            item_id=page_id,
            expected_draft_version=2,
            section_id="hero",
            new_section_id="hero-copy",
            new_intent_id="hero-copy-intent",
            index=1,
        ),
        BuilderWireframeSectionReorderOperationV1(
            type="wireframe.section.reorder",
            operation_id="reorder-copy",
            item_id=page_id,
            expected_draft_version=2,
            section_id="hero-copy",
            index=0,
        ),
        BuilderWireframeSetComponentOperationV1(
            type="wireframe.set_component",
            operation_id="component-copy",
            item_id=page_id,
            expected_draft_version=2,
            section_id="hero-copy",
            component_key="landing.feature-grid",
        ),
        BuilderWireframeSetVariantOperationV1(
            type="wireframe.set_variant",
            operation_id="variant-copy",
            item_id=page_id,
            expected_draft_version=2,
            section_id="hero-copy",
            variant_key="split",
        ),
        BuilderWireframeSetBindingOperationV1(
            type="wireframe.set_binding",
            operation_id="binding-copy",
            item_id=page_id,
            expected_draft_version=2,
            section_id="hero-copy",
            binding=WireframeLiteralBindingV1(kind="literal", slot_key="heading", value="Launch faster"),
        ),
        BuilderWireframeClearBindingOperationV1(
            type="wireframe.clear_binding",
            operation_id="clear-media-copy",
            item_id=page_id,
            expected_draft_version=2,
            section_id="hero-copy",
            slot_key="media.primary",
        ),
        BuilderWireframeSetResponsiveRuleOperationV1(
            type="wireframe.set_responsive_rule",
            operation_id="desktop-copy",
            item_id=page_id,
            expected_draft_version=2,
            section_id="hero-copy",
            rule=WireframeResponsiveRuleV1(breakpoint="desktop", layout="grid", columns=3),
        ),
        BuilderWireframeSetBindingOperationV1(
            type="wireframe.set_binding",
            operation_id="items-copy",
            item_id=page_id,
            expected_draft_version=2,
            section_id="hero-copy",
            binding=WireframeLiteralBindingV1(
                kind="literal",
                slot_key="items",
                value=[{"title": "Fast"}],
            ),
        ),
        BuilderWireframeClearResponsiveRuleOperationV1(
            type="wireframe.clear_responsive_rule",
            operation_id="clear-mobile-copy",
            item_id=page_id,
            expected_draft_version=2,
            section_id="hero-copy",
            breakpoint="mobile",
        ),
        BuilderWireframeSetInteractionsOperationV1(
            type="wireframe.set_interactions",
            operation_id="interactions-copy",
            item_id=page_id,
            expected_draft_version=2,
            section_id="hero-copy",
            rules=(WireframeInteractionRuleV1(event="click", action="navigate", target="/pricing"),),
        ),
    )

    analysis = analyze_wireframe_change_set(
        structure=structure,
        manifest=manifest,
        wireframes_by_item={page_id: wireframe},
        component_catalog=_catalog(),
        operations=operations,
        provenance_source=BuilderProvenanceSource.AGENT,
    )

    candidate = analysis.wireframe_candidates[0].wireframe
    assert [section.id for section in candidate.sections] == ["hero-copy", "hero", "footer", "banner"]
    copy = candidate.sections[0]
    assert copy.component_key == "landing.feature-grid"
    assert copy.variant_key == "split"
    assert [(binding.slot_key, binding.kind) for binding in copy.bindings] == [
        ("heading", "literal"),
        ("items", "literal"),
    ]
    assert [(rule.breakpoint, rule.layout, rule.columns) for rule in copy.responsive_rules] == [("desktop", "grid", 3)]
    assert copy.interaction_rules[0].target == "/pricing"
    assert len(analysis.wireframe_candidates) == 1
    assert analysis.approval_class is BuilderApprovalClass.REVIEW


def test_section_configuration_replaces_the_complete_component_contract_atomically() -> None:
    structure, manifest, page_id, _ = _state()
    wireframe = _wireframe(page_id, UUID(str(manifest.design_system_version_id)))
    operation = BuilderWireframeSectionConfigureOperationV1(
        type="wireframe.section.configure",
        operation_id="configure-feature-grid",
        item_id=page_id,
        expected_draft_version=2,
        section_id="hero",
        component_key="landing.feature-grid",
        variant_key="split",
        bindings=(
            WireframeFieldBindingV1(kind="field", slot_key="heading", field_key="featureHeading"),
            WireframeLiteralBindingV1(
                kind="literal",
                slot_key="items",
                value=[{"title": "Fast"}, {"title": "Reliable"}],
            ),
        ),
        responsive_rules=(
            WireframeResponsiveRuleV1(breakpoint="desktop", layout="grid", columns=3),
            WireframeResponsiveRuleV1(breakpoint="mobile", layout="stack", columns=1),
        ),
        interaction_rules=(WireframeInteractionRuleV1(event="click", action="navigate", target="/features"),),
    )

    analysis = analyze_wireframe_change_set(
        structure=structure,
        manifest=manifest,
        wireframes_by_item={page_id: wireframe},
        component_catalog=_catalog(),
        operations=(operation,),
        provenance_source=BuilderProvenanceSource.HUMAN,
    )

    candidate = analysis.wireframe_candidates[0].wireframe.sections[0]
    assert candidate.id == "hero"
    assert candidate.intent_id == "hero-intent"
    assert candidate.label == "Hero"
    assert candidate.component_key == "landing.feature-grid"
    assert candidate.variant_key == "split"
    assert [(binding.slot_key, binding.kind) for binding in candidate.bindings] == [
        ("heading", "field"),
        ("items", "literal"),
    ]
    assert [(rule.breakpoint, rule.layout, rule.columns) for rule in candidate.responsive_rules] == [
        ("desktop", "grid", 3),
        ("mobile", "stack", 1),
    ]
    assert [(rule.event, rule.action, rule.target) for rule in candidate.interaction_rules] == [
        ("click", "navigate", "/features")
    ]
    assert not [issue for issue in analysis.issues if issue.severity == "blocker"]


def test_set_layout_persists_semantic_grid_geometry_and_breakpoint_overrides() -> None:
    structure, manifest, page_id, _ = _state()
    wireframe = _wireframe(page_id, UUID(str(manifest.design_system_version_id)))
    operation = BuilderWireframeSetLayoutOperationV1(
        type="wireframe.set_layout",
        operation_id="layout-hero",
        item_id=page_id,
        expected_draft_version=2,
        section_id="hero",
        layout=WireframeLayoutV1(mode="grid", width="content", align="center", gap="lg", columns=3, span=8),
        responsive_layouts=(
            WireframeResponsiveLayoutV1(
                breakpoint="mobile",
                layout=WireframeLayoutV1(mode="stack", width="full", align="stretch", gap="sm", columns=1, span=12),
            ),
        ),
    )

    analysis = analyze_wireframe_change_set(
        structure=structure,
        manifest=manifest,
        wireframes_by_item={page_id: wireframe},
        component_catalog=_catalog(),
        operations=(operation,),
        provenance_source=BuilderProvenanceSource.HUMAN,
    )

    candidate = analysis.wireframe_candidates[0].wireframe.sections[0]
    assert candidate.layout == operation.layout
    assert candidate.responsive_layouts == operation.responsive_layouts
    assert not [issue for issue in analysis.issues if issue.severity == "blocker"]


def test_remove_requires_destructive_approval_and_stale_version_fails() -> None:
    structure, manifest, page_id, _ = _state()
    wireframe = _wireframe(page_id, UUID(str(manifest.design_system_version_id)))
    remove = BuilderWireframeSectionRemoveOperationV1(
        type="wireframe.section.remove",
        operation_id="remove-footer",
        item_id=page_id,
        expected_draft_version=2,
        section_id="footer",
    )
    analysis = analyze_wireframe_change_set(
        structure=structure,
        manifest=manifest,
        wireframes_by_item={page_id: wireframe},
        component_catalog=_catalog(),
        operations=(remove,),
        provenance_source=BuilderProvenanceSource.HUMAN,
    )
    assert analysis.approval_class is BuilderApprovalClass.DESTRUCTIVE
    assert analysis.issues[0].code == "BUILDER_WIREFRAME_SECTION_REMOVE_REQUIRES_APPROVAL"
    assert [section.id for section in analysis.wireframe_candidates[0].wireframe.sections] == ["hero"]

    with pytest.raises(Conflict) as stale:
        analyze_wireframe_change_set(
            structure=structure,
            manifest=manifest,
            wireframes_by_item={page_id: wireframe},
            component_catalog=_catalog(),
            operations=(remove.model_copy(update={"expected_draft_version": 3}),),
            provenance_source=BuilderProvenanceSource.HUMAN,
        )
    assert stale.value.error == "SITE_REVISION_STALE"


def test_missing_wireframe_and_invalid_section_are_explicit_conflicts() -> None:
    structure, manifest, page_id, _ = _state()
    operation = BuilderWireframeSetVariantOperationV1(
        type="wireframe.set_variant",
        operation_id="missing-wireframe",
        item_id=page_id,
        expected_draft_version=2,
        section_id="hero",
        variant_key="split",
    )
    with pytest.raises(Conflict) as missing_wireframe:
        analyze_wireframe_change_set(
            structure=structure,
            manifest=manifest,
            wireframes_by_item={page_id: None},
            component_catalog=_catalog(),
            operations=(operation,),
            provenance_source=BuilderProvenanceSource.HUMAN,
        )
    assert missing_wireframe.value.error == "BUILDER_WIREFRAME_REQUIRED"

    with pytest.raises(Conflict) as missing_section:
        analyze_wireframe_change_set(
            structure=structure,
            manifest=manifest,
            wireframes_by_item={page_id: _wireframe(page_id, UUID(str(manifest.design_system_version_id)))},
            component_catalog=_catalog(),
            operations=(operation.model_copy(update={"section_id": "unknown"}),),
            provenance_source=BuilderProvenanceSource.HUMAN,
        )
    assert missing_section.value.error == "BUILDER_WIREFRAME_SECTION_NOT_FOUND"


async def test_apply_groups_multiple_operations_into_one_content_version_write() -> None:
    structure, manifest, page_id, content_version_id = _state()
    wireframe = _wireframe(page_id, UUID(str(manifest.design_system_version_id)))
    effect = ContentItemAfterCommitEffect(
        lifecycle=EntityAfterCommitHook(
            action=LifecycleAction.AFTER_UPDATE,
            model_key="page",
            workspace_id=uuid4(),
            site_id=uuid4(),
            item_id=page_id,
            result=cast(Any, SimpleNamespace(id=uuid4())),
            actor_id=uuid4(),
            state={},
        ),
        event_name="content.item.updated",
        payload={},
        actor_user_id=uuid4(),
    )
    commands = SimpleNamespace(
        replace_wireframe=AsyncMock(
            return_value=SimpleNamespace(after_commit=effect),
        )
    )
    operations = (
        BuilderWireframeSetComponentOperationV1(
            type="wireframe.set_component",
            operation_id="component",
            item_id=page_id,
            expected_draft_version=2,
            section_id="hero",
            component_key="landing.feature-grid",
        ),
        BuilderWireframeSetVariantOperationV1(
            type="wireframe.set_variant",
            operation_id="variant",
            item_id=page_id,
            expected_draft_version=2,
            section_id="hero",
            variant_key="split",
        ),
        BuilderWireframeClearBindingOperationV1(
            type="wireframe.clear_binding",
            operation_id="clear-media",
            item_id=page_id,
            expected_draft_version=2,
            section_id="hero",
            slot_key="media.primary",
        ),
        BuilderWireframeSetBindingOperationV1(
            type="wireframe.set_binding",
            operation_id="items",
            item_id=page_id,
            expected_draft_version=2,
            section_id="hero",
            binding=WireframeLiteralBindingV1(kind="literal", slot_key="items", value=[{"title": "Fast"}]),
        ),
    )
    workspace_id, project_id, runtime_id, site_id, environment_id, actor_user_id = (uuid4() for _ in range(6))
    conn = cast(BaseDBAsyncClient, object())

    result = await apply_wireframe_operations(
        commands=cast(Any, commands),
        structure=structure,
        manifest=manifest,
        wireframes_by_item={page_id: wireframe},
        component_catalog=_catalog(),
        operations=operations,
        provenance_source=BuilderProvenanceSource.HUMAN,
        workspace_id=workspace_id,
        project_id=project_id,
        runtime_id=runtime_id,
        site_id=site_id,
        environment_id=environment_id,
        actor_user_id=actor_user_id,
        conn=conn,
    )

    commands.replace_wireframe.assert_awaited_once()
    call = commands.replace_wireframe.await_args.kwargs
    assert call["item_id"] == page_id
    assert call["expected_content_version_id"] == content_version_id
    assert call["expected_draft_version"] == 2
    assert call["wireframe"].sections[0].component_key == "landing.feature-grid"
    assert call["wireframe"].sections[0].variant_key == "split"
    assert result.after_commit_effects == (effect,)


async def test_apply_rejects_an_incomplete_atomic_configuration_before_content_write() -> None:
    structure, manifest, page_id, _ = _state()
    commands = SimpleNamespace(replace_wireframe=AsyncMock())
    operation = BuilderWireframeSectionConfigureOperationV1(
        type="wireframe.section.configure",
        operation_id="incomplete-feature-grid",
        item_id=page_id,
        expected_draft_version=2,
        section_id="hero",
        component_key="landing.feature-grid",
        variant_key="default",
        bindings=(WireframeFieldBindingV1(kind="field", slot_key="heading", field_key="featureHeading"),),
        responsive_rules=(WireframeResponsiveRuleV1(breakpoint="mobile", layout="stack", columns=1),),
        interaction_rules=(),
    )
    workspace_id, project_id, runtime_id, site_id, environment_id, actor_user_id = (uuid4() for _ in range(6))

    with pytest.raises(Conflict) as blocked:
        await apply_wireframe_operations(
            commands=cast(Any, commands),
            structure=structure,
            manifest=manifest,
            wireframes_by_item={page_id: _wireframe(page_id, UUID(str(manifest.design_system_version_id)))},
            component_catalog=_catalog(),
            operations=(operation,),
            provenance_source=BuilderProvenanceSource.HUMAN,
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
            site_id=site_id,
            environment_id=environment_id,
            actor_user_id=actor_user_id,
            conn=cast(BaseDBAsyncClient, object()),
        )

    assert blocked.value.error == "BUILDER_CHANGE_SET_BLOCKED"
    commands.replace_wireframe.assert_not_awaited()


async def test_apply_rejects_unknown_global_reference_before_content_write() -> None:
    structure, manifest, page_id, _ = _state()
    commands = SimpleNamespace(replace_wireframe=AsyncMock())
    operation = BuilderWireframeSetGlobalReferenceOperationV1(
        type="wireframe.set_global_reference",
        operation_id="reference-unknown",
        item_id=page_id,
        expected_draft_version=2,
        section_id="hero",
        global_section_item_id=uuid4(),
    )
    workspace_id, project_id, runtime_id, site_id, environment_id, actor_user_id = (uuid4() for _ in range(6))

    with pytest.raises(Conflict) as blocked:
        await apply_wireframe_operations(
            commands=cast(Any, commands),
            structure=structure,
            manifest=manifest,
            wireframes_by_item={page_id: _wireframe(page_id, UUID(str(manifest.design_system_version_id)))},
            component_catalog=_catalog(),
            operations=(operation,),
            provenance_source=BuilderProvenanceSource.HUMAN,
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
            site_id=site_id,
            environment_id=environment_id,
            actor_user_id=actor_user_id,
            conn=cast(BaseDBAsyncClient, object()),
        )

    assert blocked.value.error == "BUILDER_CHANGE_SET_BLOCKED"
    commands.replace_wireframe.assert_not_awaited()
