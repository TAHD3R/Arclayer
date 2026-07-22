from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, status

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.models.skills._enums import SkillInstallationStatus, SkillPackageStatus
from src.modules.auth.http.service import get_current_user_id
from src.modules.jobs.service import BackgroundJobService
from src.modules.tenancy.context import require_current_tenant_context
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access
from src.modules.workspaces.skills.github_import_repository import WorkspaceSkillGitHubImportRepository
from src.modules.workspaces.skills.github_import_service import WorkspaceSkillGitHubImportService
from src.modules.workspaces.skills.impact_repository import WorkspaceSkillImpactRepository
from src.modules.workspaces.skills.impact_schema import (
    SkillInstallationImpactOut,
    SkillInstallationRemovalOut,
    SkillPackageArchiveOut,
    SkillPackageImpactOut,
)
from src.modules.workspaces.skills.impact_service import WorkspaceSkillImpactService
from src.modules.workspaces.skills.lifecycle_repository import WorkspaceSkillLifecycleRepository
from src.modules.workspaces.skills.lifecycle_service import WorkspaceSkillLifecycleService
from src.modules.workspaces.skills.official_catalog_repository import OfficialSkillCatalogRepository
from src.modules.workspaces.skills.official_catalog_service import WorkspaceOfficialSkillCatalogService
from src.modules.workspaces.skills.package_impact_service import WorkspaceSkillPackageImpactService
from src.modules.workspaces.skills.repository import WorkspaceSkillsRepository
from src.modules.workspaces.skills.schema import (
    OfficialSkillCatalogDetailOut,
    OfficialSkillCatalogItemOut,
    SkillCursorPage,
    SkillGitHubImportAcceptedOut,
    SkillGitHubImportCreateRequest,
    SkillGitHubImportOut,
    SkillInstallationCreateRequest,
    SkillInstallationOut,
    SkillInstallationUpdateRequest,
    SkillPackageCreateOut,
    SkillPackageCreateRequest,
    SkillPackageDetailOut,
    SkillPackageSummaryOut,
    SkillValidationCreateRequest,
    SkillValidationResultOut,
    SkillVersionCreateRequest,
    SkillVersionDetailOut,
    SkillVersionSummaryOut,
    WorkspaceSkillsCapabilitiesOut,
)
from src.modules.workspaces.skills.service import (
    WorkspaceSkillsService,
    workspace_skills_capabilities,
)
from src.modules.workspaces.skills.update_repository import WorkspaceSkillUpdateRepository
from src.modules.workspaces.skills.update_schema import (
    SkillInstallationRepinOut,
    SkillInstallationRepinRequest,
    SkillUpdatePreviewCreateRequest,
    SkillUpdatePreviewOut,
)
from src.modules.workspaces.skills.update_service import WorkspaceSkillUpdateService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/skills",
    tags=["domain.workspaces.skills"],
)

ReadContext = Annotated[WorkspaceContext, Depends(require_workspace_manage_access)]
ActorUserId = Annotated[UUID, Depends(get_current_user_id)]
IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)]


def get_workspace_skills_service(_ctx: ReadContext) -> WorkspaceSkillsService:
    return WorkspaceSkillsService(
        repository=WorkspaceSkillsRepository(require_current_tenant_context()),
    )


SkillsService = Annotated[WorkspaceSkillsService, Depends(get_workspace_skills_service)]


def get_workspace_skill_github_import_service(
    _ctx: ReadContext,
    settings: Annotated[Settings, Depends(get_settings)],
) -> WorkspaceSkillGitHubImportService:
    tenant_context = require_current_tenant_context()
    return WorkspaceSkillGitHubImportService(
        imports=WorkspaceSkillGitHubImportRepository(tenant_context),
        packages=WorkspaceSkillsRepository(tenant_context),
        jobs=BackgroundJobService(settings),
        settings=settings,
    )


GitHubImportService = Annotated[
    WorkspaceSkillGitHubImportService,
    Depends(get_workspace_skill_github_import_service),
]


def get_workspace_official_skill_catalog_service(
    _ctx: ReadContext,
) -> WorkspaceOfficialSkillCatalogService:
    return WorkspaceOfficialSkillCatalogService(
        catalog=OfficialSkillCatalogRepository(),
        installations=WorkspaceSkillLifecycleRepository(require_current_tenant_context()),
    )


