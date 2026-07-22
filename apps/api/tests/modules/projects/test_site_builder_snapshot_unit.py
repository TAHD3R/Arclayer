from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from src.common.types.json_types import JsonValue
from src.core.exceptions import Conflict
from src.models.builder._enums import BuilderProvenanceSource
from src.models.builder.site_revision import SiteRevisionManifestRecord
from src.models.content._enums import ContentPresentationKind, ContentVersionState
from src.models.content.component_binding import ComponentBindingRecord
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.hierarchy_node import HierarchyNodeRecord
from src.models.content.presentation_document import PresentationDocumentRecord
from src.models.content.route_binding import RouteBindingRecord
from src.models.projects._enums import ProjectAuthoringMode, ProjectAuthoringState
from src.modules.projects.builder.authority import require_builder_authority
from src.modules.projects.builder.manifest import (
    RootSiteRevisionManifestInput,
    build_root_site_revision_manifest,
    parse_site_revision_manifest,
)
from src.modules.projects.builder.schema import (
    BuilderGlobalSectionNodeSnapshotV1,
    BuilderGlobalSectionVersionPinV1,
    BuilderInitializationRequest,
    BuilderPageNodeSnapshotV1,
    BuilderPagePlanningV1,
    BuilderSectionIntentV1,
    ContentStructureSnapshotV1,
)
from src.modules.projects.builder.snapshot import (
    BuilderSnapshotError,
    aggregate_presentation_hash,
    build_global_section_version_pins,
    build_page_version_pins,
    build_structure_snapshot,
    canonical_hash,
    select_page_versions,
)


def _content_item(
    *,
    item_id: UUID,
    workspace_id: UUID,
    site_id: UUID,
    environment_id: UUID,
    draft_version: int = 1,
) -> ContentItemRecord:
    return cast(
        ContentItemRecord,
        SimpleNamespace(
            id=item_id,
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            slug=f"page-{item_id}",
            draft_version=draft_version,
            published_version=None,
        ),
    )


def _content_version(*, version_id: UUID, item_id: UUID, version: int = 1) -> ContentVersionRecord:
    return cast(
        ContentVersionRecord,
        SimpleNamespace(
            id=version_id,
            item_id=item_id,
            version=version,
            state=ContentVersionState.DRAFT,
        ),
    )


def test_structure_snapshot_is_stable_across_unsorted_inputs() -> None:
    workspace_id, project_id, site_id, environment_id = (uuid4() for _ in range(4))
    parent_id, child_id = uuid4(), uuid4()
    parent = _content_item(
        item_id=parent_id,
        workspace_id=workspace_id,
        site_id=site_id,
        environment_id=environment_id,
    )
    child = _content_item(
        item_id=child_id,
        workspace_id=workspace_id,
        site_id=site_id,
        environment_id=environment_id,
    )
    hierarchy = [
        cast(
            HierarchyNodeRecord,
            SimpleNamespace(
                id=uuid4(),
                workspace_id=workspace_id,
                site_id=site_id,
                item_id=child_id,
                parent_item_id=parent_id,
                sort_order=20,
            ),
        ),
        cast(
            HierarchyNodeRecord,
            SimpleNamespace(
                id=uuid4(),
                workspace_id=workspace_id,
                site_id=site_id,
                item_id=parent_id,
                parent_item_id=None,
                sort_order=10,
            ),
        ),
    ]
    routes = [
        cast(
            RouteBindingRecord,
            SimpleNamespace(
                id=uuid4(),
                workspace_id=workspace_id,
                site_id=site_id,
                item_id=child_id,
                environment_id=environment_id,
                locale="en-US",
                path="/about",
                route_contract={"kind": "page"},
                is_active=True,
            ),
        ),
        cast(
            RouteBindingRecord,
            SimpleNamespace(
                id=uuid4(),
                workspace_id=workspace_id,
                site_id=site_id,
                item_id=parent_id,
                environment_id=environment_id,
                locale="zh-CN",
                path="/",
                route_contract=None,
                is_active=True,
            ),
        ),
    ]

    first = build_structure_snapshot(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        default_locale="zh-CN",
        fallback_locale="en-US",
        routes=routes,
        hierarchy=hierarchy,
        items=[child, parent],
    )
    second = build_structure_snapshot(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        default_locale="zh-CN",
        fallback_locale="en-US",
        routes=list(reversed(routes)),
        hierarchy=list(reversed(hierarchy)),
        items=[parent, child],
    )

    assert first == second
    assert first.locales == ("en-US", "zh-CN")
    assert [page.item_id for page in first.pages] == [parent_id, child_id]
    assert first.pages[1].parent_item_id == parent_id
    assert canonical_hash(first.model_dump(mode="json", by_alias=True)) == canonical_hash(
        second.model_dump(mode="json", by_alias=True)
    )


