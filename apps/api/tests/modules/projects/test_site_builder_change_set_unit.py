from __future__ import annotations

import base64
import hashlib
import hmac
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import orjson
import pytest
from pydantic import ValidationError

from src.common.utils.public_ids import encode_uuid
from src.config import Settings
from src.core.exceptions import Conflict
from src.models.builder._enums import BuilderApprovalClass, BuilderProvenanceSource
from src.modules.projects.builder.change_set_analysis import require_builder_change_set_not_blocked
from src.modules.projects.builder.change_set_preview import analyze_sitemap_change_set
from src.modules.projects.builder.change_set_schema import (
    BuilderChangeSetPreviewRequest,
    BuilderGlobalSectionCreateOperationV1,
    BuilderGlobalSectionDeleteOperationV1,
    BuilderGlobalSectionIntentReplaceOperationV1,
    BuilderPageDeleteOperationV1,
    BuilderPageIntentReplaceOperationV1,
    BuilderPageMoveOperationV1,
    BuilderPageRenameOperationV1,
    BuilderPageReorderOperationV1,
    BuilderRevisionRestoreOperationV1,
    BuilderRouteDisableOperationV1,
    BuilderRouteSetOperationV1,
)
from src.modules.projects.builder.change_set_token import (
    BuilderChangeSetPreviewTokenClaims,
    build_builder_change_set_preview_token,
    builder_change_set_preview_token_hash,
    verify_builder_change_set_preview_token,
)
from src.modules.projects.builder.restore_change_set import analyze_revision_restore_change_set
from src.modules.projects.builder.schema import (
    BuilderGlobalSectionNodeSnapshotV1,
    BuilderGlobalSectionVersionPinV1,
    BuilderPageNodeSnapshotV1,
    BuilderPageVersionPinV1,
    BuilderRouteSnapshotV1,
    BuilderSectionIntentV1,
    ContentStructureSnapshotV1,
    SiteRevisionManifestV1,
)
from src.modules.projects.builder.snapshot import canonical_hash
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1, WireframeSectionV1


def _builder_state() -> tuple[ContentStructureSnapshotV1, SiteRevisionManifestV1, UUID, UUID]:
    workspace_id, project_id, site_id, environment_id = (uuid4() for _ in range(4))
    root_id, child_id = uuid4(), uuid4()
    structure_id, design_system_id, design_system_version_id = (uuid4() for _ in range(3))
    structure = ContentStructureSnapshotV1(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        locales=("zh-CN",),
        pages=(
            BuilderPageNodeSnapshotV1(
                item_id=root_id,
                parent_item_id=None,
                sort_order=0,
                routes=(BuilderRouteSnapshotV1(locale="zh-CN", path="/", is_active=True),),
            ),
            BuilderPageNodeSnapshotV1(
                item_id=child_id,
                parent_item_id=root_id,
                sort_order=10,
                routes=(BuilderRouteSnapshotV1(locale="zh-CN", path="/about", is_active=True),),
            ),
        ),
    )
    structure_hash = canonical_hash(structure.model_dump(mode="json", by_alias=True))
    pin_hash = canonical_hash([])
    manifest = SiteRevisionManifestV1(
        id=uuid4(),
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        revision_number=1,
        project_authoring_mode="builder_managed",
        content_structure_revision_id=structure_id,
        content_structure_hash=structure_hash,
        page_versions=tuple(
            BuilderPageVersionPinV1(
                item_id=item_id,
                content_version_id=uuid4(),
                version_number=2,
                presentation_set_hash=pin_hash,
                component_binding_set_hash=pin_hash,
            )
            for item_id in (root_id, child_id)
        ),
        presentation_set_hash=pin_hash,
        design_system_id=design_system_id,
        design_system_version_id=design_system_version_id,
        design_system_manifest_checksum=canonical_hash({"tokens": {}}),
        provenance_source=BuilderProvenanceSource.HUMAN,
        actor_user_id=uuid4(),
        created_at=datetime(2026, 7, 20, tzinfo=UTC),
        manifest_hash=canonical_hash({"siteRevision": "root"}),
    )
    return structure, manifest, root_id, child_id


def _request_operation(**overrides) -> dict:
    return {
        "type": "page.reorder",
        "operationId": "op-1",
        "itemId": str(uuid4()),
        "sortOrder": 10,
        **overrides,
    }


def _restore_request(operation: dict | None = None) -> BuilderChangeSetPreviewRequest:
    return BuilderChangeSetPreviewRequest.model_validate({
        "baseRevisionId": uuid4(),
        "baseEtag": canonical_hash({}),
        "operations": (
            operation
            or {
                "type": "revision.restore",
                "operationId": "restore-1",
                "targetRevisionId": uuid4(),
            },
        ),
    })


