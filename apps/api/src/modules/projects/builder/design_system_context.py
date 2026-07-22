from __future__ import annotations

from typing import NoReturn
from uuid import UUID

from pydantic import BaseModel, ConfigDict, ValidationError
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict
from src.core.i18n import t
from src.models.design_systems._enums import DesignSystemValidationStatus
from src.models.design_systems.design_system import ProjectDesignSystemAssignmentRecord
from src.models.design_systems.design_system_version import (
    DesignSystemValidationResultRecord,
    DesignSystemVersionRecord,
)
from src.modules.projects.builder.design_system_change_set_schema import (
    BuilderDesignSystemRefreshOperationV1,
)
from src.modules.projects.builder.schema import BuilderInitializationRequest
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.sites.component_catalogs.registry import ComponentCatalogResolver
from src.modules.sites.component_catalogs.schema import ComponentCatalogV1
from src.modules.workspaces.design_systems.manifest import DesignSystemManifestV1


class ResolvedBuilderDesignSystem(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid", frozen=True)

    assignment: ProjectDesignSystemAssignmentRecord
    version: DesignSystemVersionRecord
    validation: DesignSystemValidationResultRecord
    component_catalog: ComponentCatalogV1


async def resolve_exact_builder_design_system(
    *,
    repository: ProjectDesignSystemsRepository,
    component_catalog_resolver: ComponentCatalogResolver,
    workspace_id: UUID,
    project_id: UUID,
    payload: BuilderInitializationRequest,
    conn: BaseDBAsyncClient,
) -> ResolvedBuilderDesignSystem:
    return await _resolve_exact_builder_design_system(
        repository=repository,
        component_catalog_resolver=component_catalog_resolver,
        workspace_id=workspace_id,
        project_id=project_id,
        expected_assignment_revision=payload.expected_design_system_assignment_revision,
        expected_design_system_id=None,
        expected_version_id=UUID(str(payload.expected_design_system_version_id)),
        expected_manifest_checksum=payload.expected_design_system_manifest_checksum,
        expected_validation_finding_hash=None,
        conn=conn,
    )


async def resolve_builder_design_system_refresh(
    *,
    repository: ProjectDesignSystemsRepository,
    component_catalog_resolver: ComponentCatalogResolver,
    workspace_id: UUID,
    project_id: UUID,
    operation: BuilderDesignSystemRefreshOperationV1,
    conn: BaseDBAsyncClient,
) -> ResolvedBuilderDesignSystem:
    return await _resolve_exact_builder_design_system(
        repository=repository,
        component_catalog_resolver=component_catalog_resolver,
        workspace_id=workspace_id,
        project_id=project_id,
        expected_assignment_revision=operation.expected_assignment_revision,
        expected_design_system_id=UUID(str(operation.design_system_id)),
        expected_version_id=UUID(str(operation.version_id)),
        expected_manifest_checksum=operation.expected_manifest_checksum,
        expected_validation_finding_hash=operation.validation_finding_hash,
        conn=conn,
    )


async def _resolve_exact_builder_design_system(
    *,
    repository: ProjectDesignSystemsRepository,
    component_catalog_resolver: ComponentCatalogResolver,
    workspace_id: UUID,
    project_id: UUID,
    expected_assignment_revision: int,
    expected_design_system_id: UUID | None,
    expected_version_id: UUID,
    expected_manifest_checksum: str,
    expected_validation_finding_hash: str | None,
    conn: BaseDBAsyncClient,
) -> ResolvedBuilderDesignSystem:
    assignment = await repository.get_assignment(
        project_id=project_id,
        conn=conn,
        for_update=True,
    )
    if assignment is None:
        _raise_conflict("PROJECT_DESIGN_SYSTEM_ASSIGNMENT_REQUIRED")
    if (
        int(assignment.metadata_revision) != expected_assignment_revision
        or (expected_design_system_id is not None and assignment.design_system_id != expected_design_system_id)
        or assignment.design_system_version_id != expected_version_id
        or assignment.manifest_checksum != expected_manifest_checksum
        or (
            expected_validation_finding_hash is not None
            and assignment.validation_finding_hash != expected_validation_finding_hash
        )
    ):
        _raise_conflict("DESIGN_SYSTEM_REVISION_CONFLICT")
    version = await repository.get_version(
        workspace_id=workspace_id,
        system_id=assignment.design_system_id,
        version_id=assignment.design_system_version_id,
        conn=conn,
    )
    validation = await repository.latest_validation(
        workspace_id=workspace_id,
        version_id=assignment.design_system_version_id,
        conn=conn,
    )
    if (
        version is None
        or validation is None
        or version.manifest_checksum != assignment.manifest_checksum
        or validation.finding_hash != assignment.validation_finding_hash
        or validation.status != DesignSystemValidationStatus.VALID
    ):
        _raise_conflict("DESIGN_SYSTEM_ASSIGNMENT_INVALID")
    try:
        design_manifest = DesignSystemManifestV1.model_validate(version.manifest)
    except ValidationError:
        _raise_conflict("DESIGN_SYSTEM_COMPONENT_INCOMPATIBLE")
    catalog_version = design_manifest.component_catalog_version
    catalog = component_catalog_resolver.resolve(catalog_version) if catalog_version is not None else None
    compatibility = validation.compatibility if isinstance(validation.compatibility, dict) else {}
    if (
        catalog is None
        or version.component_catalog_version != catalog_version
        or validation.validator_version < 2
        or compatibility.get("componentCatalog") != "compatible"
        or compatibility.get("componentCatalogChecksum") != catalog.checksum
    ):
        _raise_conflict("DESIGN_SYSTEM_COMPONENT_INCOMPATIBLE")
    return ResolvedBuilderDesignSystem(
        assignment=assignment,
        version=version,
        validation=validation,
        component_catalog=catalog,
    )


def _raise_conflict(code: str) -> NoReturn:
    raise Conflict(error=code, message=t("errors", code))
