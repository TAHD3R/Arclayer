from __future__ import annotations

from src.core.i18n import t
from src.models.skills.skill_installation import SkillInstallationRecord
from src.models.skills.skill_package import SkillPackageRecord
from src.models.skills.skill_version import (
    SkillResourceRecord,
    SkillValidationResultRecord,
    SkillVersionRecord,
)
from src.modules.workspaces.skills.manifest import SkillManifestV1
from src.modules.workspaces.skills.projection import project_resource
from src.modules.workspaces.skills.schema import (
    OfficialSkillCatalogDetailOut,
    OfficialSkillCatalogItemOut,
    OfficialSkillValidationEvidenceOut,
    SkillValidationFindingOut,
)


def project_official_catalog_item(
    *,
    package: SkillPackageRecord,
    version: SkillVersionRecord,
    validation: SkillValidationResultRecord,
    installation: SkillInstallationRecord | None,
) -> OfficialSkillCatalogItemOut:
    _require_official_records(package=package, version=version, validation=validation)
    descriptor = package.source_descriptor or {}
    display_name_key = descriptor.get("displayNameKey")
    description_key = descriptor.get("descriptionKey")
    if not isinstance(display_name_key, str) or not isinstance(description_key, str):
        raise RuntimeError("Official Skill package is missing product copy keys")
    manifest = SkillManifestV1.model_validate(version.manifest)
    return OfficialSkillCatalogItemOut(
        package_id=package.id,
        version_id=version.id,
        slug=package.slug,
        display_name=package.display_name,
        description=package.description,
        display_name_key=display_name_key,
        description_key=description_key,
        publisher_id=package.publisher_id,
        publisher_name=package.publisher_name,
        publisher_verified=True,
        semantic_version=version.semantic_version,
        version_number=version.version_number,
        package_checksum=version.package_checksum,
        capability_tags=manifest.capability_tags,
        validation_status=str(validation.status),
        validation_finding_hash=validation.finding_hash,
        installed=installation is not None,
        installation_id=installation.id if installation is not None else None,
        installation_version_id=installation.version_id if installation is not None else None,
        installation_status=str(installation.status) if installation is not None else None,
        installation_metadata_revision=installation.metadata_revision if installation is not None else None,
        updated_at=package.updated_at,
    )


def project_official_catalog_detail(
    *,
    package: SkillPackageRecord,
    version: SkillVersionRecord,
    resources: tuple[SkillResourceRecord, ...],
    validation: SkillValidationResultRecord,
    installation: SkillInstallationRecord | None,
) -> OfficialSkillCatalogDetailOut:
    item = project_official_catalog_item(
        package=package,
        version=version,
        validation=validation,
        installation=installation,
    )
    findings = tuple(
        finding.model_copy(update={"message": t("errors", finding.message_key)})
        for finding in (SkillValidationFindingOut.model_validate(raw) for raw in (validation.findings or []))
    )
    return OfficialSkillCatalogDetailOut(
        **item.model_dump(),
        manifest=SkillManifestV1.model_validate(version.manifest),
        resources=tuple(project_resource(resource) for resource in resources),
        validation=OfficialSkillValidationEvidenceOut(
            policy_version=validation.validator_policy_version,
            status=str(validation.status),
            findings=findings,
            finding_hash=validation.finding_hash,
            created_at=validation.created_at,
        ),
    )


def _require_official_records(
    *,
    package: SkillPackageRecord,
    version: SkillVersionRecord,
    validation: SkillValidationResultRecord,
) -> None:
    verification = package.publisher_verification or {}
    if (
        package.workspace_id is not None
        or version.workspace_id is not None
        or validation.workspace_id is not None
        or str(package.scope) != "system"
        or str(package.source_kind) != "builtin"
        or str(package.trust_level) != "official_verified"
        or verification.get("verified") is not True
    ):
        raise RuntimeError("Official Skill catalog contains a non-official record")
