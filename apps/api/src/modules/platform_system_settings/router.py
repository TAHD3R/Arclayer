from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.platform_identity.http import require_platform_permission
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from src.modules.platform_system_settings.schema import (
    PlatformLanguageCatalogDraftOut,
    PlatformLanguageCatalogDraftWrite,
    PlatformLanguageCatalogImpactOut,
    PlatformLanguageCatalogPublishRequest,
    PlatformRegionalSettingsWrite,
    PlatformSiteMetadataSettingsWrite,
    PlatformSystemDomainSettingsWrite,
    PlatformSystemIdentitySettingsWrite,
    PlatformSystemSettingsOut,
    PlatformSystemSettingsSectionWrite,
)
from src.modules.platform_system_settings.service import (
    PlatformSystemSettingsService,
    TortoisePlatformSystemSettingsRepository,
)

router = APIRouter(tags=["platform.system-settings"])


def get_platform_system_settings_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> PlatformSystemSettingsService:
    return PlatformSystemSettingsService(
        settings=settings,
        repository=TortoisePlatformSystemSettingsRepository(),
    )


@router.get(
    "",
    response_model=ResponseModel[PlatformSystemSettingsOut],
    summary="Read deployment-wide System Settings",
    dependencies=[require_platform_permission(PlatformPermissionCode.SYSTEM_SETTINGS_READ)],
)
async def get_platform_system_settings(
    service: Annotated[PlatformSystemSettingsService, Depends(get_platform_system_settings_service)],
) -> ResponseModel[PlatformSystemSettingsOut]:
    return ApiResponse.success(data=await service.get_settings())


@router.put(
    "/sections/{section}",
    response_model=ResponseModel[PlatformSystemSettingsOut],
    dependencies=[require_platform_permission(PlatformPermissionCode.SYSTEM_SETTINGS_MANAGE)],
)
async def update_platform_settings_section(
    section: str,
    payload: PlatformSystemSettingsSectionWrite,
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.SYSTEM_SETTINGS_MANAGE),
    service: PlatformSystemSettingsService = Depends(get_platform_system_settings_service),
) -> ResponseModel[PlatformSystemSettingsOut]:
    return ApiResponse.success(
        data=await service.update_generic_section(
            section=section,
            request=payload,
            actor_user_id=principal.actor_id,
        )
    )


@router.put(
    "/identity",
    response_model=ResponseModel[PlatformSystemSettingsOut],
    dependencies=[require_platform_permission(PlatformPermissionCode.SYSTEM_SETTINGS_MANAGE)],
)
async def update_platform_identity(
    payload: PlatformSystemIdentitySettingsWrite,
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.SYSTEM_SETTINGS_MANAGE),
    service: PlatformSystemSettingsService = Depends(get_platform_system_settings_service),
) -> ResponseModel[PlatformSystemSettingsOut]:
    values = payload.model_dump(mode="json", exclude={"expected_revision", "idempotency_key"})
    values["name"] = values.pop("instance_name")
    return ApiResponse.success(
        data=await service.update_section(
            section="site",
            values=values,
            expected_revision=payload.expected_revision,
            idempotency_key=payload.idempotency_key,
            actor_user_id=principal.actor_id,
        )
    )


@router.put(
    "/domains",
    response_model=ResponseModel[PlatformSystemSettingsOut],
    dependencies=[require_platform_permission(PlatformPermissionCode.SYSTEM_SETTINGS_MANAGE)],
)
async def update_platform_domains(
    payload: PlatformSystemDomainSettingsWrite,
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.SYSTEM_SETTINGS_MANAGE),
    service: PlatformSystemSettingsService = Depends(get_platform_system_settings_service),
) -> ResponseModel[PlatformSystemSettingsOut]:
    values = payload.model_dump(mode="json", exclude={"expected_revision", "idempotency_key"})
    values["platform_subdomain"] = values.pop("console_subdomain")
    values["base_domain"] = values.pop("primary_domain")
    return ApiResponse.success(
        data=await service.update_section(
            section="domains",
            values=values,
            expected_revision=payload.expected_revision,
            idempotency_key=payload.idempotency_key,
            actor_user_id=principal.actor_id,
        )
    )


