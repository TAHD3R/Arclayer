from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest

from src.core.exceptions import Conflict
from src.models.builder._enums import BuilderProvenanceSource, SiteRevisionLifecycleStatus
from src.models.content.content_version import ContentVersionRecord
from src.models.content.seo_profile import SEOProfileRecord
from src.modules.projects.builder.global_section_schema import (
    BuilderGlobalSectionCycleOut,
    BuilderGlobalSectionDependencyGraphOut,
    BuilderGlobalSectionReferenceOut,
)
from src.modules.projects.builder.manifest import RootSiteRevisionManifestInput, build_root_site_revision_manifest
from src.modules.projects.builder.render_document import build_page_render_document
from src.modules.projects.builder.render_document_design import BuilderRenderDesignPins
from src.modules.projects.builder.schema import (
    BuilderGlobalSectionVersionPinV1,
    BuilderPageVersionPinV1,
    BuilderRevisionGlobalSectionOut,
    BuilderRevisionOut,
    BuilderRevisionPageOut,
    BuilderRouteSnapshotV1,
    BuilderWireframeTraceabilityOut,
    ContentStructureRevisionOut,
    ContentStructureSnapshotV1,
    SiteRevisionStatusOut,
)
from src.modules.projects.builder.snapshot import canonical_hash
from src.modules.projects.builder.visual_blueprint_schema import VisualBlueprintDocumentV1
from src.modules.projects.builder.wireframe_schema import (
    WireframeDocumentV1,
    WireframeInteractionRuleV1,
    WireframeResponsiveRuleV1,
)
from src.modules.sites.component_catalogs.official import get_official_component_catalog_registry
from src.modules.sites.component_catalogs.schema import ComponentCatalogV1
from src.modules.workspaces.design_systems.manifest import (
    DesignSystemManifestInputV1,
    DesignSystemManifestV1,
    build_design_system_manifest,
)


@dataclass(frozen=True)
class RenderFixture:
    page_item_id: UUID
    global_item_id: UUID
    revision: BuilderRevisionOut
    versions: dict[UUID, ContentVersionRecord]
    design_manifest: DesignSystemManifestV1
    catalog: ComponentCatalogV1
    seo_profile: SEOProfileRecord


def _design_manifest() -> DesignSystemManifestV1:
    payload = DesignSystemManifestInputV1.model_validate({
        "manifestVersion": 1,
        "name": "Renderer contract",
        "primitiveTokens": {
            "primitive.color.canvas": {"type": "color", "value": "#FFFFFF"},
            "primitive.color.ink": {"type": "color", "value": "#111827"},
            "primitive.color.action": {"type": "color", "value": "#155EEF"},
            "primitive.font.family.body": {"type": "font-family", "value": ["Inter", "sans-serif"]},
            "primitive.font.weight.body": {"type": "font-weight", "value": 400},
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
            "semantic.color.surface.canvas": {"type": "color", "alias": "primitive.color.canvas"},
            "semantic.color.text.primary": {"type": "color", "alias": "primitive.color.ink"},
            "semantic.color.action.primary": {"type": "color", "alias": "primitive.color.action"},
        },
        "componentTokens": {},
        "themes": [{"key": "light", "name": "Light", "mode": "light", "overrides": {}}],
        "typographyRoles": [
            {
                "key": "body",
                "name": "Body",
                "fontFamilyToken": "primitive.font.family.body",
                "fontWeightToken": "primitive.font.weight.body",
                "fontSizeToken": "primitive.font.size.body",
                "lineHeightToken": "primitive.font.line-height.body",
            }
        ],
        "componentRecipes": [
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
                    {"stateKey": "hover", "styleTokens": {"action.background": "semantic.color.action.primary"}},
                    {"stateKey": "focus", "styleTokens": {"action.background": "semantic.color.action.primary"}},
                ],
            }
        ],
        "motionTokens": [
            {
                "key": "standard",
                "name": "Standard",
                "durationToken": "primitive.motion.duration.standard",
                "easingToken": "primitive.motion.easing.standard",
                "reducedMotionDurationToken": "primitive.motion.duration.reduced",
            }
        ],
        "breakpoints": {"tablet": "48rem", "desktop": "80rem"},
        "assetReferences": [],
        "componentCatalogVersion": "arclayer-wireframe-v1",
        "extensions": {},
    })
    return build_design_system_manifest(payload)


