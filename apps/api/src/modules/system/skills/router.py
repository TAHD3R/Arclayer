from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Header, Query, UploadFile, status

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.exceptions import BadRequest
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import t
from src.modules.analytics.audit import write_required_activity_event
from src.modules.platform_identity.http import require_platform_permission
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from src.modules.system.skills.catalog import (
    CAPABILITY_TAGS,
    DATA_CLASSES,
    EGRESS_DESTINATIONS,
    PERMISSIONS,
    REFERENCE_MIME_TYPES,
    SUPPORTED_TOOLS,
)
from src.modules.system.skills.schema import (
    PlatformSkillCapabilitiesOut,
    PlatformSkillGitHubImportRequest,
    PlatformSkillPackageCreateRequest,
    PlatformSkillPackageDetailOut,
    PlatformSkillPackageReplaceRequest,
    PlatformSkillPackageSummaryOut,
    PlatformSkillPackageUpdateRequest,
    PlatformSkillVersionCreateRequest,
    PlatformSkillVersionOut,
)
from src.modules.system.skills.service import PlatformSkillCatalogService
from src.modules.workspaces.skills.github_fetcher import PublicGitHubSkillFetcher
from src.modules.workspaces.skills.official_catalog_repository import OfficialSkillCatalogRepository
from src.modules.workspaces.skills.zip_import import (
    MAX_SKILL_ZIP_ARCHIVE_BYTES,
    SkillZipImportError,
    parse_workspace_skill_zip,
)

router = APIRouter(tags=["internal.system.skills"])


def get_platform_skill_catalog_service(
    settings: Settings = Depends(get_settings),
) -> PlatformSkillCatalogService:
    return PlatformSkillCatalogService(
        settings,
        repository=OfficialSkillCatalogRepository(),
        github_fetcher=PublicGitHubSkillFetcher(policy=settings.skill_github_fetch),
        activity_writer=write_required_activity_event,
    )


@router.get(
    "",
    response_model=ResponseModel[PageData[PlatformSkillPackageSummaryOut]],
    summary="List official Skill packages",
    dependencies=[require_platform_permission(PlatformPermissionCode.AI_SKILLS_READ)],
)
async def list_platform_skills(
    params: PageParams = Depends(get_page_params),
    query: Annotated[str | None, Query(alias="q", min_length=1, max_length=128)] = None,
    lifecycle_status: Annotated[Literal["active", "archived"] | None, Query(alias="status")] = None,
    service: PlatformSkillCatalogService = Depends(get_platform_skill_catalog_service),
) -> ResponseModel[PageData[PlatformSkillPackageSummaryOut]]:
    return ApiResponse.success(
        data=await service.list_packages(
            params=params,
            query=query,
            status=lifecycle_status,
        )
    )


@router.post(
    "",
    response_model=ResponseModel[PlatformSkillPackageDetailOut],
    status_code=status.HTTP_201_CREATED,
    summary="Create an official Skill package",
)
async def create_platform_skill(
    payload: PlatformSkillPackageCreateRequest,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)],
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.AI_SKILLS_MANAGE),
    service: PlatformSkillCatalogService = Depends(get_platform_skill_catalog_service),
) -> ResponseModel[PlatformSkillPackageDetailOut]:
    return ApiResponse.success(
        data=await service.create_package(
            payload=payload,
            idempotency_key=idempotency_key,
            actor_user_id=principal.actor_id,
        )
    )


@router.get(
    "/capabilities",
    response_model=ResponseModel[PlatformSkillCapabilitiesOut],
    summary="Get official Skill authoring capabilities",
    dependencies=[require_platform_permission(PlatformPermissionCode.AI_SKILLS_READ)],
)
async def get_platform_skill_capabilities() -> ResponseModel[PlatformSkillCapabilitiesOut]:
    return ApiResponse.success(
        data=PlatformSkillCapabilitiesOut(
            supported_tools=SUPPORTED_TOOLS,
            permissions=PERMISSIONS,
            egress_destinations=EGRESS_DESTINATIONS,
            data_classes=DATA_CLASSES,
            capability_tags=CAPABILITY_TAGS,
            reference_mime_types=REFERENCE_MIME_TYPES,
        )
    )


@router.post(
    "/imports/zip",
    response_model=ResponseModel[PlatformSkillPackageDetailOut],
    status_code=status.HTTP_201_CREATED,
    summary="Import an official Skill ZIP package",
)
async def import_platform_skill_zip(
    package: Annotated[UploadFile, File(json_schema_extra={"format": "binary"})],
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)],
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.AI_SKILLS_MANAGE),
    service: PlatformSkillCatalogService = Depends(get_platform_skill_catalog_service),
) -> ResponseModel[PlatformSkillPackageDetailOut]:
    filename = (package.filename or "").strip()
    if not filename.lower().endswith(".zip"):
        raise BadRequest(t("errors", "SKILL_ZIP_FORMAT_UNSUPPORTED"), error="SKILL_ZIP_FORMAT_UNSUPPORTED")
    try:
        archive = await package.read(MAX_SKILL_ZIP_ARCHIVE_BYTES + 1)
    finally:
        await package.close()
    try:
        parsed = parse_workspace_skill_zip(archive)
    except SkillZipImportError as exc:
        raise BadRequest(exc.safe_message, error=exc.code) from exc
    return ApiResponse.success(
        data=await service.import_zip_package(
            parsed=parsed,
            filename=filename,
            idempotency_key=idempotency_key,
            actor_user_id=principal.actor_id,
        )
    )