@router.put(
    "/regional",
    response_model=ResponseModel[PlatformSystemSettingsOut],
    dependencies=[require_platform_permission(PlatformPermissionCode.SYSTEM_SETTINGS_MANAGE)],
)
async def update_platform_regional(
    payload: PlatformRegionalSettingsWrite,
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.SYSTEM_SETTINGS_MANAGE),
    service: PlatformSystemSettingsService = Depends(get_platform_system_settings_service),
) -> ResponseModel[PlatformSystemSettingsOut]:
    values = payload.model_dump(mode="json", exclude={"expected_revision", "idempotency_key"})
    return ApiResponse.success(
        data=await service.update_section(
            section="workspace_localization",
            values=values,
            expected_revision=payload.expected_revision,
            idempotency_key=payload.idempotency_key,
            actor_user_id=principal.actor_id,
        )
    )


@router.put(
    "/site-metadata",
    response_model=ResponseModel[PlatformSystemSettingsOut],
    dependencies=[require_platform_permission(PlatformPermissionCode.SYSTEM_SETTINGS_MANAGE)],
)
async def update_platform_site_metadata(
    payload: PlatformSiteMetadataSettingsWrite,
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.SYSTEM_SETTINGS_MANAGE),
    service: PlatformSystemSettingsService = Depends(get_platform_system_settings_service),
) -> ResponseModel[PlatformSystemSettingsOut]:
    values = payload.model_dump(mode="json", exclude={"expected_revision", "idempotency_key"})
    values["title_policy_v1"] = _title_policy_from_format(values.pop("title_format"))
    return ApiResponse.success(
        data=await service.update_section(
            section="seo",
            values=values,
            expected_revision=payload.expected_revision,
            idempotency_key=payload.idempotency_key,
            actor_user_id=principal.actor_id,
        )
    )


@router.post(
    "/languages/drafts",
    response_model=ResponseModel[PlatformLanguageCatalogDraftOut],
    dependencies=[require_platform_permission(PlatformPermissionCode.SYSTEM_SETTINGS_MANAGE)],
)
async def create_platform_language_draft(
    payload: PlatformLanguageCatalogDraftWrite,
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.SYSTEM_SETTINGS_MANAGE),
    service: PlatformSystemSettingsService = Depends(get_platform_system_settings_service),
) -> ResponseModel[PlatformLanguageCatalogDraftOut]:
    return ApiResponse.success(data=await service.create_language_draft(payload, actor_user_id=principal.actor_id))


@router.post(
    "/languages/drafts/{draft_revision}/impact",
    response_model=ResponseModel[PlatformLanguageCatalogImpactOut],
    dependencies=[require_platform_permission(PlatformPermissionCode.SYSTEM_SETTINGS_MANAGE)],
)
async def preview_platform_language_draft(
    draft_revision: int,
    service: PlatformSystemSettingsService = Depends(get_platform_system_settings_service),
) -> ResponseModel[PlatformLanguageCatalogImpactOut]:
    return ApiResponse.success(data=await service.preview_language_draft(draft_revision))


@router.post(
    "/languages/publish",
    response_model=ResponseModel[PlatformSystemSettingsOut],
    dependencies=[require_platform_permission(PlatformPermissionCode.SYSTEM_SETTINGS_MANAGE)],
)
async def publish_platform_language_draft(
    payload: PlatformLanguageCatalogPublishRequest,
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.SYSTEM_SETTINGS_MANAGE),
    service: PlatformSystemSettingsService = Depends(get_platform_system_settings_service),
) -> ResponseModel[PlatformSystemSettingsOut]:
    return ApiResponse.success(data=await service.publish_language_draft(payload, actor_user_id=principal.actor_id))


def _title_policy_from_format(value: object) -> dict[str, object]:
    rendered = value.strip() if isinstance(value, str) else ""
    if rendered == "Page title · Site name":
        parts = [
            {"kind": "token", "value": "pageTitle"},
            {"kind": "literal", "value": " · "},
            {"kind": "token", "value": "siteName"},
        ]
    else:
        parts = [{"kind": "literal", "value": rendered}]
    return {"parts": parts, "home_mode": "siteOnly", "dedupe": True}