def test_preview_request_accepts_restore_as_a_single_typed_operation() -> None:
    request = _restore_request()

    assert isinstance(request.operations[0], BuilderRevisionRestoreOperationV1)
    assert request.operations[0].target_revision_id is not None


def test_preview_request_rejects_restore_mixed_with_sitemap_operations() -> None:
    with pytest.raises(ValidationError):
        BuilderChangeSetPreviewRequest.model_validate({
            "baseRevisionId": uuid4(),
            "baseEtag": canonical_hash({}),
            "operations": (
                {
                    "type": "revision.restore",
                    "operationId": "restore-1",
                    "targetRevisionId": uuid4(),
                },
                _request_operation(operationId="reorder-1"),
            ),
        })


def test_restore_analyzer_accepts_compatible_human_target() -> None:
    structure, manifest, _, _ = _builder_state()
    operation = BuilderRevisionRestoreOperationV1(
        type="revision.restore",
        operation_id="restore-1",
        target_revision_id=manifest.id,
    )
    version_ids = {UUID(str(pin.content_version_id)) for pin in manifest.page_versions}

    analysis = analyze_revision_restore_change_set(
        current_manifest=manifest,
        current_structure=structure,
        target_manifest=manifest,
        target_structure=structure,
        operation=operation,
        live_item_ids={UUID(str(page.item_id)) for page in structure.pages},
        target_version_ids=version_ids,
        missing_model_definition_item_ids=set(),
        provenance_source=BuilderProvenanceSource.HUMAN,
    )

    assert analysis.issues == ()
    assert analysis.approval_class is BuilderApprovalClass.NONE
    assert analysis.required_permissions == (
        "project:content:site-builder:write",
        "project:content:items:write",
    )
    assert analysis.summary_params == {"targetRevision": "1"}


def test_restore_analyzer_exposes_all_unavailable_target_blockers() -> None:
    structure, manifest, _, _ = _builder_state()
    target_structure = structure.model_copy(update={"pages": (structure.pages[0],)})
    target_manifest = manifest.model_copy(
        update={
            "revision_number": 2,
            "page_versions": (
                manifest.page_versions[0].model_copy(update={"content_version_id": uuid4()}),
                manifest.page_versions[1],
            ),
            "design_system_version_id": uuid4(),
        }
    )
    operation = BuilderRevisionRestoreOperationV1(
        type="revision.restore",
        operation_id="restore-1",
        target_revision_id=target_manifest.id,
    )

    analysis = analyze_revision_restore_change_set(
        current_manifest=manifest,
        current_structure=structure,
        target_manifest=target_manifest,
        target_structure=target_structure,
        operation=operation,
        live_item_ids=set(),
        target_version_ids=set(),
        missing_model_definition_item_ids=set(),
        provenance_source=BuilderProvenanceSource.AGENT,
    )

    assert {issue.code for issue in analysis.issues} == {
        "BUILDER_RESTORE_TARGET_UNAVAILABLE",
        "BUILDER_RESTORE_DESIGN_SYSTEM_CHANGED",
        "BUILDER_RESTORE_VERSION_MISSING",
    }
    assert all(issue.operation_id == "restore-1" for issue in analysis.issues)
    assert analysis.approval_class is BuilderApprovalClass.REVIEW


def test_restore_analyzer_blocks_missing_content_model() -> None:
    structure, manifest, _, _ = _builder_state()
    operation = BuilderRevisionRestoreOperationV1(
        type="revision.restore",
        operation_id="restore-1",
        target_revision_id=manifest.id,
    )

    analysis = analyze_revision_restore_change_set(
        current_manifest=manifest,
        current_structure=structure,
        target_manifest=manifest,
        target_structure=structure,
        operation=operation,
        live_item_ids={UUID(str(page.item_id)) for page in structure.pages},
        target_version_ids={UUID(str(pin.content_version_id)) for pin in manifest.page_versions},
        missing_model_definition_item_ids={UUID(str(structure.pages[0].item_id))},
        provenance_source=BuilderProvenanceSource.HUMAN,
    )

    assert [issue.code for issue in analysis.issues] == ["BUILDER_RESTORE_MODEL_MISSING"]
    assert analysis.issues[0].meta == {"itemCount": 1}