def _wireframe(*, page_item_id: UUID, design_version_id: UUID, global_item_id: UUID | None) -> WireframeDocumentV1:
    sections: list[dict[str, object]] = []
    if global_item_id is not None:
        sections.append({
            "id": "shared-header",
            "intentId": "intent.header",
            "componentKey": "site.header",
            "variantKey": "default",
            "label": "Shared header",
            "globalReferenceId": str(global_item_id),
        })
    sections.append({
        "id": "hero",
        "intentId": "intent.hero",
        "componentKey": "landing.hero",
        "variantKey": "default",
        "label": "Hero",
        "bindings": [
            {"kind": "field", "slotKey": "heading", "fieldKey": "heroHeading"},
            {"kind": "literal", "slotKey": "body", "value": "Build a durable site with AI."},
            {
                "kind": "literal",
                "slotKey": "action.primary",
                "value": {"label": "Get started", "action": "navigate", "target": "/contact"},
            },
        ],
        "responsiveRules": [{"breakpoint": "desktop", "layout": "grid", "columns": 2}],
        "interactionRules": [{"event": "click", "action": "navigate", "target": "/contact"}],
    })
    return WireframeDocumentV1.model_validate({
        "schemaVersion": 1,
        "pageItemId": str(page_item_id),
        "designSystemVersionId": str(design_version_id),
        "componentCatalogVersion": "arclayer-wireframe-v1",
        "sections": sections,
    })


