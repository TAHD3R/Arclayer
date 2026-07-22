from __future__ import annotations

from uuid import UUID

from src.common.types.json_types import JsonObject
from src.common.utils.public_ids import encode_uuid
from src.core.exceptions import Conflict
from src.core.i18n import t
from src.models.builder._enums import BuilderApprovalClass, BuilderProvenanceSource
from src.modules.projects.builder.change_set_analysis import BuilderChangeSetAnalysis
from src.modules.projects.builder.change_set_schema import BuilderChangeSetAffectedTargetV1
from src.modules.projects.builder.design_system_change_set_schema import (
    BuilderDesignSystemOperationV1,
    BuilderDesignSystemRefreshOperationV1,
)
from src.modules.projects.builder.design_system_context import ResolvedBuilderDesignSystem
from src.modules.projects.builder.schema import SiteRevisionManifestV1


def analyze_design_system_change_set(
    *,
    manifest: SiteRevisionManifestV1,
    resolved: ResolvedBuilderDesignSystem,
    operations: tuple[BuilderDesignSystemOperationV1, ...],
    provenance_source: BuilderProvenanceSource,
) -> BuilderChangeSetAnalysis:
    _ = provenance_source
    operation = operations[0]
    if not isinstance(operation, BuilderDesignSystemRefreshOperationV1):
        _raise_invalid(operation_id=operation.operation_id, reason="unsupported_design_system_operation")
    if (
        UUID(str(manifest.design_system_id)) == resolved.assignment.design_system_id
        and UUID(str(manifest.design_system_version_id)) == resolved.version.id
        and manifest.design_system_manifest_checksum == resolved.version.manifest_checksum
    ):
        _raise_invalid(operation_id=operation.operation_id, reason="design_system_already_pinned")
    return BuilderChangeSetAnalysis(
        operations=operations,
        affected_targets=(
            BuilderChangeSetAffectedTargetV1(
                kind="design_system",
                target_id=resolved.version.id,
                operation_ids=(operation.operation_id,),
            ),
        ),
        issues=(),
        required_permissions=("project:content:site-builder:write",),
        approval_class=BuilderApprovalClass.REVIEW,
        summary_params={
            "operationCount": 1,
            "fromDesignSystemId": encode_uuid(UUID(str(manifest.design_system_id))),
            "fromVersionId": encode_uuid(UUID(str(manifest.design_system_version_id))),
            "toDesignSystemId": encode_uuid(resolved.assignment.design_system_id),
            "toVersionId": encode_uuid(resolved.version.id),
        },
    )


def _raise_invalid(*, operation_id: str, reason: str) -> None:
    meta: JsonObject = {"operationId": operation_id, "reason": reason}
    raise Conflict(error="BUILDER_OPERATION_INVALID", message=t("errors", "BUILDER_OPERATION_INVALID"), meta=meta)


__all__ = ["analyze_design_system_change_set"]
