from __future__ import annotations

from uuid import UUID

from src.models.builder._enums import BuilderApprovalClass, BuilderProvenanceSource
from src.modules.projects.builder.change_set_analysis import BuilderChangeSetAnalysis
from src.modules.projects.builder.change_set_schema import (
    BuilderChangeSetAffectedTargetV1,
    BuilderChangeSetIssueV1,
    BuilderRevisionRestoreOperationV1,
)
from src.modules.projects.builder.schema import ContentStructureSnapshotV1, SiteRevisionManifestV1


def analyze_revision_restore_change_set(
    *,
    current_manifest: SiteRevisionManifestV1,
    current_structure: ContentStructureSnapshotV1,
    target_manifest: SiteRevisionManifestV1,
    target_structure: ContentStructureSnapshotV1,
    operation: BuilderRevisionRestoreOperationV1,
    live_item_ids: set[UUID],
    target_version_ids: set[UUID],
    missing_model_definition_item_ids: set[UUID],
    provenance_source: BuilderProvenanceSource,
) -> BuilderChangeSetAnalysis:
    issues: list[BuilderChangeSetIssueV1] = []
    current_ids = _structure_item_ids(current_structure)
    target_ids = _structure_item_ids(target_structure)
    if not target_ids.issubset(live_item_ids):
        issues.append(
            BuilderChangeSetIssueV1(
                severity="blocker",
                code="BUILDER_RESTORE_TARGET_UNAVAILABLE",
                message_key="BUILDER_RESTORE_TARGET_UNAVAILABLE",
                operation_id=operation.operation_id,
                meta={"reason": "target_items_not_retained"},
            )
        )
    if not _same_design_system(current_manifest, target_manifest):
        issues.append(
            BuilderChangeSetIssueV1(
                severity="blocker",
                code="BUILDER_RESTORE_DESIGN_SYSTEM_CHANGED",
                message_key="BUILDER_RESTORE_DESIGN_SYSTEM_CHANGED",
                operation_id=operation.operation_id,
            )
        )
    required_versions = {
        UUID(str(pin.content_version_id))
        for pin in (*target_manifest.page_versions, *target_manifest.global_section_versions)
    }
    if not required_versions.issubset(target_version_ids):
        issues.append(
            BuilderChangeSetIssueV1(
                severity="blocker",
                code="BUILDER_RESTORE_VERSION_MISSING",
                message_key="BUILDER_RESTORE_VERSION_MISSING",
                operation_id=operation.operation_id,
            )
        )
    if missing_model_definition_item_ids:
        issues.append(
            BuilderChangeSetIssueV1(
                severity="blocker",
                code="BUILDER_RESTORE_MODEL_MISSING",
                message_key="BUILDER_RESTORE_MODEL_MISSING",
                operation_id=operation.operation_id,
                meta={"itemCount": len(missing_model_definition_item_ids)},
            )
        )
    return BuilderChangeSetAnalysis(
        operations=(operation,),
        affected_targets=(
            BuilderChangeSetAffectedTargetV1(
                kind="planning",
                target_id=target_manifest.id,
                operation_ids=(operation.operation_id,),
            ),
        ),
        issues=tuple(issues),
        required_permissions=("project:content:site-builder:write", "project:content:items:write"),
        approval_class=(
            BuilderApprovalClass.REVIEW
            if provenance_source is BuilderProvenanceSource.AGENT
            else BuilderApprovalClass.NONE
        ),
        summary_params={"targetRevision": str(target_manifest.revision_number)},
    )


def _structure_item_ids(structure: ContentStructureSnapshotV1) -> set[UUID]:
    return {UUID(str(item.item_id)) for item in (*structure.pages, *structure.global_references)}


def _same_design_system(left: SiteRevisionManifestV1, right: SiteRevisionManifestV1) -> bool:
    return (
        left.design_system_id == right.design_system_id
        and left.design_system_version_id == right.design_system_version_id
        and left.design_system_manifest_checksum == right.design_system_manifest_checksum
    )


__all__ = ["analyze_revision_restore_change_set"]
