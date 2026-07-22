from __future__ import annotations

from typing import Literal, cast

from src.models.design_systems.design_system import DesignSystemRecord, WorkspaceDesignSystemDefaultRecord
from src.models.design_systems.design_system_version import (
    DesignSystemValidationResultRecord,
    DesignSystemVersionRecord,
    DesignSystemVersionStateRecord,
)
from src.modules.workspaces.design_systems.manifest import DesignSystemManifestV1
from src.modules.workspaces.design_systems.schema import (
    DesignSystemDetailOut,
    DesignSystemLifecycleStatus,
    DesignSystemSummaryOut,
    DesignSystemValidationResultOut,
    DesignSystemVersionDetailOut,
    DesignSystemVersionSummaryOut,
    WorkspaceDesignSystemDefaultOut,
)
from src.modules.workspaces.design_systems.validator import DesignSystemValidationFinding


def project_system_summary(
    record: DesignSystemRecord,
    *,
    version_count: int,
    default: WorkspaceDesignSystemDefaultRecord | None,
) -> DesignSystemSummaryOut:
    is_default = default is not None and default.design_system_id == record.id
    return DesignSystemSummaryOut(
        id=record.id,
        workspace_id=record.workspace_id,
        owner_kind=cast(Literal["workspace", "project"], str(record.owner_kind)),
        owning_project_id=record.owning_project_id,
        name=record.name,
        description=record.description,
        status=cast(Literal["active", "archived"], str(record.status)),
        is_default=is_default,
        default_version_id=(default.design_system_version_id if default is not None and is_default else None),
        latest_valid_version_id=record.latest_valid_version_id,
        metadata_revision=record.metadata_revision,
        version_count=version_count,
        created_by_user_id=record.created_by_user_id,
        updated_by_user_id=record.updated_by_user_id,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def project_system_detail(
    record: DesignSystemRecord,
    *,
    version_count: int,
    default: WorkspaceDesignSystemDefaultRecord | None,
    latest_version: DesignSystemVersionRecord | None,
    latest_validation: DesignSystemValidationResultRecord | None,
    latest_version_state: DesignSystemVersionStateRecord | None,
) -> DesignSystemDetailOut:
    return DesignSystemDetailOut(
        **project_system_summary(record, version_count=version_count, default=default).model_dump(),
        latest_version=(
            project_version_summary(
                latest_version,
                validation=latest_validation,
                lifecycle_state=latest_version_state,
            )
            if latest_version is not None and latest_version_state is not None
            else None
        ),
    )


def project_version_summary(
    record: DesignSystemVersionRecord,
    *,
    validation: DesignSystemValidationResultRecord | None,
    lifecycle_state: DesignSystemVersionStateRecord,
) -> DesignSystemVersionSummaryOut:
    return DesignSystemVersionSummaryOut(
        id=record.id,
        design_system_id=record.design_system_id,
        workspace_id=record.workspace_id,
        version_number=record.version_number,
        manifest_checksum=record.manifest_checksum,
        token_index_hash=record.token_index_hash,
        component_catalog_version=record.component_catalog_version,
        parent_version_id=record.parent_version_id,
        source=str(record.source),
        validation_status=str(validation.status) if validation is not None else None,
        validation_finding_hash=validation.finding_hash if validation is not None else None,
        lifecycle_status=cast(DesignSystemLifecycleStatus, str(lifecycle_state.status)),
        status_revision=lifecycle_state.status_revision,
        superseded_by_version_id=lifecycle_state.superseded_by_version_id,
        status_changed_at=lifecycle_state.status_changed_at,
        status_changed_by_user_id=lifecycle_state.status_changed_by_user_id,
        publish_ready=False,
        created_by_user_id=record.created_by_user_id,
        created_at=record.created_at,
    )


def project_version_detail(
    record: DesignSystemVersionRecord,
    *,
    validation: DesignSystemValidationResultRecord | None,
    lifecycle_state: DesignSystemVersionStateRecord,
) -> DesignSystemVersionDetailOut:
    return DesignSystemVersionDetailOut(
        **project_version_summary(
            record,
            validation=validation,
            lifecycle_state=lifecycle_state,
        ).model_dump(),
        manifest=DesignSystemManifestV1.model_validate(record.manifest),
        provenance=dict(record.provenance),
    )


def project_validation(record: DesignSystemValidationResultRecord) -> DesignSystemValidationResultOut:
    return DesignSystemValidationResultOut(
        id=record.id,
        design_system_version_id=record.design_system_version_id,
        workspace_id=record.workspace_id,
        profile="foundation",
        validator_version=record.validator_version,
        status=cast(Literal["valid", "invalid"], str(record.status)),
        findings=tuple(DesignSystemValidationFinding.model_validate(item) for item in record.findings),
        finding_hash=record.finding_hash,
        token_index_hash=record.token_index_hash,
        publish_ready=False,
        compatibility={str(key): str(value) for key, value in dict(record.compatibility).items()},
        actor_user_id=record.actor_user_id,
        created_at=record.created_at,
    )


def project_default(record: WorkspaceDesignSystemDefaultRecord) -> WorkspaceDesignSystemDefaultOut:
    return WorkspaceDesignSystemDefaultOut(
        workspace_id=record.workspace_id,
        design_system_id=record.design_system_id,
        version_id=record.design_system_version_id,
        manifest_checksum=record.manifest_checksum,
        validation_finding_hash=record.validation_finding_hash,
        metadata_revision=record.metadata_revision,
        assigned_by_user_id=record.assigned_by_user_id,
        updated_at=record.updated_at,
    )