def _render_fixture(*, include_global: bool = False) -> RenderFixture:
    now = datetime(2026, 7, 22, tzinfo=UTC)
    workspace_id, project_id, site_id, environment_id = (uuid4() for _ in range(4))
    structure_id, page_item_id, page_version_id = uuid4(), uuid4(), uuid4()
    global_item_id, global_version_id = uuid4(), uuid4()
    design_system_id, design_version_id = uuid4(), uuid4()
    design_manifest = _design_manifest()
    catalog = get_official_component_catalog_registry().resolve("arclayer-wireframe-v1")
    assert catalog is not None
    snapshot = ContentStructureSnapshotV1(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        locales=("en-US",),
        pages=(),
    )
    structure_hash = canonical_hash(snapshot.model_dump(mode="json", by_alias=True))
    empty_hash = canonical_hash([])
    page_pin = BuilderPageVersionPinV1(
        item_id=page_item_id,
        content_version_id=page_version_id,
        version_number=3,
        presentation_set_hash=empty_hash,
        component_binding_set_hash=empty_hash,
    )
    global_pin = BuilderGlobalSectionVersionPinV1(
        item_id=global_item_id,
        content_version_id=global_version_id,
        version_number=2,
        presentation_set_hash=empty_hash,
        component_binding_set_hash=empty_hash,
    )
    manifest = build_root_site_revision_manifest(
        RootSiteRevisionManifestInput(
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=site_id,
            environment_id=environment_id,
            content_structure_revision_id=structure_id,
            content_structure_hash=structure_hash,
            page_versions=(page_pin,),
            global_section_versions=(global_pin,) if include_global else (),
            presentation_set_hash=empty_hash,
            design_system_id=design_system_id,
            design_system_version_id=design_version_id,
            design_system_manifest_checksum=design_manifest.checksum,
            provenance_source=BuilderProvenanceSource.HUMAN,
            actor_user_id=uuid4(),
            agent_run_id=None,
            correlation_id="render-document-unit",
            created_at=now,
        )
    )
    page = BuilderRevisionPageOut(
        item_id=page_item_id,
        content_version_id=page_version_id,
        version_number=3,
        title="AI website builder",
        summary="Create and operate a complete site.",
        sort_order=0,
        routes=(BuilderRouteSnapshotV1(locale="en-US", path="/", is_active=True),),
        wireframe_traceability=BuilderWireframeTraceabilityOut(status="aligned"),
        wireframe=_wireframe(
            page_item_id=page_item_id,
            design_version_id=design_version_id,
            global_item_id=global_item_id if include_global else None,
        ),
    )
    globals_out: tuple[BuilderRevisionGlobalSectionOut, ...] = ()
    graph = BuilderGlobalSectionDependencyGraphOut()
    if include_global:
        global_wireframe = WireframeDocumentV1.model_validate({
            "schemaVersion": 1,
            "pageItemId": str(global_item_id),
            "designSystemVersionId": str(design_version_id),
            "componentCatalogVersion": "arclayer-wireframe-v1",
            "sections": [
                {
                    "id": "header",
                    "intentId": "intent.header",
                    "componentKey": "site.header",
                    "variantKey": "default",
                    "label": "Header",
                    "bindings": [
                        {"kind": "field", "slotKey": "brand", "fieldKey": "brandLogo"},
                        {"kind": "literal", "slotKey": "navigation.items", "value": ["Home", "About"]},
                    ],
                    "responsiveRules": [{"breakpoint": "desktop", "layout": "grid", "columns": 3}],
                }
            ],
        })
        globals_out = (
            BuilderRevisionGlobalSectionOut(
                item_id=global_item_id,
                content_version_id=global_version_id,
                version_number=2,
                title="Header",
                locale="en-US",
                slug="header",
                wireframe_traceability=BuilderWireframeTraceabilityOut(status="aligned"),
                wireframe=global_wireframe,
            ),
        )
        graph = BuilderGlobalSectionDependencyGraphOut(
            references=(
                BuilderGlobalSectionReferenceOut(
                    host_kind="page",
                    host_item_id=page_item_id,
                    host_section_id="shared-header",
                    target_item_id=global_item_id,
                ),
            )
        )
    revision = BuilderRevisionOut(
        site_revision=manifest,
        status=SiteRevisionStatusOut(
            site_revision_id=manifest.id,
            status=SiteRevisionLifecycleStatus.DRAFT,
            status_revision=1,
            readiness_findings=(),
            validator_version="builder-v1",
            etag=canonical_hash({"revisionId": str(manifest.id)}),
            calculated_at=now,
        ),
        content_structure_revision=ContentStructureRevisionOut(
            id=structure_id,
            revision_number=1,
            structure_hash=structure_hash,
            snapshot=snapshot,
            created_at=now,
        ),
        pages=(page,),
        global_sections=globals_out,
        global_section_graph=graph,
    )
    versions = {
        page_item_id: cast(
            ContentVersionRecord,
            SimpleNamespace(
                id=page_version_id,
                item_id=page_item_id,
                version=3,
                fields_snapshot={"heroHeading": "From idea to live site"},
            ),
        ),
    }
    if include_global:
        versions[global_item_id] = cast(
            ContentVersionRecord,
            SimpleNamespace(
                id=global_version_id,
                item_id=global_item_id,
                version=2,
                fields_snapshot={"brandLogo": {"src": "/brand.svg", "alt": "Arclayer"}},
            ),
        )
    seo_profile = cast(
        SEOProfileRecord,
        SimpleNamespace(
            version_id=page_version_id,
            meta_title="AI website builder | Arclayer",
            meta_description="Create a complete website with AI agents.",
            canonical_url="https://example.com/",
            robots_directive="index, follow",
        ),
    )
    return RenderFixture(page_item_id, global_item_id, revision, versions, design_manifest, catalog, seo_profile)


def _build(fixture: RenderFixture, *, theme: str | None = None):
    return build_page_render_document(
        revision=fixture.revision,
        page_item_id=fixture.page_item_id,
        locale="en-US",
        theme_key=theme,
        version_by_item=fixture.versions,
        seo_profile=fixture.seo_profile,
        design_manifest=fixture.design_manifest,
        catalog=fixture.catalog,
    )


