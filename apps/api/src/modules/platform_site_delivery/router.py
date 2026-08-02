from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from src.common.utils.public_ids import PublicIdDecodeError, decode_public_id
from src.config import Settings, get_settings
from src.core.exceptions import BadRequest
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.models.hosting.commercial_access import HostingDeliveryOperationTargetType
from src.modules.platform_identity.http import (
    get_current_platform_session,
    get_platform_identity_repository,
    require_platform_permission,
)
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.repository import PlatformIdentityRepository
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from src.modules.platform_identity.sessions import ensure_platform_permission
from src.modules.platform_site_delivery.dossier_service import PlatformSiteDeliveryDossierService
from src.modules.platform_site_delivery.operation_repository import HostingDeliveryOperationRepository
from src.modules.platform_site_delivery.policy_service import PlatformSiteDeliveryPolicyService
from src.modules.platform_site_delivery.schema import (
    PlatformDeliveryContinuityPolicyOut,
    PlatformDeliveryDomainDossierOut,
    PlatformDeliveryDomainOut,
    PlatformDeliveryDomainPage,
    PlatformDeliveryIssueDossierOut,
    PlatformDeliveryIssueListQuery,
    PlatformDeliveryIssueOut,
    PlatformDeliveryIssuePage,
    PlatformDeliveryOperationOut,
    PlatformDeliveryOperationPage,
    PlatformDeliveryOperationRequestIn,
    PlatformDeliveryPolicyApplyIn,
    PlatformDeliveryPolicyApplyOut,
    PlatformDeliveryPolicyPreviewIn,
    PlatformDeliveryPolicyPreviewOut,
    PlatformDeliveryRuleOut,
    PlatformDeliveryRulePage,
    PlatformDeliveryStorageDossierOut,
    PlatformDeliveryStorageOut,
    PlatformDeliveryStoragePage,
)
from src.modules.platform_site_delivery.service import PlatformSiteDeliveryService

router = APIRouter(tags=["platform.site-delivery"])


def get_hosting_delivery_operation_repository() -> HostingDeliveryOperationRepository:
    return HostingDeliveryOperationRepository()


def get_platform_site_delivery_service(
    settings: Settings = Depends(get_settings),
    operations: HostingDeliveryOperationRepository = Depends(get_hosting_delivery_operation_repository),
) -> PlatformSiteDeliveryService:
    return PlatformSiteDeliveryService(settings=settings, operations=operations)


def get_platform_site_delivery_dossier_service(
    settings: Settings = Depends(get_settings),
    operations: HostingDeliveryOperationRepository = Depends(get_hosting_delivery_operation_repository),
) -> PlatformSiteDeliveryDossierService:
    return PlatformSiteDeliveryDossierService(settings=settings, operations=operations)


def get_platform_site_delivery_policy_service(
    settings: Settings = Depends(get_settings),
) -> PlatformSiteDeliveryPolicyService:
    return PlatformSiteDeliveryPolicyService(settings=settings)


def decode_platform_delivery_id(value: str):
    try:
        return decode_public_id(value)
    except PublicIdDecodeError as exc:
        raise BadRequest(error="INVALID_PLATFORM_SITE_DELIVERY_ID") from exc


@router.get(
    "/issues",
    response_model=ResponseModel[PageData[PlatformDeliveryIssueOut]],
    response_model_exclude_none=True,
    summary="List delivery issues",
    dependencies=[require_platform_permission(PlatformPermissionCode.SITE_DELIVERY_READ)],
)
async def list_platform_delivery_issues(
    query: Annotated[PlatformDeliveryIssueListQuery, Depends()],
    params: Annotated[PageParams, Depends(get_page_params)],
    service: Annotated[PlatformSiteDeliveryService, Depends(get_platform_site_delivery_service)],
) -> ResponseModel[PlatformDeliveryIssuePage]:
    return ApiResponse.success(data=await service.list_issues(params=params, query=query))


@router.get(
    "/issues/{issue_id}",
    response_model=ResponseModel[PlatformDeliveryIssueDossierOut],
    response_model_exclude_none=True,
    summary="Read a source-backed delivery issue dossier",
    dependencies=[require_platform_permission(PlatformPermissionCode.SITE_DELIVERY_READ)],
)
async def get_platform_delivery_issue_dossier(
    issue_id: str,
    service: Annotated[PlatformSiteDeliveryDossierService, Depends(get_platform_site_delivery_dossier_service)],
) -> ResponseModel[PlatformDeliveryIssueDossierOut]:
    return ApiResponse.success(data=await service.get_issue(issue_id=decode_platform_delivery_id(issue_id)))


