from __future__ import annotations

from src.core.i18n import t
from src.models.skills.skill_package import SkillPackageRecord
from src.models.skills.skill_version import (
    SkillResourceRecord,
    SkillValidationResultRecord,
    SkillVersionRecord,
)
from src.modules.system.skills.schema import (
    PlatformSkillPackageSummaryOut,
    PlatformSkillValidationOut,
    PlatformSkillVersionOut,
)
from src.modules.workspaces.skills.manifest import SkillManifestV1
from src.modules.workspaces.skills.projection import project_resource
from src.modules.workspaces.skills.schema import SkillValidationFindingOut


def project_platform_skill_summary(
    package: SkillPackageRecord,
    *,
    version_count: int,
) -> PlatformSkillPackageSummaryOut:
    descriptor = package.source_descriptor or {}
    authority = descriptor.get("authority")
    display_name_key = descriptor.get("displayNameKey")
    description_key = descriptor.get("descriptionKey")
    return PlatformSkillPackageSummaryOut(
        id=package.id,
        stable_key=package.stable_key,
        slug=package.slug,
        display_name=package.display_name,
        description=package.description,
        display_name_key=display_name_key if isinstance(display_name_key, str) else None,
        description_key=description_key if isinstance(description_key, str) else None,
        status=str(package.status),
        latest_valid_version_id=package.latest_valid_version_id,
        metadata_revision=package.metadata_revision,
        version_count=version_count,
        source_authority=authority if isinstance(authority, str) else "legacy_packaged_seed",
        created_by_user_id=package.created_by_user_id,
        updated_by_user_id=package.updated_by_user_id,
        created_at=package.created_at,
        updated_at=package.updated_at,
    )


def project_platform_skill_version(
    version: SkillVersionRecord,
    *,
    resources: tuple[SkillResourceRecord, ...],
    validation: SkillValidationResultRecord,
) -> PlatformSkillVersionOut:
    findings = tuple(
        finding.model_copy(update={"message": t("errors", finding.message_key)})
        for finding in (SkillValidationFindingOut.model_validate(item) for item in (validation.findings or []))
    )
    return PlatformSkillVersionOut(
        id=version.id,
        package_id=version.package_id,
        version_number=version.version_number,
        semantic_version=version.semantic_version,
        package_checksum=version.package_checksum,
        status=str(version.status),
        manifest=SkillManifestV1.model_validate(version.manifest),
        resources=tuple(project_resource(resource) for resource in resources),
        source_provenance=dict(version.source_provenance or {}),
        validation=PlatformSkillValidationOut(
            id=validation.id,
            policy_version=validation.validator_policy_version,
            status=str(validation.status),
            findings=findings,
            finding_hash=validation.finding_hash,
            actor_user_id=validation.actor_user_id,
            created_at=validation.created_at,
        ),
        created_by_user_id=version.provenance_actor_user_id,
        created_at=version.created_at,
    )