@pytest.mark.parametrize(
    "operations",
    [
        (_request_operation(), _request_operation(sortOrder=20)),
        (
            {
                "type": "page.create",
                "operationId": "op-1",
                "clientPageId": "new-page",
                "modelKey": "page",
                "title": "Home",
                "slug": "home",
                "path": "/home",
            },
            {
                "type": "page.create",
                "operationId": "op-2",
                "clientPageId": "new-page",
                "modelKey": "page",
                "title": "About",
                "slug": "about",
                "path": "/about-us",
            },
        ),
    ],
)
def test_preview_request_rejects_duplicate_operation_or_client_page_ids(operations: tuple[dict, ...]) -> None:
    with pytest.raises(ValidationError):
        BuilderChangeSetPreviewRequest.model_validate({
            "baseRevisionId": uuid4(),
            "baseEtag": canonical_hash({}),
            "operations": operations,
        })


def test_preview_request_accepts_closed_global_section_lifecycle_operations() -> None:
    item_id = uuid4()
    request = BuilderChangeSetPreviewRequest.model_validate({
        "baseRevisionId": uuid4(),
        "baseEtag": canonical_hash({}),
        "operations": (
            {
                "type": "global_section.create",
                "operationId": "create-header",
                "clientGlobalSectionId": "site-header",
                "title": "Site header",
                "slug": "site-header",
                "locale": "en-US",
                "fieldsSnapshot": {"props_defaults": {}},
                "purpose": "Keep primary navigation consistent",
                "sectionIntents": (
                    {
                        "id": "intent.navigation",
                        "label": "Navigation",
                        "goal": "Expose primary destinations",
                    },
                ),
            },
            {
                "type": "global_section.delete",
                "operationId": "delete-footer",
                "itemId": item_id,
                "expectedDraftVersion": 3,
            },
        ),
    })

    assert isinstance(request.operations[0], BuilderGlobalSectionCreateOperationV1)
    assert isinstance(request.operations[1], BuilderGlobalSectionDeleteOperationV1)


@pytest.mark.parametrize(
    "operations",
    [
        (
            {
                "type": "global_section.create",
                "operationId": "create-header",
                "clientGlobalSectionId": "site-shell",
                "title": "Site header",
                "slug": "site-header",
            },
            {
                "type": "global_section.create",
                "operationId": "create-footer",
                "clientGlobalSectionId": "site-shell",
                "title": "Site footer",
                "slug": "site-footer",
            },
        ),
        (
            {
                "type": "global_section.create",
                "operationId": "create-header",
                "clientGlobalSectionId": "site-header",
                "title": "Site header",
                "slug": "site-header",
                "modelKey": "page",
            },
        ),
        (
            {
                "type": "global_section.create",
                "operationId": "create-header",
                "clientGlobalSectionId": "site-header",
                "title": "Site header",
                "slug": "site-header",
                "sectionIntents": ({"id": "intent.navigation", "label": "Navigation", "goal": "Expose destinations"},),
            },
        ),
    ],
)
def test_preview_request_rejects_ambiguous_global_section_creation(operations: tuple[dict, ...]) -> None:
    with pytest.raises(ValidationError):
        BuilderChangeSetPreviewRequest.model_validate({
            "baseRevisionId": uuid4(),
            "baseEtag": canonical_hash({}),
            "operations": operations,
        })


@pytest.mark.parametrize(
    ("provenance", "agent_run_id", "tool_name"),
    [
        (BuilderProvenanceSource.AGENT, None, "builder.sitemap.preview"),
        (BuilderProvenanceSource.AGENT, uuid4(), None),
        (BuilderProvenanceSource.HUMAN, uuid4(), "builder.sitemap.preview"),
    ],
)
def test_preview_request_requires_exact_agent_provenance_identity(
    provenance: BuilderProvenanceSource,
    agent_run_id: UUID | None,
    tool_name: str | None,
) -> None:
    with pytest.raises(ValidationError):
        BuilderChangeSetPreviewRequest.model_validate({
            "baseRevisionId": uuid4(),
            "baseEtag": canonical_hash({}),
            "operations": (_request_operation(),),
            "provenanceSource": provenance,
            "agentRunId": agent_run_id,
            "toolName": tool_name,
        })


def test_preview_request_accepts_direct_agent_provenance_without_a_hidden_run() -> None:
    request = BuilderChangeSetPreviewRequest.model_validate({
        "baseRevisionId": uuid4(),
        "baseEtag": canonical_hash({}),
        "operations": (_request_operation(),),
        "provenanceSource": "agent",
        "agentId": uuid4(),
        "toolName": "builder.wireframe.apply",
    })

    assert request.agent_run_id is None
    assert request.agent_id is not None