def test_structure_snapshot_preserves_planning_and_applies_explicit_overrides() -> None:
    workspace_id, project_id, site_id, environment_id, page_id = (uuid4() for _ in range(5))
    item = _content_item(
        item_id=page_id,
        workspace_id=workspace_id,
        site_id=site_id,
        environment_id=environment_id,
    )
    base = ContentStructureSnapshotV1(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        locales=("en-US",),
        pages=(
            BuilderPageNodeSnapshotV1(
                item_id=page_id,
                sort_order=0,
                purpose="Explain the old story",
                section_intents=(BuilderSectionIntentV1(id="intent.hero", label="Hero", goal="Explain the old value"),),
            ),
        ),
    )
    override = BuilderPagePlanningV1(
        purpose="Explain the new story",
        section_intents=(BuilderSectionIntentV1(id="intent.proof", label="Proof", goal="Establish credibility"),),
    )

    preserved = build_structure_snapshot(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        default_locale="en-US",
        fallback_locale="en-US",
        routes=[],
        hierarchy=[],
        items=[item],
        base_structure=base,
    )
    replaced = build_structure_snapshot(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        default_locale="en-US",
        fallback_locale="en-US",
        routes=[],
        hierarchy=[],
        items=[item],
        base_structure=base,
        planning_overrides={page_id: override},
    )

    assert preserved.pages[0].purpose == "Explain the old story"
    assert preserved.pages[0].section_intents[0].id == "intent.hero"
    assert replaced.pages[0].purpose == "Explain the new story"
    assert replaced.pages[0].section_intents[0].id == "intent.proof"


def test_structure_snapshot_and_manifest_pin_exact_global_sections() -> None:
    workspace_id, project_id, site_id, environment_id, global_item_id = (uuid4() for _ in range(5))
    global_version_id = uuid4()
    global_item = cast(
        ContentItemRecord,
        SimpleNamespace(
            id=global_item_id,
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            slug="site-header",
            locale="en-US",
            draft_version=3,
            published_version=2,
        ),
    )
    global_version = _content_version(
        version_id=global_version_id,
        item_id=global_item_id,
        version=3,
    )

    structure = build_structure_snapshot(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        default_locale="en-US",
        fallback_locale="en-US",
        routes=[],
        hierarchy=[],
        items=[],
        global_items=[global_item],
        planning_overrides={
            global_item_id: BuilderPagePlanningV1(
                purpose="Provide shared site navigation",
                section_intents=(
                    BuilderSectionIntentV1(
                        id="intent.navigation",
                        label="Navigation",
                        goal="Help visitors reach primary destinations",
                    ),
                ),
            )
        },
    )
    pins = build_global_section_version_pins(
        selected_versions={global_item_id: global_version},
        presentations=[],
        bindings=[],
    )

    assert structure.global_references == (
        BuilderGlobalSectionNodeSnapshotV1(
            item_id=global_item_id,
            locale="en-US",
            slug="site-header",
            purpose="Provide shared site navigation",
            section_intents=(
                BuilderSectionIntentV1(
                    id="intent.navigation",
                    label="Navigation",
                    goal="Help visitors reach primary destinations",
                ),
            ),
        ),
    )
    assert pins == (
        BuilderGlobalSectionVersionPinV1(
            item_id=global_item_id,
            content_version_id=global_version_id,
            version_number=3,
            presentation_set_hash=canonical_hash([]),
            component_binding_set_hash=canonical_hash([]),
        ),
    )