OfficialCatalogService = Annotated[
    WorkspaceOfficialSkillCatalogService,
    Depends(get_workspace_official_skill_catalog_service),
]


def get_workspace_skill_lifecycle_service(_ctx: ReadContext) -> WorkspaceSkillLifecycleService:
    tenant_context = require_current_tenant_context()
    lifecycle = WorkspaceSkillLifecycleRepository(tenant_context)
    return WorkspaceSkillLifecycleService(
        packages=WorkspaceSkillsRepository(tenant_context),
        lifecycle=lifecycle,
        official_catalog=WorkspaceOfficialSkillCatalogService(
            catalog=OfficialSkillCatalogRepository(),
            installations=lifecycle,
        ),
    )


LifecycleService = Annotated[
    WorkspaceSkillLifecycleService,
    Depends(get_workspace_skill_lifecycle_service),
]


def get_workspace_skill_update_service(_ctx: ReadContext) -> WorkspaceSkillUpdateService:
    tenant_context = require_current_tenant_context()
    lifecycle = WorkspaceSkillLifecycleRepository(tenant_context)
    return WorkspaceSkillUpdateService(
        packages=WorkspaceSkillsRepository(tenant_context),
        lifecycle=lifecycle,
        updates=WorkspaceSkillUpdateRepository(tenant_context),
        official_catalog=WorkspaceOfficialSkillCatalogService(
            catalog=OfficialSkillCatalogRepository(),
            installations=lifecycle,
        ),
    )


UpdateService = Annotated[
    WorkspaceSkillUpdateService,
    Depends(get_workspace_skill_update_service),
]


def get_workspace_skill_impact_service(_ctx: ReadContext) -> WorkspaceSkillImpactService:
    tenant_context = require_current_tenant_context()
    return WorkspaceSkillImpactService(
        lifecycle=WorkspaceSkillLifecycleRepository(tenant_context),
        impact=WorkspaceSkillImpactRepository(tenant_context),
    )


ImpactService = Annotated[
    WorkspaceSkillImpactService,
    Depends(get_workspace_skill_impact_service),
]


def get_workspace_skill_package_impact_service(
    _ctx: ReadContext,
) -> WorkspaceSkillPackageImpactService:
    tenant_context = require_current_tenant_context()
    return WorkspaceSkillPackageImpactService(
        packages=WorkspaceSkillsRepository(tenant_context),
        lifecycle=WorkspaceSkillLifecycleRepository(tenant_context),
        impact=WorkspaceSkillImpactRepository(tenant_context),
    )


PackageImpactService = Annotated[
    WorkspaceSkillPackageImpactService,
    Depends(get_workspace_skill_package_impact_service),
]


@router.get(
    "/capabilities",
    response_model=ResponseModel[WorkspaceSkillsCapabilitiesOut],
    dependencies=[require_workspace_permission("system:settings:read")],
    summary="Get Workspace Skills rollout capabilities",
)
async def get_workspace_skills_capabilities(
    _ctx: ReadContext,
    settings: Annotated[Settings, Depends(get_settings)],
) -> ResponseModel[WorkspaceSkillsCapabilitiesOut]:
    return ApiResponse.success(data=workspace_skills_capabilities(settings))


@router.post(
    "/imports",
    response_model=ResponseModel[SkillGitHubImportAcceptedOut],
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[require_workspace_permission("system:settings:manage")],
    summary="Queue an immutable public GitHub Skill import",
)
async def create_workspace_skill_github_import(
    payload: SkillGitHubImportCreateRequest,
    ctx: ReadContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: GitHubImportService,
) -> ResponseModel[SkillGitHubImportAcceptedOut]:
    data = await service.create_import(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/imports/{import_id}",
    response_model=ResponseModel[SkillGitHubImportOut],
    dependencies=[require_workspace_permission("system:settings:read")],
    summary="Get a durable public GitHub Skill import",
)
async def get_workspace_skill_github_import(
    import_id: PublicUUID,
    ctx: ReadContext,
    service: GitHubImportService,
) -> ResponseModel[SkillGitHubImportOut]:
    data = await service.get_import(workspace_id=ctx.workspace_id, import_id=import_id)
    return ApiResponse.success(data=data)