def test_move_and_reorder_produce_hierarchy_targets() -> None:
    structure, manifest, root_id, child_id = _builder_state()
    analysis = analyze_sitemap_change_set(
        structure=structure,
        manifest=manifest,
        operations=(
            BuilderPageMoveOperationV1(
                type="page.move",
                operation_id="move-child",
                item_id=child_id,
                parent_item_id=None,
                sort_order=20,
            ),
            BuilderPageReorderOperationV1(
                type="page.reorder",
                operation_id="reorder-root",
                item_id=root_id,
                sort_order=10,
            ),
        ),
        provenance_source=BuilderProvenanceSource.HUMAN,
    )

    hierarchy_targets = [target for target in analysis.affected_targets if target.kind == "hierarchy"]
    assert len(hierarchy_targets) == 2
    assert analysis.approval_class is BuilderApprovalClass.NONE


def test_move_rejects_hierarchy_cycle() -> None:
    structure, manifest, root_id, child_id = _builder_state()

    with pytest.raises(Conflict) as exc_info:
        analyze_sitemap_change_set(
            structure=structure,
            manifest=manifest,
            operations=(
                BuilderPageMoveOperationV1(
                    type="page.move",
                    operation_id="cycle",
                    item_id=root_id,
                    parent_item_id=child_id,
                ),
            ),
            provenance_source=BuilderProvenanceSource.HUMAN,
        )

    assert exc_info.value.error == "CONTENT_HIERARCHY_CYCLE"


def test_missing_target_and_stale_version_fail_explicitly() -> None:
    structure, manifest, _, child_id = _builder_state()
    with pytest.raises(Conflict) as missing:
        analyze_sitemap_change_set(
            structure=structure,
            manifest=manifest,
            operations=(
                BuilderPageReorderOperationV1(
                    type="page.reorder",
                    operation_id="missing",
                    item_id=uuid4(),
                    sort_order=0,
                ),
            ),
            provenance_source=BuilderProvenanceSource.HUMAN,
        )
    assert missing.value.error == "BUILDER_OPERATION_TARGET_NOT_FOUND"

    with pytest.raises(Conflict) as stale:
        analyze_sitemap_change_set(
            structure=structure,
            manifest=manifest,
            operations=(
                BuilderPageRenameOperationV1(
                    type="page.rename",
                    operation_id="stale",
                    item_id=child_id,
                    expected_draft_version=3,
                    title="About us",
                ),
            ),
            provenance_source=BuilderProvenanceSource.HUMAN,
        )
    assert stale.value.error == "SITE_REVISION_STALE"


def test_route_conflict_and_dynamic_source_contract_are_enforced() -> None:
    structure, manifest, _, child_id = _builder_state()
    with pytest.raises(Conflict) as conflict:
        analyze_sitemap_change_set(
            structure=structure,
            manifest=manifest,
            operations=(
                BuilderRouteSetOperationV1(
                    type="route.set",
                    operation_id="duplicate-route",
                    item_id=child_id,
                    path="/",
                ),
            ),
            provenance_source=BuilderProvenanceSource.HUMAN,
        )
    assert conflict.value.error == "CONTENT_ROUTE_CONFLICT"

    with pytest.raises(Conflict):
        analyze_sitemap_change_set(
            structure=structure,
            manifest=manifest,
            operations=(
                BuilderRouteSetOperationV1(
                    type="route.set",
                    operation_id="dynamic-without-source",
                    item_id=child_id,
                    path="/blog/:slug",
                    route_mode="dynamic",
                ),
            ),
            provenance_source=BuilderProvenanceSource.HUMAN,
        )


def test_delete_is_destructive_and_repeated_disable_is_visible() -> None:
    structure, manifest, root_id, child_id = _builder_state()
    delete = analyze_sitemap_change_set(
        structure=structure,
        manifest=manifest,
        operations=(
            BuilderPageDeleteOperationV1(
                type="page.delete",
                operation_id="delete-root",
                item_id=root_id,
                expected_draft_version=2,
            ),
        ),
        provenance_source=BuilderProvenanceSource.HUMAN,
    )
    assert delete.approval_class is BuilderApprovalClass.DESTRUCTIVE
    assert delete.issues[0].code == "BUILDER_PAGE_DELETE_REQUIRES_APPROVAL"
    assert delete.issues[0].meta == {"childCount": 1}

    disable = analyze_sitemap_change_set(
        structure=structure,
        manifest=manifest,
        operations=(
            BuilderRouteDisableOperationV1(
                type="route.disable",
                operation_id="disable-once",
                item_id=child_id,
            ),
            BuilderRouteDisableOperationV1(
                type="route.disable",
                operation_id="disable-twice",
                item_id=child_id,
            ),
        ),
        provenance_source=BuilderProvenanceSource.HUMAN,
    )
    assert [issue.code for issue in disable.issues] == ["BUILDER_ROUTE_ALREADY_DISABLED"]