def test_select_page_versions_requires_the_exact_selected_version() -> None:
    workspace_id, site_id, environment_id, item_id = (uuid4() for _ in range(4))
    item = _content_item(
        item_id=item_id,
        workspace_id=workspace_id,
        site_id=site_id,
        environment_id=environment_id,
        draft_version=2,
    )

    with pytest.raises(BuilderSnapshotError, match="BUILDER_CONTENT_VERSION_REQUIRED") as exc_info:
        select_page_versions(
            items=[item],
            versions=[_content_version(version_id=uuid4(), item_id=item_id, version=1)],
        )

    assert exc_info.value.code == "BUILDER_CONTENT_VERSION_REQUIRED"


def test_presentation_and_binding_hashes_are_stable_for_identical_inputs() -> None:
    item_id, version_id = uuid4(), uuid4()
    version = _content_version(version_id=version_id, item_id=item_id)
    presentation = cast(
        PresentationDocumentRecord,
        SimpleNamespace(
            id=uuid4(),
            version_id=version_id,
            kind=ContentPresentationKind.VISUAL_BLUEPRINT,
            payload={"sections": [{"type": "hero"}]},
        ),
    )
    binding = cast(
        ComponentBindingRecord,
        SimpleNamespace(
            id=uuid4(),
            version_id=version_id,
            component_key="hero",
            binding_key="headline",
            binding_payload={"path": "title"},
            sort_order=0,
        ),
    )

    first = build_page_version_pins(
        selected_versions={item_id: version},
        presentations=[presentation],
        bindings=[binding],
    )
    second = build_page_version_pins(
        selected_versions={item_id: version},
        presentations=[presentation],
        bindings=[binding],
    )

    assert first == second
    assert aggregate_presentation_hash(first) == aggregate_presentation_hash(second)


def test_manifest_hash_can_be_recomputed_without_self_reference() -> None:
    now = datetime(2026, 7, 20, tzinfo=UTC)
    workspace_id, project_id, site_id, environment_id = (uuid4() for _ in range(4))
    structure_id, design_system_id, design_system_version_id = (uuid4() for _ in range(3))
    checksum = canonical_hash({"tokens": {"color": "amber"}})
    payload = BuilderInitializationRequest(
        site_id=site_id,
        environment_id=environment_id,
        expected_authoring_revision=1,
        expected_design_system_assignment_revision=2,
        expected_design_system_version_id=design_system_version_id,
        expected_design_system_manifest_checksum=checksum,
        provenance_source=BuilderProvenanceSource.HUMAN,
    )
    manifest = build_root_site_revision_manifest(
        RootSiteRevisionManifestInput(
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=site_id,
            environment_id=environment_id,
            content_structure_revision_id=structure_id,
            content_structure_hash=canonical_hash({"pages": []}),
            page_versions=(),
            presentation_set_hash=canonical_hash([]),
            design_system_id=design_system_id,
            design_system_version_id=design_system_version_id,
            design_system_manifest_checksum=checksum,
            provenance_source=BuilderProvenanceSource(payload.provenance_source),
            actor_user_id=uuid4(),
            agent_run_id=payload.agent_run_id,
            correlation_id=None,
            created_at=now,
        )
    )
    hash_input = manifest.model_dump(mode="json", by_alias=True, exclude={"manifest_hash"})

    assert manifest.manifest_hash == canonical_hash(hash_input)