@router.post(
    "/packages/{package_id}/refreshes",
    response_model=ResponseModel[SkillGitHubImportAcceptedOut],
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[require_workspace_permission("system:settings:manage")],
    summary="Queue an immutable public GitHub Skill refresh",
)
async def create_workspace_skill_github_refresh(
    package_id: PublicUUID,
    ctx: ReadContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: GitHubImportService,
) -> ResponseModel[SkillGitHubImportAcceptedOut]:
    data = await service.create_refresh(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        package_id=package_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/catalog",
    response_model=ResponseModel[SkillCursorPage[OfficialSkillCatalogItemOut]],
    dependencies=[require_workspace_permission("system:settings:read")],
    summary="List Arclayer-verified Skill catalog packages",
)
async def list_official_skill_catalog(
    ctx: ReadContext,
    service: OfficialCatalogService,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    cursor: Annotated[PublicUUID | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=128)] = None,
) -> ResponseModel[SkillCursorPage[OfficialSkillCatalogItemOut]]:
    data = await service.list_catalog(
        workspace_id=ctx.workspace_id,
        limit=limit,
        cursor=cursor,
        query=q,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/catalog/{package_id}",
    response_model=ResponseModel[OfficialSkillCatalogDetailOut],
    dependencies=[require_workspace_permission("system:settings:read")],
    summary="Get one Arclayer-verified Skill catalog package",
)
async def get_official_skill_catalog_package(
    package_id: PublicUUID,
    ctx: ReadContext,
    service: OfficialCatalogService,
) -> ResponseModel[OfficialSkillCatalogDetailOut]:
    data = await service.get_catalog_package(
        workspace_id=ctx.workspace_id,
        package_id=package_id,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/packages",
    response_model=ResponseModel[SkillCursorPage[SkillPackageSummaryOut]],
    dependencies=[require_workspace_permission("system:settings:read")],
    summary="List workspace-authored Skill packages",
)
async def list_workspace_skill_packages(
    ctx: ReadContext,
    service: SkillsService,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    cursor: Annotated[PublicUUID | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=128)] = None,
    status_filter: Annotated[SkillPackageStatus | None, Query(alias="status")] = SkillPackageStatus.ACTIVE,
) -> ResponseModel[SkillCursorPage[SkillPackageSummaryOut]]:
    data = await service.list_packages(
        workspace_id=ctx.workspace_id,
        limit=limit,
        cursor=cursor,
        query=q,
        status=str(status_filter) if status_filter is not None else None,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/packages",
    response_model=ResponseModel[SkillPackageCreateOut],
    status_code=status.HTTP_201_CREATED,
    dependencies=[require_workspace_permission("system:settings:manage")],
    summary="Create an inline Workspace Skill package and first immutable version",
)
async def create_workspace_skill_package(
    payload: SkillPackageCreateRequest,
    ctx: ReadContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: SkillsService,
) -> ResponseModel[SkillPackageCreateOut]:
    data = await service.create_package(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/packages/{package_id}",
    response_model=ResponseModel[SkillPackageDetailOut],
    dependencies=[require_workspace_permission("system:settings:read")],
    summary="Get a workspace-authored Skill package",
)
async def get_workspace_skill_package(
    package_id: PublicUUID,
    ctx: ReadContext,
    service: SkillsService,
) -> ResponseModel[SkillPackageDetailOut]:
    data = await service.get_package(workspace_id=ctx.workspace_id, package_id=package_id)
    return ApiResponse.success(data=data)


@router.get(
    "/packages/{package_id}/impact",
    response_model=ResponseModel[SkillPackageImpactOut],
    dependencies=[require_workspace_permission("system:settings:read")],
    summary="Get Workspace Skill package archive impact",
)
async def get_workspace_skill_package_impact(
    package_id: PublicUUID,
    ctx: ReadContext,
    service: PackageImpactService,
) -> ResponseModel[SkillPackageImpactOut]:
    data = await service.get_package_impact(
        workspace_id=ctx.workspace_id,
        package_id=package_id,
    )
    return ApiResponse.success(data=data)