@router.get(
    "/issues/{issue_id}/operations",
    response_model=ResponseModel[PageData[PlatformDeliveryOperationOut]],
    response_model_exclude_none=True,
    summary="List durable recovery operations for one delivery issue",
    dependencies=[require_platform_permission(PlatformPermissionCode.SITE_DELIVERY_READ)],
)
async def list_platform_delivery_issue_operations(
    issue_id: str,
    params: Annotated[PageParams, Depends(get_page_params)],
    service: Annotated[PlatformSiteDeliveryDossierService, Depends(get_platform_site_delivery_dossier_service)],
) -> ResponseModel[PlatformDeliveryOperationPage]:
    decoded_issue_id = decode_platform_delivery_id(issue_id)
    dossier = await service.get_issue(issue_id=decoded_issue_id)
    target_type = (
        HostingDeliveryOperationTargetType.PUBLISH_JOB
        if dossier.kind == "publish_job"
        else HostingDeliveryOperationTargetType.HOSTING_CONTINUITY
    )
    return ApiResponse.success(
        data=await service.list_operations(target_type=target_type, target_id=decoded_issue_id, params=params)
    )


@router.get(
    "/domains",
    response_model=ResponseModel[PageData[PlatformDeliveryDomainOut]],
    response_model_exclude_none=True,
    summary="List domain and certificate readiness",
    dependencies=[require_platform_permission(PlatformPermissionCode.SITE_DELIVERY_READ)],
)
async def list_platform_delivery_domains(
    params: Annotated[PageParams, Depends(get_page_params)],
    service: Annotated[PlatformSiteDeliveryService, Depends(get_platform_site_delivery_service)],
) -> ResponseModel[PlatformDeliveryDomainPage]:
    return ApiResponse.success(data=await service.list_domains(params=params))


@router.get(
    "/domains/{binding_id}",
    response_model=ResponseModel[PlatformDeliveryDomainDossierOut],
    response_model_exclude_none=True,
    summary="Read a source-backed domain dossier",
    dependencies=[require_platform_permission(PlatformPermissionCode.SITE_DELIVERY_READ)],
)
async def get_platform_delivery_domain_dossier(
    binding_id: str,
    service: Annotated[PlatformSiteDeliveryDossierService, Depends(get_platform_site_delivery_dossier_service)],
) -> ResponseModel[PlatformDeliveryDomainDossierOut]:
    return ApiResponse.success(data=await service.get_domain(binding_id=decode_platform_delivery_id(binding_id)))


@router.get(
    "/domains/{binding_id}/operations",
    response_model=ResponseModel[PageData[PlatformDeliveryOperationOut]],
    response_model_exclude_none=True,
    summary="List durable recovery operations for one domain binding",
    dependencies=[require_platform_permission(PlatformPermissionCode.SITE_DELIVERY_READ)],
)
async def list_platform_delivery_domain_operations(
    binding_id: str,
    params: Annotated[PageParams, Depends(get_page_params)],
    service: Annotated[PlatformSiteDeliveryDossierService, Depends(get_platform_site_delivery_dossier_service)],
) -> ResponseModel[PlatformDeliveryOperationPage]:
    decoded_binding_id = decode_platform_delivery_id(binding_id)
    await service.get_domain(binding_id=decoded_binding_id)
    return ApiResponse.success(
        data=await service.list_operations(
            target_type=HostingDeliveryOperationTargetType.DOMAIN_BINDING,
            target_id=decoded_binding_id,
            params=params,
        )
    )


@router.get(
    "/storage",
    response_model=ResponseModel[PageData[PlatformDeliveryStorageOut]],
    response_model_exclude_none=True,
    summary="List file storage readiness",
    dependencies=[require_platform_permission(PlatformPermissionCode.SITE_STORAGE_READ)],
)
async def list_platform_delivery_storage(
    params: Annotated[PageParams, Depends(get_page_params)],
    service: Annotated[PlatformSiteDeliveryService, Depends(get_platform_site_delivery_service)],
) -> ResponseModel[PlatformDeliveryStoragePage]:
    return ApiResponse.success(data=await service.list_storage(params=params))


@router.get(
    "/storage/{profile_id}",
    response_model=ResponseModel[PlatformDeliveryStorageDossierOut],
    response_model_exclude_none=True,
    summary="Read a source-backed storage dossier",
    dependencies=[require_platform_permission(PlatformPermissionCode.SITE_STORAGE_READ)],
)
async def get_platform_delivery_storage_dossier(
    profile_id: str,
    service: Annotated[PlatformSiteDeliveryDossierService, Depends(get_platform_site_delivery_dossier_service)],
) -> ResponseModel[PlatformDeliveryStorageDossierOut]:
    return ApiResponse.success(data=await service.get_storage(profile_id=decode_platform_delivery_id(profile_id)))