def test_direct_agent_manifest_preserves_exact_identity_without_historical_hash_drift() -> None:
    now = datetime(2026, 7, 22, tzinfo=UTC)
    agent_id, agent_version_id, agent_assignment_id = (uuid4() for _ in range(3))
    inputs = {
        "workspace_id": uuid4(),
        "project_id": uuid4(),
        "site_id": uuid4(),
        "environment_id": uuid4(),
        "content_structure_revision_id": uuid4(),
        "content_structure_hash": canonical_hash({"pages": []}),
        "page_versions": (),
        "presentation_set_hash": canonical_hash([]),
        "design_system_id": uuid4(),
        "design_system_version_id": uuid4(),
        "design_system_manifest_checksum": canonical_hash({"tokens": {}}),
        "correlation_id": None,
        "created_at": now,
    }
    historical = build_root_site_revision_manifest(
        RootSiteRevisionManifestInput.model_validate({
            **inputs,
            "provenance_source": BuilderProvenanceSource.HUMAN,
            "actor_user_id": uuid4(),
            "agent_run_id": None,
        })
    )
    historical_snapshot = historical.model_dump(mode="json", by_alias=True)

    assert "agentId" not in historical_snapshot
    assert "agentVersionId" not in historical_snapshot
    assert "agentAssignmentId" not in historical_snapshot
    restored = parse_site_revision_manifest(
        cast(
            SiteRevisionManifestRecord,
            SimpleNamespace(
                manifest_snapshot=historical_snapshot,
                manifest_hash=historical.manifest_hash,
            ),
        )
    )
    assert restored.manifest_hash == historical.manifest_hash

    direct = build_root_site_revision_manifest(
        RootSiteRevisionManifestInput.model_validate({
            **inputs,
            "provenance_source": BuilderProvenanceSource.AGENT,
            "actor_user_id": uuid4(),
            "agent_run_id": None,
            "agent_id": agent_id,
            "agent_version_id": agent_version_id,
            "agent_assignment_id": agent_assignment_id,
        })
    )
    direct_snapshot = direct.model_dump(mode="json", by_alias=True)

    assert UUID(str(direct.agent_id)) == agent_id
    assert UUID(str(direct.agent_version_id)) == agent_version_id
    assert UUID(str(direct.agent_assignment_id)) == agent_assignment_id
    assert direct_snapshot["agentId"]
    assert direct_snapshot["agentVersionId"]
    assert direct_snapshot["agentAssignmentId"]
    assert direct.manifest_hash == canonical_hash(
        direct.model_dump(mode="json", by_alias=True, exclude={"manifest_hash"})
    )


@pytest.mark.parametrize(
    ("provenance_source", "agent_run_id"),
    [
        (BuilderProvenanceSource.AGENT, None),
        (BuilderProvenanceSource.HUMAN, uuid4()),
        (BuilderProvenanceSource.IMPORT, uuid4()),
        (BuilderProvenanceSource.SYSTEM, uuid4()),
    ],
)
def test_initialization_request_rejects_mismatched_agent_provenance(
    provenance_source: BuilderProvenanceSource,
    agent_run_id: UUID | None,
) -> None:
    with pytest.raises(ValidationError):
        BuilderInitializationRequest(
            site_id=uuid4(),
            environment_id=uuid4(),
            expected_authoring_revision=1,
            expected_design_system_assignment_revision=1,
            expected_design_system_version_id=uuid4(),
            expected_design_system_manifest_checksum=canonical_hash({}),
            provenance_source=provenance_source,
            agent_run_id=agent_run_id,
        )


def test_canonical_hash_accepts_json_value_contract() -> None:
    value: JsonValue = {"b": [2, 1], "a": True}

    assert canonical_hash(value) == canonical_hash({"a": True, "b": [2, 1]})


@pytest.mark.parametrize(
    ("mode", "state", "expected_code"),
    [
        (None, ProjectAuthoringState.MIGRATION_REQUIRED, "PROJECT_AUTHORING_MODE_REQUIRED"),
        (ProjectAuthoringMode.SOURCE_MANAGED, ProjectAuthoringState.READY, "PROJECT_AUTHORING_MODE_MISMATCH"),
    ],
)
def test_builder_authority_rejects_unresolved_or_source_managed_projects(
    mode: ProjectAuthoringMode | None,
    state: ProjectAuthoringState,
    expected_code: str,
) -> None:
    project = SimpleNamespace(
        authoring_revision=1,
        authoring_mode=mode,
        authoring_state=state,
    )

    with pytest.raises(Conflict) as exc_info:
        require_builder_authority(project, expected_revision=1)

    assert getattr(exc_info.value, "error", None) == expected_code