def _invalid_code(exc: Conflict) -> str:
    assert exc.error == "BUILDER_RENDER_DOCUMENT_INVALID"
    assert isinstance(exc.details, list)
    code = cast(dict[str, object], exc.details[0])["code"]
    assert isinstance(code, str)
    return code


def test_render_document_resolves_pins_content_design_seo_and_stable_hash() -> None:
    fixture = _render_fixture()

    first = _build(fixture)
    second = _build(fixture)

    assert first.document_hash == second.document_hash
    assert first.pins.page_content_version_id == fixture.revision.pages[0].content_version_id
    assert first.theme.key == "light"
    assert next(slot for slot in first.sections[0].slots if slot.key == "heading").value == "From idea to live site"
    assert first.sections[0].component_recipe is not None
    assert first.seo.title == "AI website builder | Arclayer"
    assert {item.concern for item in first.evidence if item.status == "not_evaluated"} == {
        "assets_and_font_rights",
        "compiler",
        "smoke",
        "publication",
        "visual_blueprint",
    }


def test_render_document_applies_revision_pinned_visual_blueprint() -> None:
    fixture = _render_fixture()
    page = fixture.revision.pages[0]
    assert page.wireframe is not None
    blueprint = VisualBlueprintDocumentV1.model_validate({
        "schemaVersion": 1,
        "itemId": str(page.item_id),
        "sourceWireframeChecksum": canonical_hash(page.wireframe.model_dump(mode="json", by_alias=True)),
        "designSystemVersionId": str(fixture.revision.site_revision.design_system_version_id),
        "designSystemManifestChecksum": fixture.design_manifest.checksum,
        "componentCatalogVersion": fixture.catalog.catalog_version,
        "componentCatalogChecksum": fixture.catalog.checksum,
        "sections": [
            {
                "sectionId": "hero",
                "componentKey": "landing.hero",
                "variantKey": "default",
                "states": [
                    {
                        "stateKey": "default",
                        "styleTokens": {"surface.background": "semantic.color.action.primary"},
                    }
                ],
            }
        ],
    })
    fixture = replace(
        fixture,
        revision=fixture.revision.model_copy(
            update={"pages": (page.model_copy(update={"visual_blueprint": blueprint}),)}
        ),
    )

    document = _build(fixture)

    assert document.render_source == "visual_blueprint"
    assert document.pins.visual_blueprint_checksum == canonical_hash(blueprint.model_dump(mode="json", by_alias=True))
    assert document.sections[0].component_recipe is not None
    default = next(state for state in document.sections[0].component_recipe.states if state.state_key == "default")
    assert default.style_values["surface.background"] == "#155EEF"
    assert next(item for item in document.evidence if item.concern == "visual_blueprint").status == "passed"


def test_render_document_rejects_stale_visual_blueprint_without_wireframe_fallback() -> None:
    fixture = _render_fixture()
    page = fixture.revision.pages[0]
    blueprint = VisualBlueprintDocumentV1.model_validate({
        "schemaVersion": 1,
        "itemId": str(page.item_id),
        "sourceWireframeChecksum": f"sha256:{'0' * 64}",
        "designSystemVersionId": str(fixture.revision.site_revision.design_system_version_id),
        "designSystemManifestChecksum": fixture.design_manifest.checksum,
        "componentCatalogVersion": fixture.catalog.catalog_version,
        "componentCatalogChecksum": fixture.catalog.checksum,
        "sections": [],
    })
    fixture = replace(
        fixture,
        revision=fixture.revision.model_copy(
            update={"pages": (page.model_copy(update={"visual_blueprint": blueprint}),)}
        ),
    )

    with pytest.raises(Conflict) as exc_info:
        _build(fixture)

    assert _invalid_code(exc_info.value) == "BUILDER_VISUAL_BLUEPRINT_STALE"


def test_render_document_recursively_expands_global_sections_with_lineage() -> None:
    fixture = _render_fixture(include_global=True)

    result = _build(fixture)

    assert [section.component_key for section in result.sections] == ["site.header", "landing.hero"]
    header = result.sections[0]
    assert header.source_kind == "global_section"
    assert header.source_item_id == fixture.global_item_id
    assert header.reference_lineage[0].host_section_id == "shared-header"
    assert header.reference_lineage[0].target_item_id == fixture.global_item_id