@router.get(
    "/storage/{profile_id}/operations",
    response_model=ResponseModel[PageData[PlatformDeliveryOperationOut]],
    response_model_exclude_none=True,
    summary="List durable readiness operations for one storage profile",
    dependencies=[require_platform_permission(PlatformPermissionCode.SITE_STORAGE_READ)],
)
async def list_platform_delivery_storage_operations(
    profile_id: str,
    params: Annotated[PageParams, Depends(get_page_params)],
    service: Annotated[PlatformSiteDeliveryDossierService, Depends(get_platform_site_delivery_dossier_service)],
) -> ResponseModel[PlatformDeliveryOperationPage]:
    decoded_profile_id = decode_platform_delivery_id(profile_id)
    await service.get_storage(profile_id=decoded_profile_id)
    return ApiResponse.success(
        data=await service.list_operations(
            target_type=HostingDeliveryOperationTargetType.STORAGE_PROFILE,
            target_id=decoded_profile_id,
            params=params,
        )
    )


@router.get(
    "/operations/{operation_id}",
    response_model=ResponseModel[PlatformDeliveryOperationOut],
    response_model_exclude_none=True,
    summary="Read one durable Hosting recovery operation",
)
async def get_platform_delivery_operation(
    operation_id: str,
    principal: Annotated[PlatformSessionPrincipal, Depends(get_current_platform_session)],
    identity_repository: Annotated[PlatformIdentityRepository, Depends(get_platform_identity_repository)],
    service: Annotated[PlatformSiteDeliveryDossierService, Depends(get_platform_site_delivery_dossier_service)],
) -> ResponseModel[PlatformDeliveryOperationOut]:
    operation = await service.get_operation(operation_id=decode_platform_delivery_id(operation_id))
    await ensure_platform_permission(
        permission_code=_operation_read_permission(operation.target_type),
        principal=principal,
        repository=identity_repository,
    )
    return ApiResponse.success(data=operation)


@router.get(
    "/rules",
    response_model=ResponseModel[PageData[PlatformDeliveryRuleOut]],
    response_model_exclude_none=True,
    summary="List Hosting Continuity and delivery suspension rules",
    dependencies=[require_platform_permission(PlatformPermissionCode.SITE_DELIVERY_SETTINGS_READ)],
)
async def list_platform_delivery_rules(
    params: Annotated[PageParams, Depends(get_page_params)],
    service: Annotated[PlatformSiteDeliveryService, Depends(get_platform_site_delivery_service)],
) -> ResponseModel[PlatformDeliveryRulePage]:
    return ApiResponse.success(data=await service.list_rules(params=params))


@router.get(
    "/policies/continuity",
    response_model=ResponseModel[PlatformDeliveryContinuityPolicyOut],
    summary="Read the active Hosting Continuity policy revision",
    dependencies=[require_platform_permission(PlatformPermissionCode.SITE_DELIVERY_SETTINGS_READ)],
)
async def get_platform_delivery_continuity_policy(
    service: Annotated[PlatformSiteDeliveryPolicyService, Depends(get_platform_site_delivery_policy_service)],
) -> ResponseModel[PlatformDeliveryContinuityPolicyOut]:
    return ApiResponse.success(data=await service.get_current())


@router.post(
    "/issues/{issue_id}/retry",
    response_model=ResponseModel[PlatformDeliveryOperationOut],
    summary="Retry an eligible delivery issue through its owning source",
)
async def retry_platform_delivery_issue(
    issue_id: str,
    payload: PlatformDeliveryOperationRequestIn,
    principal: Annotated[
        PlatformSessionPrincipal,
        require_platform_permission(PlatformPermissionCode.SITE_DELIVERY_MANAGE),
    ],
    service: Annotated[PlatformSiteDeliveryService, Depends(get_platform_site_delivery_service)],
) -> ResponseModel[PlatformDeliveryOperationOut]:
    return ApiResponse.success(
        data=await service.retry_issue(
            issue_id=decode_platform_delivery_id(issue_id),
            actor_user_id=principal.actor_id,
            payload=payload,
        )
    )


@router.post(
    "/issues/{issue_id}/reconcile",
    response_model=ResponseModel[PlatformDeliveryOperationOut],
    summary="Reconcile one Hosting continuity issue from canonical source facts",
)
async def reconcile_platform_delivery_issue(
    issue_id: str,
    payload: PlatformDeliveryOperationRequestIn,
    principal: Annotated[
        PlatformSessionPrincipal,
        require_platform_permission(PlatformPermissionCode.SITE_DELIVERY_MANAGE),
    ],
    service: Annotated[PlatformSiteDeliveryService, Depends(get_platform_site_delivery_service)],
) -> ResponseModel[PlatformDeliveryOperationOut]:
    return ApiResponse.success(
        data=await service.reconcile_issue(
            issue_id=decode_platform_delivery_id(issue_id),
            actor_user_id=principal.actor_id,
            payload=payload,
        )
    )