@router.post(
    "/imports",
    response_model=ResponseModel[PlatformSkillPackageDetailOut],
    status_code=status.HTTP_201_CREATED,
    summary="Import a public GitHub Skill as an official package",
)
async def import_platform_skill_github(
    payload: PlatformSkillGitHubImportRequest,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)],
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.AI_SKILLS_MANAGE),
    service: PlatformSkillCatalogService = Depends(get_platform_skill_catalog_service),
) -> ResponseModel[PlatformSkillPackageDetailOut]:
    return ApiResponse.success(
        data=await service.import_github_package(
            payload=payload,
            idempotency_key=idempotency_key,
            actor_user_id=principal.actor_id,
        )
    )


@router.get(
    "/{package_id}",
    response_model=ResponseModel[PlatformSkillPackageDetailOut],
    summary="Get an official Skill package",
    dependencies=[require_platform_permission(PlatformPermissionCode.AI_SKILLS_READ)],
)
async def get_platform_skill(
    package_id: PublicUUID,
    service: PlatformSkillCatalogService = Depends(get_platform_skill_catalog_service),
) -> ResponseModel[PlatformSkillPackageDetailOut]:
    return ApiResponse.success(data=await service.get_package(package_id=package_id))


@router.post(
    "/{package_id}/restore",
    response_model=ResponseModel[PlatformSkillPackageDetailOut],
    summary="Restore an archived official Skill package",
)
async def restore_platform_skill(
    package_id: PublicUUID,
    expected_revision: Annotated[int, Query(alias="expectedRevision", ge=1)],
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.AI_SKILLS_MANAGE),
    service: PlatformSkillCatalogService = Depends(get_platform_skill_catalog_service),
) -> ResponseModel[PlatformSkillPackageDetailOut]:
    return ApiResponse.success(
        data=await service.restore_package(
            package_id=package_id,
            expected_revision=expected_revision,
            actor_user_id=principal.actor_id,
        )
    )


@router.patch(
    "/{package_id}",
    response_model=ResponseModel[PlatformSkillPackageDetailOut],
    summary="Update official Skill package metadata",
)
async def update_platform_skill(
    package_id: PublicUUID,
    payload: PlatformSkillPackageUpdateRequest,
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.AI_SKILLS_MANAGE),
    service: PlatformSkillCatalogService = Depends(get_platform_skill_catalog_service),
) -> ResponseModel[PlatformSkillPackageDetailOut]:
    return ApiResponse.success(
        data=await service.update_package(
            package_id=package_id,
            payload=payload,
            actor_user_id=principal.actor_id,
        )
    )


@router.put(
    "/{package_id}",
    response_model=ResponseModel[PlatformSkillPackageDetailOut],
    summary="Save complete official Skill content",
)
async def replace_platform_skill(
    package_id: PublicUUID,
    payload: PlatformSkillPackageReplaceRequest,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)],
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.AI_SKILLS_MANAGE),
    service: PlatformSkillCatalogService = Depends(get_platform_skill_catalog_service),
) -> ResponseModel[PlatformSkillPackageDetailOut]:
    return ApiResponse.success(
        data=await service.replace_package(
            package_id=package_id,
            payload=payload,
            idempotency_key=idempotency_key,
            actor_user_id=principal.actor_id,
        )
    )


@router.post(
    "/{package_id}/versions",
    response_model=ResponseModel[PlatformSkillVersionOut],
    status_code=status.HTTP_201_CREATED,
    summary="Publish an immutable official Skill version",
)
async def create_platform_skill_version(
    package_id: PublicUUID,
    payload: PlatformSkillVersionCreateRequest,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)],
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.AI_SKILLS_MANAGE),
    service: PlatformSkillCatalogService = Depends(get_platform_skill_catalog_service),
) -> ResponseModel[PlatformSkillVersionOut]:
    return ApiResponse.success(
        data=await service.create_version(
            package_id=package_id,
            payload=payload,
            idempotency_key=idempotency_key,
            actor_user_id=principal.actor_id,
        )
    )


@router.delete(
    "/{package_id}",
    response_model=ResponseModel[PlatformSkillPackageDetailOut],
    summary="Archive an official Skill package",
)
async def archive_platform_skill(
    package_id: PublicUUID,
    expected_revision: Annotated[int, Query(alias="expectedRevision", ge=1)],
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.AI_SKILLS_MANAGE),
    service: PlatformSkillCatalogService = Depends(get_platform_skill_catalog_service),
) -> ResponseModel[PlatformSkillPackageDetailOut]:
    return ApiResponse.success(
        data=await service.archive_package(
            package_id=package_id,
            expected_revision=expected_revision,
            actor_user_id=principal.actor_id,
        )
    )