def test_render_document_rejects_missing_field_and_value_shape() -> None:
    fixture = _render_fixture()
    missing = {
        **fixture.versions,
        fixture.page_item_id: cast(
            ContentVersionRecord,
            SimpleNamespace(
                id=fixture.revision.pages[0].content_version_id,
                item_id=fixture.page_item_id,
                version=3,
                fields_snapshot={},
            ),
        ),
    }

    with pytest.raises(Conflict) as missing_exc:
        build_page_render_document(
            revision=fixture.revision,
            page_item_id=fixture.page_item_id,
            locale="en-US",
            theme_key=None,
            version_by_item=missing,
            seo_profile=None,
            design_manifest=fixture.design_manifest,
            catalog=fixture.catalog,
        )
    assert _invalid_code(missing_exc.value) == "BUILDER_RENDER_FIELD_REQUIRED"

    malformed = {
        **fixture.versions,
        fixture.page_item_id: cast(
            ContentVersionRecord,
            SimpleNamespace(
                id=fixture.revision.pages[0].content_version_id,
                item_id=fixture.page_item_id,
                version=3,
                fields_snapshot={"heroHeading": ["not", "text"]},
            ),
        ),
    }
    with pytest.raises(Conflict) as malformed_exc:
        build_page_render_document(
            revision=fixture.revision,
            page_item_id=fixture.page_item_id,
            locale="en-US",
            theme_key=None,
            version_by_item=malformed,
            seo_profile=None,
            design_manifest=fixture.design_manifest,
            catalog=fixture.catalog,
        )
    assert _invalid_code(malformed_exc.value) == "BUILDER_RENDER_SLOT_VALUE_INVALID"


def test_render_document_rejects_unknown_locale_theme_and_tampered_design_checksum() -> None:
    fixture = _render_fixture()
    with pytest.raises(Conflict) as locale_exc:
        build_page_render_document(
            revision=fixture.revision,
            page_item_id=fixture.page_item_id,
            locale="zh-CN",
            theme_key=None,
            version_by_item=fixture.versions,
            seo_profile=None,
            design_manifest=fixture.design_manifest,
            catalog=fixture.catalog,
        )
    assert locale_exc.value.error == "BUILDER_RENDER_LOCALE_NOT_AVAILABLE"

    with pytest.raises(Conflict) as theme_exc:
        _build(fixture, theme="dark")
    assert theme_exc.value.error == "BUILDER_RENDER_THEME_NOT_FOUND"

    tampered = fixture.design_manifest.model_copy(update={"checksum": f"sha256:{'f' * 64}"})
    with pytest.raises(Conflict) as checksum_exc:
        build_page_render_document(
            revision=fixture.revision,
            page_item_id=fixture.page_item_id,
            locale="en-US",
            theme_key=None,
            version_by_item=fixture.versions,
            seo_profile=None,
            design_manifest=tampered,
            catalog=fixture.catalog,
        )
    assert _invalid_code(checksum_exc.value) == "BUILDER_RENDER_DESIGN_CONTRACT_INVALID"