@router.post(
    "/issues/{issue_id}/restore",
    response_model=ResponseModel[PlatformDeliveryOperationOut],
    summary="Restore the preserved delivery target after its canonical recovery fact",
)
async def restore_platform_delivery_issue(
    issue_id: str,
    payload: PlatformDeliveryOperationRequestIn,
    principal: Annotated[
        PlatformSessionPrincipal,
        require_platform_permission(PlatformPermissionCode.SITE_DELIVERY_MANAGE),
    ],
    service: Annotated[PlatformSiteDeliveryService, Depends(get_platform_site_delivery_service)],
) -> ResponseModel[PlatformDeliveryOperationOut]:
    return ApiResponse.success(
        data=await service.restore_issue(
            issue_id=decode_platform_delivery_id(issue_id),
            actor_user_id=principal.actor_id,
            payload=payload,
        )
    )


@router.post(
    "/domains/{binding_id}/recover",
    response_model=ResponseModel[PlatformDeliveryOperationOut],
    summary="Verify custom-domain ownership through the Domains owner",
)
async def recover_platform_delivery_domain(
    binding_id: str,
    payload: PlatformDeliveryOperationRequestIn,
    principal: Annotated[
        PlatformSessionPrincipal,
        require_platform_permission(PlatformPermissionCode.SITE_DELIVERY_MANAGE),
    ],
    service: Annotated[PlatformSiteDeliveryService, Depends(get_platform_site_delivery_service)],
) -> ResponseModel[PlatformDeliveryOperationOut]:
    return ApiResponse.success(
        data=await service.recover_domain_ownership(
            binding_id=decode_platform_delivery_id(binding_id),
            actor_user_id=principal.actor_id,
            payload=payload,
        )
    )


@router.post(
    "/storage/{profile_id}/test",
    response_model=ResponseModel[PlatformDeliveryOperationOut],
    summary="Test Storage readiness through the Storage Profiles owner",
)
async def test_platform_delivery_storage(
    profile_id: str,
    payload: PlatformDeliveryOperationRequestIn,
    principal: Annotated[
        PlatformSessionPrincipal,
        require_platform_permission(PlatformPermissionCode.SITE_STORAGE_MANAGE),
    ],
    service: Annotated[PlatformSiteDeliveryService, Depends(get_platform_site_delivery_service)],
) -> ResponseModel[PlatformDeliveryOperationOut]:
    return ApiResponse.success(
        data=await service.test_storage_readiness(
            profile_id=decode_platform_delivery_id(profile_id),
            actor_user_id=principal.actor_id,
            payload=payload,
        )
    )


@router.post(
    "/policies/continuity/preview",
    response_model=ResponseModel[PlatformDeliveryPolicyPreviewOut],
    summary="Preview a revision-bound Hosting Continuity policy change",
    dependencies=[require_platform_permission(PlatformPermissionCode.SITE_DELIVERY_SETTINGS_MANAGE)],
)
async def preview_platform_delivery_policy(
    payload: PlatformDeliveryPolicyPreviewIn,
    service: Annotated[PlatformSiteDeliveryPolicyService, Depends(get_platform_site_delivery_policy_service)],
) -> ResponseModel[PlatformDeliveryPolicyPreviewOut]:
    return ApiResponse.success(data=await service.preview(payload=payload))


@router.post(
    "/policies/continuity/previews/{preview_id}/apply",
    response_model=ResponseModel[PlatformDeliveryPolicyApplyOut],
    summary="Apply a reviewed Hosting Continuity policy change",
)
async def apply_platform_delivery_policy(
    preview_id: str,
    payload: PlatformDeliveryPolicyApplyIn,
    principal: Annotated[
        PlatformSessionPrincipal,
        require_platform_permission(PlatformPermissionCode.SITE_DELIVERY_SETTINGS_MANAGE),
    ],
    service: Annotated[PlatformSiteDeliveryPolicyService, Depends(get_platform_site_delivery_policy_service)],
) -> ResponseModel[PlatformDeliveryPolicyApplyOut]:
    return ApiResponse.success(
        data=await service.apply(
            preview_id=decode_platform_delivery_id(preview_id),
            payload=payload,
            actor_user_id=principal.actor_id,
        )
    )


def _operation_read_permission(target_type: HostingDeliveryOperationTargetType) -> PlatformPermissionCode:
    if target_type is HostingDeliveryOperationTargetType.STORAGE_PROFILE:
        return PlatformPermissionCode.SITE_STORAGE_READ
    return PlatformPermissionCode.SITE_DELIVERY_READ