@router.delete(
    "/packages/{package_id}",
    response_model=ResponseModel[SkillPackageArchiveOut],
    dependencies=[require_workspace_permission("system:settings:manage")],
    summary="Archive a Workspace Skill package after impact review",
)
async def archive_workspace_skill_package(
    package_id: PublicUUID,
    ctx: ReadContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: PackageImpactService,
    expected_revision: Annotated[int, Query(alias="expectedRevision", ge=1)],
) -> ResponseModel[SkillPackageArchiveOut]:
    data = await service.archive_package(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        package_id=package_id,
        actor_user_id=actor_user_id,
        expected_revision=expected_revision,
        idempotency_key=idempotency_key,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/packages/{package_id}/versions",
    response_model=ResponseModel[SkillCursorPage[SkillVersionSummaryOut]],
    dependencies=[require_workspace_permission("system:settings:read")],
    summary="List immutable Workspace Skill versions",
)
async def list_workspace_skill_versions(
    package_id: PublicUUID,
    ctx: ReadContext,
    service: SkillsService,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    cursor: Annotated[PublicUUID | None, Query()] = None,
) -> ResponseModel[SkillCursorPage[SkillVersionSummaryOut]]:
    data = await service.list_versions(
        workspace_id=ctx.workspace_id,
        package_id=package_id,
        limit=limit,
        cursor=cursor,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/packages/{package_id}/versions",
    response_model=ResponseModel[SkillVersionDetailOut],
    status_code=status.HTTP_201_CREATED,
    dependencies=[require_workspace_permission("system:settings:manage")],
    summary="Create an immutable inline Workspace Skill version candidate",
)
async def create_workspace_skill_version(
    package_id: PublicUUID,
    payload: SkillVersionCreateRequest,
    ctx: ReadContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: SkillsService,
) -> ResponseModel[SkillVersionDetailOut]:
    data = await service.create_version(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        package_id=package_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/packages/{package_id}/versions/{version_id}",
    response_model=ResponseModel[SkillVersionDetailOut],
    dependencies=[require_workspace_permission("system:settings:read")],
    summary="Get an immutable Workspace Skill version",
)
async def get_workspace_skill_version(
    package_id: PublicUUID,
    version_id: PublicUUID,
    ctx: ReadContext,
    service: SkillsService,
) -> ResponseModel[SkillVersionDetailOut]:
    data = await service.get_version(
        workspace_id=ctx.workspace_id,
        package_id=package_id,
        version_id=version_id,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/packages/{package_id}/versions/{version_id}/validations",
    response_model=ResponseModel[SkillValidationResultOut],
    status_code=status.HTTP_201_CREATED,
    dependencies=[require_workspace_permission("system:settings:manage")],
    summary="Validate an immutable Workspace Skill version",
)
async def validate_workspace_skill_version(
    package_id: PublicUUID,
    version_id: PublicUUID,
    payload: SkillValidationCreateRequest,
    ctx: ReadContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: LifecycleService,
) -> ResponseModel[SkillValidationResultOut]:
    data = await service.create_validation(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        package_id=package_id,
        version_id=version_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/packages/{package_id}/versions/{version_id}/validation-results",
    response_model=ResponseModel[tuple[SkillValidationResultOut, ...]],
    dependencies=[require_workspace_permission("system:settings:read")],
    summary="List immutable Workspace Skill validation results",
)
async def list_workspace_skill_validation_results(
    package_id: PublicUUID,
    version_id: PublicUUID,
    ctx: ReadContext,
    service: LifecycleService,
) -> ResponseModel[tuple[SkillValidationResultOut, ...]]:
    data = await service.list_validations(
        workspace_id=ctx.workspace_id,
        package_id=package_id,
        version_id=version_id,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/installations",
    response_model=ResponseModel[SkillCursorPage[SkillInstallationOut]],
    dependencies=[require_workspace_permission("system:settings:read")],
    summary="List exact Workspace Skill installations",
)
async def list_workspace_skill_installations(
    ctx: ReadContext,
    service: LifecycleService,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    cursor: Annotated[PublicUUID | None, Query()] = None,
    status_filter: Annotated[SkillInstallationStatus | None, Query(alias="status")] = None,
) -> ResponseModel[SkillCursorPage[SkillInstallationOut]]:
    data = await service.list_installations(
        workspace_id=ctx.workspace_id,
        limit=limit,
        cursor=cursor,
        status=str(status_filter) if status_filter is not None else None,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/installations",
    response_model=ResponseModel[SkillInstallationOut],
    status_code=status.HTTP_201_CREATED,
    dependencies=[require_workspace_permission("system:settings:manage")],
    summary="Install one exact validated Workspace Skill version",
)
async def create_workspace_skill_installation(
    payload: SkillInstallationCreateRequest,
    ctx: ReadContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: LifecycleService,
) -> ResponseModel[SkillInstallationOut]:
    data = await service.create_installation(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/installations/{installation_id}",
    response_model=ResponseModel[SkillInstallationOut],
    dependencies=[require_workspace_permission("system:settings:read")],
    summary="Get an exact Workspace Skill installation",
)
async def get_workspace_skill_installation(
    installation_id: PublicUUID,
    ctx: ReadContext,
    service: LifecycleService,
) -> ResponseModel[SkillInstallationOut]:
    data = await service.get_installation(
        workspace_id=ctx.workspace_id,
        installation_id=installation_id,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/installations/{installation_id}/impact",
    response_model=ResponseModel[SkillInstallationImpactOut],
    dependencies=[require_workspace_permission("system:settings:read")],
    summary="Get Agent and retained Run impact for one Skill installation",
)
async def get_workspace_skill_installation_impact(
    installation_id: PublicUUID,
    ctx: ReadContext,
    service: ImpactService,
) -> ResponseModel[SkillInstallationImpactOut]:
    data = await service.get_installation_impact(
        workspace_id=ctx.workspace_id,
        installation_id=installation_id,
    )
    return ApiResponse.success(data=data)