def test_historical_structure_without_planning_round_trips_without_hash_drift() -> None:
    structure, _, _, _ = _builder_state()
    historical = structure.model_dump(mode="json", by_alias=True)

    restored = ContentStructureSnapshotV1.model_validate(historical)

    assert restored.model_dump(mode="json", by_alias=True) == historical
    assert canonical_hash(restored.model_dump(mode="json", by_alias=True)) == canonical_hash(historical)


def test_page_intent_replace_normalizes_typed_planning_without_content_permission() -> None:
    structure, manifest, root_id, _ = _builder_state()

    analysis = analyze_sitemap_change_set(
        structure=structure,
        manifest=manifest,
        operations=(
            BuilderPageIntentReplaceOperationV1(
                type="page.intent.replace",
                operation_id="plan-home",
                item_id=root_id,
                purpose="  Explain the product clearly  ",
                section_intents=(
                    BuilderSectionIntentV1(
                        id="intent.hero",
                        label="  Hero  ",
                        goal="  Establish the primary value proposition  ",
                        generation_guidance="  Prefer concise proof-led copy  ",
                    ),
                ),
            ),
        ),
        provenance_source=BuilderProvenanceSource.HUMAN,
    )

    operation = analysis.operations[0]
    assert isinstance(operation, BuilderPageIntentReplaceOperationV1)
    assert operation.purpose == "Explain the product clearly"
    assert operation.section_intents[0].label == "Hero"
    assert operation.section_intents[0].goal == "Establish the primary value proposition"
    assert operation.section_intents[0].generation_guidance == "Prefer concise proof-led copy"
    assert analysis.required_permissions == ("project:content:site-builder:write",)
    assert [target.kind for target in analysis.affected_targets] == ["planning"]
    assert analysis.approval_class is BuilderApprovalClass.NONE


def test_page_intent_replace_blocks_removing_an_in_use_wireframe_intent() -> None:
    structure, manifest, root_id, _ = _builder_state()
    planned = structure.model_copy(
        update={
            "pages": (
                structure.pages[0].model_copy(
                    update={
                        "purpose": "Explain the product",
                        "section_intents": (
                            BuilderSectionIntentV1(
                                id="intent.hero",
                                label="Hero",
                                goal="Establish the value proposition",
                            ),
                        ),
                    }
                ),
                structure.pages[1],
            )
        }
    )
    wireframe = WireframeDocumentV1(
        page_item_id=root_id,
        design_system_version_id=manifest.design_system_version_id,
        component_catalog_version="arclayer-wireframe-v1",
        sections=(
            WireframeSectionV1(
                id="hero",
                intent_id="intent.hero",
                component_key="landing.hero",
                variant_key="default",
                label="Hero",
            ),
        ),
    )

    analysis = analyze_sitemap_change_set(
        structure=planned,
        manifest=manifest,
        operations=(
            BuilderPageIntentReplaceOperationV1(
                type="page.intent.replace",
                operation_id="remove-hero-intent",
                item_id=root_id,
                purpose="Explain the product",
                section_intents=(),
            ),
        ),
        provenance_source=BuilderProvenanceSource.HUMAN,
        wireframes_by_item={root_id: wireframe},
    )

    assert analysis.approval_class is BuilderApprovalClass.DESTRUCTIVE
    assert analysis.issues[0].severity == "blocker"
    assert analysis.issues[0].code == "BUILDER_SECTION_INTENT_IN_USE"
    assert analysis.issues[0].meta == {
        "itemId": str(root_id),
        "intentId": "intent.hero",
        "sectionIds": ["hero"],
    }
    with pytest.raises(Conflict) as blocked:
        require_builder_change_set_not_blocked(analysis)
    assert blocked.value.error == "BUILDER_CHANGE_SET_BLOCKED"


def test_global_section_intent_replace_targets_only_typed_global_planning() -> None:
    structure, manifest, _, _ = _builder_state()
    global_id = uuid4()
    structure = structure.model_copy(
        update={
            "global_references": (
                BuilderGlobalSectionNodeSnapshotV1(
                    item_id=global_id,
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
                    item_id=global_id,
                    content_version_id=uuid4(),
                    version_number=1,
                    presentation_set_hash=canonical_hash([]),
                    component_binding_set_hash=canonical_hash([]),
                ),
            )
        }
    )

    analysis = analyze_sitemap_change_set(
        structure=structure,
        manifest=manifest,
        operations=(
            BuilderGlobalSectionIntentReplaceOperationV1(
                type="global_section.intent.replace",
                operation_id="plan-site-header",
                item_id=global_id,
                purpose="  Keep primary navigation consistent  ",
                section_intents=(
                    BuilderSectionIntentV1(
                        id="intent.navigation",
                        label="Navigation",
                        goal="Expose primary destinations",
                    ),
                ),
            ),
        ),
        provenance_source=BuilderProvenanceSource.HUMAN,
    )

    operation = analysis.operations[0]
    assert isinstance(operation, BuilderGlobalSectionIntentReplaceOperationV1)
    assert operation.purpose == "Keep primary navigation consistent"
    assert analysis.required_permissions == ("project:content:site-builder:write",)
    assert [target.kind for target in analysis.affected_targets] == ["global_section", "planning"]
    assert {target.target_id for target in analysis.affected_targets} == {global_id}


