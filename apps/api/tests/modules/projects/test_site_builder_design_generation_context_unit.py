from __future__ import annotations

from uuid import UUID

import pytest

from src.core.exceptions import Conflict
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextV1
from src.modules.projects.builder.generation_context import build_design_generation_context
from src.modules.projects.builder.generation_schema import BuilderGenerationTargetV1
from src.modules.projects.builder.snapshot import canonical_hash
from src.modules.projects.builder.visual_blueprint_schema import VisualBlueprintDocumentV1
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1, WireframeSectionV1
from src.modules.sites.component_catalogs.official import get_official_component_catalog_registry
from tests.modules.projects.test_site_builder_design_generation_provider_unit import _design_manifest
from tests.modules.projects.test_site_builder_wireframe_generation_context_unit import _builder_context

pytestmark = pytest.mark.unit


def test_design_generation_context_freezes_exact_revision_contract() -> None:
    builder_context, page_id = _builder_context()
    catalog = get_official_component_catalog_registry().resolve("arclayer-wireframe-v1")
    assert catalog is not None
    design_manifest = _design_manifest()
    wireframe = _wireframe(builder_context=builder_context, page_id=page_id)
    wireframe_checksum = canonical_hash(wireframe.model_dump(mode="json", by_alias=True))
    blueprint = VisualBlueprintDocumentV1(
        item_id=page_id,
        source_wireframe_checksum=wireframe_checksum,
        design_system_version_id=builder_context.manifest.design_system_version_id,
        design_system_manifest_checksum=design_manifest.checksum,
        component_catalog_version=catalog.catalog_version,
        component_catalog_checksum=catalog.checksum,
    )

    context = build_design_generation_context(
        builder_context=builder_context,
        targets=(BuilderGenerationTargetV1(kind="page", item_id=page_id),),
        wireframes_by_item={page_id: wireframe},
        blueprints_by_item={page_id: blueprint},
        design_system_manifest=design_manifest,
        component_catalog=catalog,
    )

    target = context.targets[0]
    assert target.kind == "page"
    assert target.item_id == page_id
    assert target.expected_draft_version == 7
    assert target.source_wireframe_checksum == wireframe_checksum
    assert target.wireframe == wireframe
    assert target.current_visual_blueprint == blueprint
    assert context.design_system_manifest == design_manifest
    assert context.component_catalog == catalog


def test_design_generation_context_requires_revision_pinned_wireframe() -> None:
    builder_context, page_id = _builder_context()
    catalog = get_official_component_catalog_registry().resolve("arclayer-wireframe-v1")
    assert catalog is not None

    with pytest.raises(Conflict) as exc_info:
        build_design_generation_context(
            builder_context=builder_context,
            targets=(BuilderGenerationTargetV1(kind="page", item_id=page_id),),
            wireframes_by_item={page_id: None},
            blueprints_by_item={page_id: None},
            design_system_manifest=_design_manifest(),
            component_catalog=catalog,
        )

    assert exc_info.value.error == "BUILDER_WIREFRAME_REQUIRED"


def test_design_generation_context_rejects_target_kind_mismatch() -> None:
    builder_context, page_id = _builder_context()
    catalog = get_official_component_catalog_registry().resolve("arclayer-wireframe-v1")
    assert catalog is not None
    wireframe = _wireframe(builder_context=builder_context, page_id=page_id)

    with pytest.raises(Conflict) as exc_info:
        build_design_generation_context(
            builder_context=builder_context,
            targets=(BuilderGenerationTargetV1(kind="global_section", item_id=page_id),),
            wireframes_by_item={page_id: wireframe},
            blueprints_by_item={page_id: None},
            design_system_manifest=_design_manifest(),
            component_catalog=catalog,
        )

    assert exc_info.value.error == "BUILDER_OPERATION_TARGET_NOT_FOUND"


def _wireframe(*, builder_context: AgentRunBuilderContextV1, page_id: UUID) -> WireframeDocumentV1:
    return WireframeDocumentV1(
        page_item_id=page_id,
        design_system_version_id=builder_context.manifest.design_system_version_id,
        component_catalog_version="arclayer-wireframe-v1",
        sections=(
            WireframeSectionV1(
                id="section.hero",
                intent_id="intent.hero",
                component_key="landing.hero",
                variant_key="default",
                label="Hero",
            ),
        ),
    )
