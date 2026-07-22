from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from src.core.exceptions import Conflict
from src.models.builder._enums import BuilderProvenanceSource
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextV1
from src.modules.projects.builder.generation_context import (
    build_wireframe_generation_context,
    partition_generation_targets_by_planning,
)
from src.modules.projects.builder.generation_schema import BuilderGenerationTargetV1
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
from src.modules.sites.component_catalogs.official import get_official_component_catalog_registry


def _builder_context(*, with_plan: bool = True) -> tuple[AgentRunBuilderContextV1, UUID]:
    workspace_id, project_id, site_id, environment_id, revision_id, page_id = (uuid4() for _ in range(6))
    structure_id, content_version_id, design_system_id, design_system_version_id = (uuid4() for _ in range(4))
    page = BuilderPageNodeSnapshotV1(
        item_id=page_id,
        sort_order=0,
        purpose="Explain the product clearly" if with_plan else None,
        section_intents=(
            BuilderSectionIntentV1(
                id="intent.hero",
                label="Hero",
                goal="Establish the primary value proposition",
            ),
        )
        if with_plan
        else (),
    )
    structure = ContentStructureSnapshotV1(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        locales=("en-US",),
        pages=(page,),
    )
    structure_hash = canonical_hash(structure.model_dump(mode="json", by_alias=True))
    pin = BuilderPageVersionPinV1(
        item_id=page_id,
        content_version_id=content_version_id,
        version_number=7,
        presentation_set_hash=canonical_hash([]),
        component_binding_set_hash=canonical_hash([]),
    )
    manifest = SiteRevisionManifestV1(
        id=revision_id,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        revision_number=4,
        project_authoring_mode="builder_managed",
        content_structure_revision_id=structure_id,
        content_structure_hash=structure_hash,
        page_versions=(pin,),
        presentation_set_hash=canonical_hash([pin.presentation_set_hash]),
        design_system_id=design_system_id,
        design_system_version_id=design_system_version_id,
        design_system_manifest_checksum=canonical_hash({"tokens": {}}),
        provenance_source=BuilderProvenanceSource.HUMAN,
        actor_user_id=uuid4(),
        created_at=datetime(2026, 7, 22, tzinfo=UTC),
        manifest_hash=canonical_hash({"revision": 4}),
    )
    context = AgentRunBuilderContextV1(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        site_revision_id=revision_id,
        revision_number=4,
        manifest_hash=manifest.manifest_hash,
        status_etag=canonical_hash({"status": 4}),
        content_structure_revision_id=structure_id,
        content_structure_hash=structure_hash,
        manifest=manifest,
        content_structure=structure,
        context_hash=canonical_hash({"context": 4}),
    )
    return context, page_id


def test_wireframe_generation_context_uses_exact_page_plan_and_version_pin() -> None:
    builder_context, page_id = _builder_context()
    catalog = get_official_component_catalog_registry().resolve("arclayer-wireframe-v1")
    assert catalog is not None

    context = build_wireframe_generation_context(
        builder_context=builder_context,
        targets=(BuilderGenerationTargetV1(kind="page", item_id=page_id),),
        wireframes_by_item={page_id: None},
        component_catalog=catalog,
    )

    target = context.targets[0]
    assert target.kind == "page"
    assert target.item_id == page_id
    assert target.expected_draft_version == 7
    assert target.purpose == "Explain the product clearly"
    assert [intent.id for intent in target.section_intents] == ["intent.hero"]
    assert target.current_wireframe is None
    assert context.design_system_version_id == UUID(str(builder_context.manifest.design_system_version_id))
    assert context.component_catalog.catalog_version == "arclayer-wireframe-v1"