def test_page_and_global_planning_reject_the_other_target_kind() -> None:
    structure, manifest, page_id, _ = _builder_state()
    global_id = uuid4()
    structure = structure.model_copy(
        update={
            "global_references": (
                BuilderGlobalSectionNodeSnapshotV1(
                    item_id=global_id,
                    locale="zh-CN",
                    slug="site-header",
                ),
            )
        }
    )

    with pytest.raises(Conflict) as page_targeting_global:
        analyze_sitemap_change_set(
            structure=structure,
            manifest=manifest,
            operations=(
                BuilderPageIntentReplaceOperationV1(
                    type="page.intent.replace",
                    operation_id="page-targets-global",
                    item_id=global_id,
                    purpose="Invalid cross-kind planning",
                ),
            ),
            provenance_source=BuilderProvenanceSource.HUMAN,
        )
    assert page_targeting_global.value.error == "BUILDER_OPERATION_TARGET_NOT_FOUND"

    with pytest.raises(Conflict) as global_targeting_page:
        analyze_sitemap_change_set(
            structure=structure,
            manifest=manifest,
            operations=(
                BuilderGlobalSectionIntentReplaceOperationV1(
                    type="global_section.intent.replace",
                    operation_id="global-targets-page",
                    item_id=page_id,
                    purpose="Invalid cross-kind planning",
                ),
            ),
            provenance_source=BuilderProvenanceSource.HUMAN,
        )
    assert global_targeting_page.value.error == "BUILDER_OPERATION_TARGET_NOT_FOUND"


def test_global_section_intent_replace_blocks_removing_an_in_use_intent() -> None:
    structure, manifest, _, _ = _builder_state()
    global_id = uuid4()
    structure = structure.model_copy(
        update={
            "global_references": (
                BuilderGlobalSectionNodeSnapshotV1(
                    item_id=global_id,
                    locale="zh-CN",
                    slug="site-header",
                    purpose="Keep primary navigation consistent",
                    section_intents=(
                        BuilderSectionIntentV1(
                            id="intent.navigation",
                            label="Navigation",
                            goal="Expose primary destinations",
                        ),
                    ),
                ),
            )
        }
    )
    manifest = manifest.model_copy(
        update={
            "global_section_versions": (
                BuilderGlobalSectionVersionPinV1(
                    item_id=global_id,
                    content_version_id=uuid4(),
                    version_number=1,
                    presentation_set_hash=canonical_hash([]),
                    component_binding_set_hash=canonical_hash([]),
                ),
            )
        }
    )
    wireframe = WireframeDocumentV1(
        page_item_id=global_id,
        design_system_version_id=manifest.design_system_version_id,
        component_catalog_version="arclayer-wireframe-v1",
        sections=(
            WireframeSectionV1(
                id="navigation",
                intent_id="intent.navigation",
                component_key="site.navigation",
                variant_key="default",
                label="Navigation",
            ),
        ),
    )

    analysis = analyze_sitemap_change_set(
        structure=structure,
        manifest=manifest,
        operations=(
            BuilderGlobalSectionIntentReplaceOperationV1(
                type="global_section.intent.replace",
                operation_id="remove-navigation",
                item_id=global_id,
                purpose="Keep primary navigation consistent",
                section_intents=(),
            ),
        ),
        provenance_source=BuilderProvenanceSource.HUMAN,
        wireframes_by_item={global_id: wireframe},
    )

    assert analysis.approval_class is BuilderApprovalClass.DESTRUCTIVE
    assert [issue.code for issue in analysis.issues] == ["BUILDER_SECTION_INTENT_IN_USE"]
    assert analysis.issues[0].meta["sectionIds"] == ["navigation"]