def test_render_document_uses_an_explicit_candidate_design_pin_without_mutating_the_revision() -> None:
    fixture = _render_fixture()
    baseline = _build(fixture)
    candidate_payload = deepcopy(fixture.design_manifest.model_dump(mode="json", by_alias=True, exclude={"checksum"}))
    candidate_payload["name"] = "Candidate renderer contract"
    candidate_payload["primitiveTokens"]["primitive.color.action"]["value"] = "#B42318"
    candidate_manifest = build_design_system_manifest(DesignSystemManifestInputV1.model_validate(candidate_payload))
    candidate_pins = BuilderRenderDesignPins(
        design_system_id=uuid4(),
        design_system_version_id=uuid4(),
        design_system_manifest_checksum=candidate_manifest.checksum,
    )

    document = build_page_render_document(
        revision=fixture.revision,
        page_item_id=fixture.page_item_id,
        locale="en-US",
        theme_key=None,
        version_by_item=fixture.versions,
        seo_profile=fixture.seo_profile,
        design_manifest=candidate_manifest,
        catalog=fixture.catalog,
        design_pins=candidate_pins,
    )

    assert document.pins.site_revision_id == fixture.revision.site_revision.id
    assert document.pins.site_revision_hash == fixture.revision.site_revision.manifest_hash
    assert document.pins.page_content_version_id == fixture.revision.pages[0].content_version_id
    assert document.pins.design_system_id == candidate_pins.design_system_id
    assert document.pins.design_system_version_id == candidate_pins.design_system_version_id
    assert document.pins.design_system_manifest_checksum == candidate_manifest.checksum
    assert fixture.revision.site_revision.design_system_id != candidate_pins.design_system_id
    assert fixture.revision.site_revision.design_system_version_id != candidate_pins.design_system_version_id
    assert fixture.revision.site_revision.design_system_manifest_checksum != candidate_manifest.checksum
    assert document.document_hash != baseline.document_hash
    assert document.sections[0].component_recipe is not None
    default_recipe = next(
        state for state in document.sections[0].component_recipe.states if state.state_key == "default"
    )
    assert default_recipe.style_values["action.background"] == "#B42318"

    mismatched_pins = candidate_pins.model_copy(
        update={"design_system_manifest_checksum": fixture.design_manifest.checksum},
    )
    with pytest.raises(Conflict) as exc_info:
        build_page_render_document(
            revision=fixture.revision,
            page_item_id=fixture.page_item_id,
            locale="en-US",
            theme_key=None,
            version_by_item=fixture.versions,
            seo_profile=fixture.seo_profile,
            design_manifest=candidate_manifest,
            catalog=fixture.catalog,
            design_pins=mismatched_pins,
        )

    assert _invalid_code(exc_info.value) == "BUILDER_RENDER_DESIGN_CONTRACT_INVALID"


def test_render_document_hash_changes_with_pinned_content() -> None:
    fixture = _render_fixture()
    baseline = _build(fixture)
    changed_versions = {
        **fixture.versions,
        fixture.page_item_id: cast(
            ContentVersionRecord,
            SimpleNamespace(
                id=fixture.revision.pages[0].content_version_id,
                item_id=fixture.page_item_id,
                version=3,
                fields_snapshot={"heroHeading": "A changed heading"},
            ),
        ),
    }

    changed = build_page_render_document(
        revision=fixture.revision,
        page_item_id=fixture.page_item_id,
        locale="en-US",
        theme_key=None,
        version_by_item=changed_versions,
        seo_profile=fixture.seo_profile,
        design_manifest=fixture.design_manifest,
        catalog=fixture.catalog,
    )

    assert changed.document_hash != baseline.document_hash


@pytest.mark.parametrize(
    ("section_update", "expected_code"),
    [
        ({"component_key": "landing.unknown"}, "BUILDER_COMPONENT_NOT_REGISTERED"),
        ({"variant_key": "unknown"}, "BUILDER_COMPONENT_VARIANT_NOT_REGISTERED"),
        (
            {"responsive_rules": (WireframeResponsiveRuleV1(breakpoint="desktop", layout="split", columns=2),)},
            "BUILDER_COMPONENT_RESPONSIVE_RULE_UNSUPPORTED",
        ),
        (
            {
                "interaction_rules": (
                    WireframeInteractionRuleV1(event="click", action="navigate", target="/contact"),
                    WireframeInteractionRuleV1(event="click", action="toggle", target="menu"),
                )
            },
            "BUILDER_COMPONENT_INTERACTION_UNSUPPORTED",
        ),
    ],
)
def test_render_document_rejects_unknown_or_incompatible_component_contracts(
    section_update: dict[str, object],
    expected_code: str,
) -> None:
    fixture = _render_fixture()
    page = fixture.revision.pages[0]
    assert page.wireframe is not None
    section = page.wireframe.sections[0].model_copy(update=section_update)
    wireframe = page.wireframe.model_copy(update={"sections": (section,)})
    revision = fixture.revision.model_copy(update={"pages": (page.model_copy(update={"wireframe": wireframe}),)})

    with pytest.raises(Conflict) as exc_info:
        build_page_render_document(
            revision=revision,
            page_item_id=fixture.page_item_id,
            locale="en-US",
            theme_key=None,
            version_by_item=fixture.versions,
            seo_profile=None,
            design_manifest=fixture.design_manifest,
            catalog=fixture.catalog,
        )

    assert _invalid_code(exc_info.value) == expected_code


