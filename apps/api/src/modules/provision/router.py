from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.src.config import Settings, get_settings
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.auth.deps import get_current_user_id
from apps.api.src.modules.provision.schema import BootstrapStateOut, ProvisionRepairOut
from apps.api.src.modules.provision.service import TenantProvisioningService

router = APIRouter(tags=["Provisioning"])


def get_tenant_provisioning_service(settings: Settings = Depends(get_settings)) -> TenantProvisioningService:
    return TenantProvisioningService(settings)


@router.get(
    "/me/bootstrap-state",
    response_model=ResponseModel[BootstrapStateOut],
    summary="Get post-auth bootstrap readiness for current user",
)
async def get_my_bootstrap_state(
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[TenantProvisioningService, Depends(get_tenant_provisioning_service)],
) -> ResponseModel[BootstrapStateOut]:
    data = await service.get_bootstrap_state(user_id=user_id)
    return Response.success(data=data)


@router.post(
    "/provision/repair",
    response_model=ResponseModel[ProvisionRepairOut],
    summary="Repair current user bootstrap state (idempotent)",
)
async def repair_my_bootstrap_state(
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[TenantProvisioningService, Depends(get_tenant_provisioning_service)],
) -> ResponseModel[ProvisionRepairOut]:
    data = await service.repair_user_bootstrap(user_id=user_id)
    return Response.success(data=data)