def test_global_section_create_uses_fixed_model_and_request_local_targets() -> None:
    structure, manifest, _, _ = _builder_state()
    analysis = analyze_sitemap_change_set(
        structure=structure,
        manifest=manifest,
        operations=(
            BuilderGlobalSectionCreateOperationV1(
                type="global_section.create",
                operation_id="create-site-header",
                client_global_section_id="site-header",
                title="  Site header  ",
                slug="  site-header  ",
                locale="en-US",
                fields_snapshot={"props_defaults": {"compact": False}},
                purpose="  Keep primary navigation consistent  ",
                section_intents=(
                    BuilderSectionIntentV1(
                        id="intent.navigation",
                        label="Navigation",
                        goal="Expose primary destinations",
                    ),
                ),
            ),
        ),
        provenance_source=BuilderProvenanceSource.HUMAN,
    )

    operation = analysis.operations[0]
    assert isinstance(operation, BuilderGlobalSectionCreateOperationV1)
    assert operation.title == "Site header"
    assert operation.slug == "site-header"
    assert operation.purpose == "Keep primary navigation consistent"
    assert operation.fields_snapshot == {
        "props_defaults": {"compact": False},
        "section_key": "site-header",
        "title": "Site header",
    }
    assert analysis.required_permissions == (
        "project:content:items:write",
        "project:content:site-builder:write",
    )
    assert [(target.kind, target.client_target_id, target.target_key) for target in analysis.affected_targets] == [
        ("content_item", "site-header", None),
        ("content_model", None, "reusable-section"),
        ("global_section", "site-header", None),
        ("planning", "site-header", None),
    ]


def test_global_section_delete_requires_destructive_approval_and_exact_pin() -> None:
    structure, manifest, _, _ = _builder_state()
    global_id = uuid4()
    structure = structure.model_copy(
        update={
            "global_references": (
                BuilderGlobalSectionNodeSnapshotV1(
                    item_id=global_id,
                    locale="en-US",
                    slug="site-footer",
                ),
            )
        }
    )
    manifest = manifest.model_copy(
        update={
            "global_section_versions": (
                BuilderGlobalSectionVersionPinV1(
                    item_id=global_id,
                    content_version_id=uuid4(),
                    version_number=4,
                    presentation_set_hash=canonical_hash([]),
                    component_binding_set_hash=canonical_hash([]),
                ),
            )
        }
    )

    analysis = analyze_sitemap_change_set(
        structure=structure,
        manifest=manifest,
        operations=(
            BuilderGlobalSectionDeleteOperationV1(
                type="global_section.delete",
                operation_id="delete-site-footer",
                item_id=global_id,
                expected_draft_version=4,
            ),
        ),
        provenance_source=BuilderProvenanceSource.HUMAN,
        wireframes_by_item={global_id: None},
    )

    assert analysis.approval_class is BuilderApprovalClass.DESTRUCTIVE
    assert [issue.code for issue in analysis.issues] == ["BUILDER_GLOBAL_SECTION_DELETE_REQUIRES_APPROVAL"]
    assert analysis.issues[0].meta == {"incomingReferenceCount": 0, "itemId": str(global_id)}
    assert analysis.global_section_graph.references == ()
    assert [target.kind for target in analysis.affected_targets] == ["content_item", "global_section"]

    with pytest.raises(Conflict) as stale:
        analyze_sitemap_change_set(
            structure=structure,
            manifest=manifest,
            operations=(
                BuilderGlobalSectionDeleteOperationV1(
                    type="global_section.delete",
                    operation_id="delete-stale-footer",
                    item_id=global_id,
                    expected_draft_version=3,
                ),
            ),
            provenance_source=BuilderProvenanceSource.HUMAN,
            wireframes_by_item={global_id: None},
        )
    assert stale.value.error == "SITE_REVISION_STALE"


def test_global_section_delete_is_blocked_by_exact_incoming_reference() -> None:
    structure, manifest, page_id, _ = _builder_state()
    global_id = uuid4()
    structure = structure.model_copy(
        update={
            "global_references": (
                BuilderGlobalSectionNodeSnapshotV1(
                    item_id=global_id,
                    locale="en-US",
                    slug="site-header",
                ),
            )
        }
    )
    manifest = manifest.model_copy(
        update={
            "global_section_versions": (
                BuilderGlobalSectionVersionPinV1(
                    item_id=global_id,
                    content_version_id=uuid4(),
                    version_number=2,
                    presentation_set_hash=canonical_hash([]),
                    component_binding_set_hash=canonical_hash([]),
                ),
            )
        }
    )
    page_wireframe = WireframeDocumentV1(
        page_item_id=page_id,
        design_system_version_id=manifest.design_system_version_id,
        component_catalog_version="arclayer-wireframe-v1",
        sections=(
            WireframeSectionV1(
                id="navigation",
                intent_id="intent.navigation",
                component_key="site.navigation",
                variant_key="default",
                label="Navigation",
                global_reference_id=global_id,
            ),
        ),
    )

    analysis = analyze_sitemap_change_set(
        structure=structure,
        manifest=manifest,
        operations=(
            BuilderGlobalSectionDeleteOperationV1(
                type="global_section.delete",
                operation_id="delete-site-header",
                item_id=global_id,
                expected_draft_version=2,
            ),
        ),
        provenance_source=BuilderProvenanceSource.HUMAN,
        wireframes_by_item={page_id: page_wireframe, global_id: None},
    )

    assert analysis.approval_class is BuilderApprovalClass.DESTRUCTIVE
    assert [issue.code for issue in analysis.issues] == ["BUILDER_GLOBAL_SECTION_IN_USE"]
    assert analysis.issues[0].severity == "blocker"
    assert analysis.issues[0].meta == {
        "incomingReferences": [
            {
                "hostItemId": encode_uuid(page_id),
                "hostKind": "page",
                "hostSectionId": "navigation",
                "targetItemId": encode_uuid(global_id),
            }
        ],
        "itemId": str(global_id),
    }
    assert analysis.global_section_graph.references[0].host_item_id == page_id
    with pytest.raises(Conflict) as blocked:
        require_builder_change_set_not_blocked(analysis)
    assert blocked.value.error == "BUILDER_CHANGE_SET_BLOCKED"


