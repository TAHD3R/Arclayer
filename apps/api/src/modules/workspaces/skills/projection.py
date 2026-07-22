from __future__ import annotations

from typing import Literal, cast

from src.core.i18n import t
from src.models.skills.skill_github_import import SkillGitHubImportRecord
from src.models.skills.skill_installation import SkillInstallationRecord
from src.models.skills.skill_package import SkillPackageRecord
from src.models.skills.skill_version import (
    SkillResourceRecord,
    SkillValidationResultRecord,
    SkillVersionRecord,
)
from src.modules.workspaces.skills.manifest import SkillManifestV1
from src.modules.workspaces.skills.schema import (
    SkillGitHubImportOut,
    SkillInstallationOut,
    SkillPackageDetailOut,
    SkillPackageSummaryOut,
    SkillResourceOut,
    SkillValidationFindingOut,
    SkillValidationResultOut,
    SkillVersionDetailOut,
    SkillVersionSummaryOut,
)


def project_github_import(record: SkillGitHubImportRecord) -> SkillGitHubImportOut:
    return SkillGitHubImportOut(
        id=record.id,
        workspace_id=record.workspace_id,
        package_id=record.package_id,
        version_id=record.version_id,
        operation=cast(Literal["initial", "refresh"], str(record.operation)),
        status=cast(
            Literal["queued", "fetching", "persisting", "succeeded", "failed", "cancelled"],
            str(record.status),
        ),
        repository_url=record.repository_url,
        requested_ref=record.requested_ref,
        subpath=record.subpath,
        request_revision=record.request_revision,
        resolved_commit=record.resolved_commit,
        resolved_tree=record.resolved_tree,
        job_id=record.job_id,
        safe_error_code=record.safe_error_code,
        safe_error_message=record.safe_error_message,
        actor_user_id=record.actor_user_id,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def project_package_summary(
    record: SkillPackageRecord,
    *,
    version_count: int,
) -> SkillPackageSummaryOut:
    if record.workspace_id is None:
        raise RuntimeError("Workspace Skill package is missing workspace identity")
    return SkillPackageSummaryOut(
        id=record.id,
        workspace_id=record.workspace_id,
        slug=record.slug,
        display_name=record.display_name,
        description=record.description,
        source_kind=str(record.source_kind),
        trust_level=str(record.trust_level),
        publisher_id=record.publisher_id,
        publisher_name=record.publisher_name,
        status=str(record.status),
        latest_valid_version_id=record.latest_valid_version_id,
        metadata_revision=record.metadata_revision,
        version_count=version_count,
        created_by_user_id=record.created_by_user_id,
        updated_by_user_id=record.updated_by_user_id,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def project_package_detail(
    record: SkillPackageRecord,
    *,
    version_count: int,
    latest_version: SkillVersionRecord | None,
) -> SkillPackageDetailOut:
    summary = project_package_summary(record, version_count=version_count)
    return SkillPackageDetailOut(
        **summary.model_dump(),
        latest_version=project_version_summary(latest_version) if latest_version is not None else None,
    )


def project_version_summary(record: SkillVersionRecord) -> SkillVersionSummaryOut:
    if record.workspace_id is None:
        raise RuntimeError("Workspace Skill version is missing workspace identity")
    return SkillVersionSummaryOut(
        id=record.id,
        package_id=record.package_id,
        workspace_id=record.workspace_id,
        version_number=record.version_number,
        semantic_version=record.semantic_version,
        package_checksum=record.package_checksum,
        status=str(record.status),
        validation_policy_version=record.validation_policy_version,
        created_by_user_id=record.provenance_actor_user_id,
        created_at=record.created_at,
    )


def project_version_detail(
    record: SkillVersionRecord,
    *,
    resources: tuple[SkillResourceRecord, ...],
) -> SkillVersionDetailOut:
    summary = project_version_summary(record)
    return SkillVersionDetailOut(
        **summary.model_dump(),
        manifest=SkillManifestV1.model_validate(record.manifest),
        resources=tuple(project_resource(resource) for resource in resources),
        source_provenance=record.source_provenance or {},
    )


def project_resource(record: SkillResourceRecord) -> SkillResourceOut:
    return SkillResourceOut(
        path=record.normalized_path,
        role=str(record.role),
        mime_type=record.mime_type,
        byte_size=record.byte_size,
        digest=record.content_digest,
        content=record.inline_content,
    )


def project_validation_result(record: SkillValidationResultRecord) -> SkillValidationResultOut:
    if record.workspace_id is None:
        raise RuntimeError("Workspace Skill validation is missing workspace identity")
    return SkillValidationResultOut(
        id=record.id,
        version_id=record.skill_version_id,
        workspace_id=record.workspace_id,
        policy_version=record.validator_policy_version,
        status=str(record.status),
        findings=tuple(
            finding.model_copy(update={"message": t("errors", finding.message_key)})
            for finding in (SkillValidationFindingOut.model_validate(item) for item in (record.findings or []))
        ),
        finding_hash=record.finding_hash,
        actor_user_id=record.actor_user_id,
        created_at=record.created_at,
    )


def project_installation(record: SkillInstallationRecord) -> SkillInstallationOut:
    return SkillInstallationOut(
        id=record.id,
        workspace_id=record.workspace_id,
        package_scope=str(record.package_scope),
        package_id=record.package_id,
        version_id=record.version_id,
        package_checksum=record.package_checksum,
        status=str(record.status),
        safe_reason_code=record.safe_reason_code,
        accepted_required_tools=tuple(str(item) for item in (record.accepted_required_tools or [])),
        accepted_permissions=tuple(str(item) for item in (record.accepted_permissions or [])),
        accepted_data_egress=tuple(str(item) for item in (record.accepted_data_egress or [])),
        validation_finding_hash=record.validation_finding_hash,
        metadata_revision=record.metadata_revision,
        installed_by_user_id=record.installed_by_user_id,
        updated_by_user_id=record.updated_by_user_id,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )
