from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.exceptions import NotFound
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.commerce.catalog_schema import PlanIdentityCreate, PlanRevisionDraftCreate, PlanRevisionDraftUpdate
from src.modules.commerce.catalog_service import build_commerce_catalog_service
from src.modules.commerce.platform_read_service import build_platform_commerce_read_service
from src.modules.commerce.platform_schema import (
    PlatformCommercePlanCatalogOut,
    PlatformCommerceRevisionSummaryOut,
    PlatformCommerceSubscriptionListOut,
    PlatformCommerceSubscriptionQuery,
)
from src.modules.commerce.schema import WorkspaceCommerceOverviewOut
from src.modules.commerce.service import build_commerce_service
from src.modules.platform_identity.http import require_platform_permission
from src.modules.platform_identity.permissions import PlatformPermissionCode

router = APIRouter(tags=["internal.system.commerce"])


@router.get(
    "/plans",
    response_model=ResponseModel[PlatformCommercePlanCatalogOut],
    summary="List Plan identities and Revision history",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_READ)],
)
async def list_commerce_plans(
    include_inactive: bool = Query(default=False, alias="includeInactive"),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PlatformCommercePlanCatalogOut]:
    return ApiResponse.success(
        data=await build_platform_commerce_read_service().list_plan_catalog(include_inactive=include_inactive)
    )


@router.get(
    "/plans/{code}/revisions",
    response_model=ResponseModel[tuple[PlatformCommerceRevisionSummaryOut, ...]],
    summary="List one Plan's Draft and published Revisions",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_READ)],
)
async def list_commerce_plan_revisions(
    code: str,
    include_inactive: bool = Query(default=False, alias="includeInactive"),
) -> ResponseModel[tuple[PlatformCommerceRevisionSummaryOut, ...]]:
    revisions = await build_platform_commerce_read_service().list_plan_revisions(
        code=code,
        include_inactive=include_inactive,
    )
    if not revisions:
        raise NotFound(error="COMMERCE_CATALOG_PLAN_NOT_FOUND")
    return ApiResponse.success(data=revisions)


@router.get(
    "/subscriptions",
    response_model=ResponseModel[PlatformCommerceSubscriptionListOut],
    summary="List Workspace Subscriptions requiring attention",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_READ)],
)
async def list_platform_commerce_subscriptions(
    query: PlatformCommerceSubscriptionQuery = Depends(),
) -> ResponseModel[PlatformCommerceSubscriptionListOut]:
    return ApiResponse.success(data=await build_platform_commerce_read_service().list_subscriptions(query=query))


@router.post(
    "/plans",
    response_model=ResponseModel[dict[str, str]],
    summary="Create a stable Plan identity",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_CATALOG_MANAGE)],
)
async def create_commerce_plan(payload: PlanIdentityCreate) -> ResponseModel[dict[str, str]]:
    plan = await build_commerce_catalog_service().create_plan(request=payload)
    return ApiResponse.success(data={"id": str(plan.id), "code": plan.code})


@router.post(
    "/plan-revisions",
    response_model=ResponseModel[dict[str, str]],
    summary="Create a Draft Plan Revision",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_CATALOG_MANAGE)],
)
async def create_plan_revision(payload: PlanRevisionDraftCreate) -> ResponseModel[dict[str, str]]:
    revision = await build_commerce_catalog_service().create_draft(plan_id=payload.plan_id, terms=payload.terms)
    return ApiResponse.success(data={"id": str(revision.id), "planId": str(revision.plan_id)})


@router.put(
    "/plan-revisions/{revision_id}",
    response_model=ResponseModel[dict[str, str]],
    summary="Update a Draft Plan Revision",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_CATALOG_MANAGE)],
)
async def update_plan_revision(
    revision_id: PublicUUID, payload: PlanRevisionDraftUpdate, plan_id: PublicUUID
) -> ResponseModel[dict[str, str]]:
    revision = await build_commerce_catalog_service().update_draft(
        plan_id=plan_id, revision_id=revision_id, terms=payload.terms
    )
    return ApiResponse.success(data={"id": str(revision.id), "planId": str(revision.plan_id)})


@router.post(
    "/plan-revisions/{revision_id}/publish",
    response_model=ResponseModel[dict[str, str]],
    summary="Publish an immutable Plan Revision",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_CATALOG_MANAGE)],
)
async def publish_plan_revision(revision_id: PublicUUID, plan_id: PublicUUID) -> ResponseModel[dict[str, str]]:
    revision = await build_commerce_catalog_service().publish_draft(plan_id=plan_id, revision_id=revision_id)
    return ApiResponse.success(data={"id": str(revision.id), "planId": str(revision.plan_id)})


@router.get(
    "/workspaces/{workspace_id}/overview",
    response_model=ResponseModel[WorkspaceCommerceOverviewOut],
    summary="Get a revision-bound Workspace commercial overview",
    dependencies=[require_platform_permission(PlatformPermissionCode.COMMERCE_READ)],
)
async def get_workspace_commerce_overview(
    workspace_id: PublicUUID,
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceCommerceOverviewOut]:
    return ApiResponse.success(data=await build_commerce_service(settings).get_overview(workspace_id=workspace_id))
