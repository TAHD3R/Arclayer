from __future__ import annotations

from typing import NoReturn
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from src.config import Settings
from src.core.exceptions import NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.skills._enums import SkillPackageScope, SkillValidationStatus, SkillVersionStatus
from src.models.skills.skill_installation import SkillInstallationRecord
from src.models.skills.skill_package import SkillPackageRecord
from src.models.skills.skill_version import SkillValidationResultRecord, SkillVersionRecord
from src.modules.workspaces.skills.lifecycle_repository import WorkspaceSkillLifecycleRepository
from src.modules.workspaces.skills.manifest import SkillManifestV1, validate_skill_package_checksum
from src.modules.workspaces.skills.official_catalog_projection import (
    project_official_catalog_detail,
    project_official_catalog_item,
)
from src.modules.workspaces.skills.official_catalog_repository import OfficialSkillCatalogRepository
from src.modules.workspaces.skills.projection import project_resource
from src.modules.workspaces.skills.schema import (
    OfficialSkillCatalogDetailOut,
    OfficialSkillCatalogItemOut,
    SkillCursorPage,
    SkillValidationFindingOut,
)
from src.modules.workspaces.skills.update_review import SkillUpdateTarget


class ResolvedOfficialSkillTarget(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    package_id: UUID
    version_id: UUID
    package_checksum: str
    validation_finding_hash: str
    manifest: SkillManifestV1


class WorkspaceOfficialSkillCatalogService(BaseService):
    def __init__(
        self,
        *,
        catalog: OfficialSkillCatalogRepository,
        installations: WorkspaceSkillLifecycleRepository,
        settings: Settings | None = None,
    ) -> None:
        super().__init__(settings)
        self._catalog = catalog
        self._installations = installations

    async def list_catalog(
        self,
        *,
        workspace_id: UUID,
        limit: int,
        cursor: UUID | None,
        query: str | None,
    ) -> SkillCursorPage[OfficialSkillCatalogItemOut]:
        packages, next_cursor = await self._catalog.list_packages(
            limit=limit,
            cursor=cursor,
            query=_optional_query(query),
        )
        version_ids = tuple(_require_latest_version_id(package) for package in packages)
        versions = await self._catalog.get_versions_by_ids(version_ids=version_ids)
        validations = await self._catalog.get_latest_validations_by_version_ids(version_ids=version_ids)
        installations = await self._installations.get_installations_by_packages(
            workspace_id=workspace_id,
            package_scope="system",
            package_ids=tuple(package.id for package in packages),
        )
        installation_by_package = {record.package_id: record for record in installations}
        items = tuple(
            _project_catalog_item(
                package=package,
                versions=versions,
                validations=validations,
                installation=installation_by_package.get(package.id),
            )
            for package in packages
        )
        return SkillCursorPage[OfficialSkillCatalogItemOut](items=items, next_cursor=next_cursor)

    async def get_catalog_package(
        self,
        *,
        workspace_id: UUID,
        package_id: UUID,
    ) -> OfficialSkillCatalogDetailOut:
        package = await self._require_package(package_id=package_id)
        version_id = _require_latest_version_id(package)
        version = await self._require_version(package_id=package.id, version_id=version_id)
        validation = await self._require_validation(version_id=version.id)
        resources = await self._catalog.list_resources(version_id=version.id)
        installation = await self._installation_for(
            workspace_id=workspace_id,
            package_id=package.id,
        )
        _require_installable_records(version=version, validation=validation)
        return project_official_catalog_detail(
            package=package,
            version=version,
            resources=resources,
            validation=validation,
            installation=installation,
        )

    async def resolve_installation_target(
        self,
        *,
        package_id: UUID,
        version_id: UUID,
    ) -> ResolvedOfficialSkillTarget:
        target = await self.resolve_update_target(package_id=package_id, version_id=version_id)
        return ResolvedOfficialSkillTarget(
            package_id=target.package_id,
            version_id=target.version_id,
            package_checksum=target.package_checksum,
            validation_finding_hash=target.validation_finding_hash,
            manifest=target.manifest,
        )

    async def resolve_update_target(
        self,
        *,
        package_id: UUID,
        version_id: UUID,
    ) -> SkillUpdateTarget:
        package = await self._require_package(package_id=package_id)
        version = await self._require_version(package_id=package.id, version_id=version_id)
        validation = await self._require_validation(version_id=version.id)
        resources = await self._catalog.list_resources(version_id=version.id)
        manifest = _require_installable_records(version=version, validation=validation)
        return SkillUpdateTarget(
            package_scope=SkillPackageScope.SYSTEM,
            package_id=package.id,
            version_id=version.id,
            version_number=version.version_number,
            semantic_version=version.semantic_version,
            package_checksum=version.package_checksum,
            manifest=manifest,
            resources=tuple(project_resource(resource) for resource in resources),
            validation_policy_version=validation.validator_policy_version,
            validation_status=str(validation.status),
            validation_finding_hash=validation.finding_hash,
            validation_findings=_project_validation_findings(validation),
            source_provenance=version.source_provenance or {},
        )

    async def _require_package(self, *, package_id: UUID) -> SkillPackageRecord:
        package = await self._catalog.get_package(package_id=package_id)
        if package is None:
            _raise_not_found()
        return package

    async def _require_version(self, *, package_id: UUID, version_id: UUID) -> SkillVersionRecord:
        version = await self._catalog.get_version(package_id=package_id, version_id=version_id)
        if version is None:
            _raise_not_found()
        return version

    async def _require_validation(self, *, version_id: UUID) -> SkillValidationResultRecord:
        validation = await self._catalog.get_latest_validation(version_id=version_id)
        if validation is None:
            raise RuntimeError("Official Skill version is missing validation evidence")
        return validation

    async def _installation_for(
        self,
        *,
        workspace_id: UUID,
        package_id: UUID,
    ) -> SkillInstallationRecord | None:
        records = await self._installations.get_installations_by_packages(
            workspace_id=workspace_id,
            package_scope="system",
            package_ids=(package_id,),
        )
        return records[0] if records else None


def _require_installable_records(
    *,
    version: SkillVersionRecord,
    validation: SkillValidationResultRecord,
) -> SkillManifestV1:
    if str(version.status) not in {
        SkillVersionStatus.VALID.value,
        SkillVersionStatus.WARNING.value,
    } or str(validation.status) not in {
        SkillValidationStatus.VALID.value,
        SkillValidationStatus.WARNING.value,
    }:
        raise RuntimeError("Official Skill catalog exposes a non-installable version")
    manifest = SkillManifestV1.model_validate(version.manifest)
    validate_skill_package_checksum(manifest)
    if manifest.checksum != version.package_checksum:
        raise RuntimeError("Official Skill manifest checksum differs from its version record")
    return manifest


def _project_catalog_item(
    *,
    package: SkillPackageRecord,
    versions: dict[UUID, SkillVersionRecord],
    validations: dict[UUID, SkillValidationResultRecord],
    installation: SkillInstallationRecord | None,
) -> OfficialSkillCatalogItemOut:
    version_id = _require_latest_version_id(package)
    version = _require_mapping_record(versions, version_id)
    validation = _require_mapping_record(validations, version_id)
    _require_installable_records(version=version, validation=validation)
    return project_official_catalog_item(
        package=package,
        version=version,
        validation=validation,
        installation=installation,
    )


def _require_latest_version_id(package: SkillPackageRecord) -> UUID:
    if package.latest_valid_version_id is None:
        raise RuntimeError("Official Skill package has no valid version")
    return package.latest_valid_version_id


def _require_mapping_record[T](records: dict[UUID, T], record_id: UUID) -> T:
    record = records.get(record_id)
    if record is None:
        raise RuntimeError("Official Skill catalog projection is incomplete")
    return record


def _optional_query(value: str | None) -> str | None:
    normalized = value.strip() if value else ""
    return normalized or None


def _project_validation_findings(
    validation: SkillValidationResultRecord,
) -> tuple[SkillValidationFindingOut, ...]:
    return tuple(
        finding.model_copy(update={"message": t("errors", finding.message_key)})
        for finding in (SkillValidationFindingOut.model_validate(item) for item in (validation.findings or []))
    )


def _raise_not_found() -> NoReturn:
    raise NotFound(error="SKILL_NOT_FOUND", message=t("errors", "SKILL_NOT_FOUND"))