@pytest.mark.parametrize(
    ("graph_update", "expected_code"),
    [
        ({"unknown_references": "references"}, "BUILDER_RENDER_GLOBAL_REFERENCE_UNKNOWN"),
        ({"missing_wireframe_references": "references"}, "BUILDER_RENDER_GLOBAL_WIREFRAME_REQUIRED"),
        ({"cycles": "cycle"}, "BUILDER_RENDER_GLOBAL_REFERENCE_CYCLE"),
    ],
)
def test_render_document_rejects_global_dependency_graph_blockers(
    graph_update: dict[str, str],
    expected_code: str,
) -> None:
    fixture = _render_fixture(include_global=True)
    graph = fixture.revision.global_section_graph
    if graph_update.get("cycles") == "cycle":
        update: dict[str, object] = {
            "cycles": (BuilderGlobalSectionCycleOut(item_path=(fixture.global_item_id, fixture.global_item_id)),),
        }
    else:
        field = next(iter(graph_update))
        update = {field: graph.references}
    revision = fixture.revision.model_copy(update={"global_section_graph": graph.model_copy(update=update)})

    with pytest.raises(Conflict) as exc_info:
        build_page_render_document(
            revision=revision,
            page_item_id=fixture.page_item_id,
            locale="en-US",
            theme_key=None,
            version_by_item=fixture.versions,
            seo_profile=None,
            design_manifest=fixture.design_manifest,
            catalog=fixture.catalog,
        )

    assert _invalid_code(exc_info.value) == expected_code


def test_render_document_rejects_missing_binding_and_tampered_catalog_checksum() -> None:
    fixture = _render_fixture()
    page = fixture.revision.pages[0]
    assert page.wireframe is not None
    payload = page.wireframe.model_dump(mode="json", by_alias=True)
    payload["sections"][0]["bindings"][0] = {
        "kind": "missing",
        "slotKey": "heading",
        "reason": "content",
    }
    page_with_missing = page.model_copy(update={"wireframe": WireframeDocumentV1.model_validate(payload)})
    missing_revision = fixture.revision.model_copy(update={"pages": (page_with_missing,)})

    with pytest.raises(Conflict) as binding_exc:
        build_page_render_document(
            revision=missing_revision,
            page_item_id=fixture.page_item_id,
            locale="en-US",
            theme_key=None,
            version_by_item=fixture.versions,
            seo_profile=None,
            design_manifest=fixture.design_manifest,
            catalog=fixture.catalog,
        )
    assert _invalid_code(binding_exc.value) == "BUILDER_COMPONENT_SLOT_REQUIRED"

    tampered_payload = deepcopy(fixture.catalog.model_dump(mode="json", by_alias=True))
    tampered_payload["checksum"] = f"sha256:{'f' * 64}"
    tampered_catalog = ComponentCatalogV1.model_validate(tampered_payload)
    with pytest.raises(Conflict) as catalog_exc:
        build_page_render_document(
            revision=fixture.revision,
            page_item_id=fixture.page_item_id,
            locale="en-US",
            theme_key=None,
            version_by_item=fixture.versions,
            seo_profile=None,
            design_manifest=fixture.design_manifest,
            catalog=tampered_catalog,
        )
    assert _invalid_code(catalog_exc.value) == "BUILDER_RENDER_DESIGN_CONTRACT_INVALID"