def test_duplicate_delete_is_rejected_before_apply() -> None:
    structure, manifest, _, child_id = _builder_state()
    operations = tuple(
        BuilderPageDeleteOperationV1(
            type="page.delete",
            operation_id=f"delete-{index}",
            item_id=child_id,
            expected_draft_version=2,
        )
        for index in range(2)
    )

    with pytest.raises(Conflict) as exc_info:
        analyze_sitemap_change_set(
            structure=structure,
            manifest=manifest,
            operations=operations,
            provenance_source=BuilderProvenanceSource.HUMAN,
        )

    assert exc_info.value.error == "BUILDER_OPERATION_INVALID"
    assert exc_info.value.meta == {"itemId": str(child_id), "reason": "duplicate_page_delete"}


def _settings() -> Settings:
    return Settings(app_env="test", auth={"jwt_secret": "builder-preview-test-secret"})


def _claims(*, expires_at: datetime) -> BuilderChangeSetPreviewTokenClaims:
    return BuilderChangeSetPreviewTokenClaims(
        change_set_id=uuid4(),
        workspace_id=uuid4(),
        project_id=uuid4(),
        site_id=uuid4(),
        environment_id=uuid4(),
        actor_user_id=uuid4(),
        base_revision_id=uuid4(),
        base_etag=canonical_hash({"base": 1}),
        operations_hash=canonical_hash([{"type": "page.reorder"}]),
        expires_at=expires_at,
    )


def test_preview_token_round_trip_hash_tamper_and_expiry() -> None:
    now = datetime(2026, 7, 20, tzinfo=UTC)
    settings = _settings()
    claims = _claims(expires_at=now + timedelta(hours=1))
    token = build_builder_change_set_preview_token(settings, claims=claims)

    assert verify_builder_change_set_preview_token(settings, token=token, now=now) == claims
    assert builder_change_set_preview_token_hash(token) == builder_change_set_preview_token_hash(token)
    with pytest.raises(Conflict) as tampered:
        verify_builder_change_set_preview_token(settings, token=f"{token}x", now=now)
    assert tampered.value.error == "CHANGE_SET_PREVIEW_REQUIRED"

    expired = build_builder_change_set_preview_token(
        settings,
        claims=_claims(expires_at=now - timedelta(seconds=1)),
    )
    with pytest.raises(Conflict) as expired_error:
        verify_builder_change_set_preview_token(settings, token=expired, now=now)
    assert expired_error.value.error == "CHANGE_SET_EXPIRED"


def test_preview_token_rejects_wrong_audience_even_with_valid_signature() -> None:
    settings = _settings()
    secret = settings.auth.jwt_secret.get_secret_value().encode()
    payload = _claims(expires_at=datetime.now(UTC) + timedelta(hours=1)).model_dump(mode="json")
    payload["audience"] = "another-purpose"
    raw = orjson.dumps(payload, option=orjson.OPT_SORT_KEYS)
    body = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    signature = base64.urlsafe_b64encode(hmac.new(secret, raw, hashlib.sha256).digest()).decode().rstrip("=")

    with pytest.raises(Conflict) as exc_info:
        verify_builder_change_set_preview_token(settings, token=f"{body}.{signature}")

    assert exc_info.value.error == "CHANGE_SET_PREVIEW_REQUIRED"


def test_preview_token_claims_require_timezone_aware_expiry() -> None:
    with pytest.raises(ValidationError):
        _claims(expires_at=datetime(2026, 7, 20))