@router.delete(
    "/installations/{installation_id}",
    response_model=ResponseModel[SkillInstallationRemovalOut],
    dependencies=[require_workspace_permission("system:settings:manage")],
    summary="Uninstall a Workspace Skill after fail-closed impact review",
)
async def remove_workspace_skill_installation(
    installation_id: PublicUUID,
    ctx: ReadContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: ImpactService,
    expected_revision: Annotated[int, Query(alias="expectedRevision", ge=1)],
) -> ResponseModel[SkillInstallationRemovalOut]:
    data = await service.remove_installation(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        installation_id=installation_id,
        actor_user_id=actor_user_id,
        expected_revision=expected_revision,
        idempotency_key=idempotency_key,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/installations/{installation_id}/update-previews",
    response_model=ResponseModel[SkillUpdatePreviewOut],
    status_code=status.HTTP_201_CREATED,
    dependencies=[require_workspace_permission("system:settings:manage")],
    summary="Create an exact-version Workspace Skill update review",
)
async def create_workspace_skill_update_preview(
    installation_id: PublicUUID,
    payload: SkillUpdatePreviewCreateRequest,
    ctx: ReadContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: UpdateService,
) -> ResponseModel[SkillUpdatePreviewOut]:
    data = await service.create_preview(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        installation_id=installation_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/installations/{installation_id}/updates",
    response_model=ResponseModel[SkillInstallationRepinOut],
    dependencies=[require_workspace_permission("system:settings:manage")],
    summary="Accept a reviewed Workspace Skill update and atomically repin",
)
async def repin_workspace_skill_installation(
    installation_id: PublicUUID,
    payload: SkillInstallationRepinRequest,
    ctx: ReadContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: UpdateService,
) -> ResponseModel[SkillInstallationRepinOut]:
    data = await service.repin_installation(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        installation_id=installation_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.patch(
    "/installations/{installation_id}",
    response_model=ResponseModel[SkillInstallationOut],
    dependencies=[require_workspace_permission("system:settings:manage")],
    summary="Enable or disable a Workspace Skill installation",
)
async def update_workspace_skill_installation(
    installation_id: PublicUUID,
    payload: SkillInstallationUpdateRequest,
    ctx: ReadContext,
    actor_user_id: ActorUserId,
    service: LifecycleService,
) -> ResponseModel[SkillInstallationOut]:
    data = await service.update_installation(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        installation_id=installation_id,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    return ApiResponse.success(data=data)