def test_wireframe_generation_context_requires_canonical_page_plan() -> None:
    builder_context, page_id = _builder_context(with_plan=False)
    catalog = get_official_component_catalog_registry().resolve("arclayer-wireframe-v1")
    assert catalog is not None

    with pytest.raises(Conflict) as exc_info:
        build_wireframe_generation_context(
            builder_context=builder_context,
            targets=(BuilderGenerationTargetV1(kind="page", item_id=page_id),),
            wireframes_by_item={page_id: None},
            component_catalog=catalog,
        )

    assert exc_info.value.error == "BUILDER_WIREFRAME_PLAN_REQUIRED"


def test_wireframe_generation_context_coordinates_ordered_page_and_global_section_targets() -> None:
    builder_context, page_id = _builder_context()
    global_section_id = uuid4()
    global_section = BuilderGlobalSectionNodeSnapshotV1(
        item_id=global_section_id,
        locale="en-US",
        slug="site-header",
        purpose="Provide consistent site navigation",
        section_intents=(
            BuilderSectionIntentV1(
                id="intent.navigation",
                label="Navigation",
                goal="Help visitors reach every primary destination",
            ),
        ),
    )
    global_pin = BuilderGlobalSectionVersionPinV1(
        item_id=global_section_id,
        content_version_id=uuid4(),
        version_number=3,
        presentation_set_hash=canonical_hash([]),
        component_binding_set_hash=canonical_hash([]),
    )
    builder_context = builder_context.model_copy(
        update={
            "content_structure": builder_context.content_structure.model_copy(
                update={"global_references": (global_section,)}
            ),
            "manifest": builder_context.manifest.model_copy(update={"global_section_versions": (global_pin,)}),
        }
    )
    catalog = get_official_component_catalog_registry().resolve("arclayer-wireframe-v1")
    assert catalog is not None

    context = build_wireframe_generation_context(
        builder_context=builder_context,
        targets=(
            BuilderGenerationTargetV1(kind="page", item_id=page_id),
            BuilderGenerationTargetV1(kind="global_section", item_id=global_section_id),
        ),
        wireframes_by_item={page_id: None, global_section_id: None},
        component_catalog=catalog,
    )

    assert [(target.kind, target.item_id) for target in context.targets] == [
        ("page", page_id),
        ("global_section", global_section_id),
    ]
    assert [target.expected_draft_version for target in context.targets] == [7, 3]
    assert [target.section_intents[0].id for target in context.targets] == [
        "intent.hero",
        "intent.navigation",
    ]
    assert context.global_section_graph.references == ()


def test_plan_first_partition_retains_original_order_and_exact_version_pins() -> None:
    builder_context, page_id = _builder_context(with_plan=False)
    global_section_id = uuid4()
    global_section = BuilderGlobalSectionNodeSnapshotV1(
        item_id=global_section_id,
        locale="en-US",
        slug="site-header",
        purpose="Provide consistent site navigation",
        section_intents=(
            BuilderSectionIntentV1(
                id="intent.navigation",
                label="Navigation",
                goal="Help visitors reach every primary destination",
            ),
        ),
    )
    global_pin = BuilderGlobalSectionVersionPinV1(
        item_id=global_section_id,
        content_version_id=uuid4(),
        version_number=3,
        presentation_set_hash=canonical_hash([]),
        component_binding_set_hash=canonical_hash([]),
    )
    builder_context = builder_context.model_copy(
        update={
            "content_structure": builder_context.content_structure.model_copy(
                update={"global_references": (global_section,)}
            ),
            "manifest": builder_context.manifest.model_copy(update={"global_section_versions": (global_pin,)}),
        }
    )
    requested = (
        BuilderGenerationTargetV1(kind="global_section", item_id=global_section_id),
        BuilderGenerationTargetV1(kind="page", item_id=page_id),
    )

    partition = partition_generation_targets_by_planning(
        builder_context=builder_context,
        targets=requested,
    )

    assert partition.planned == (requested[0],)
    assert partition.unplanned == (requested[1],)
    assert partition.expected_draft_versions == (
        (global_section_id, 3),
        (page_id, 7),
    )
