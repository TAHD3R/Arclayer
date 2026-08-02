from __future__ import annotations

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.registration.service import get_public_register_policy
from src.modules.product_runtime.schema import (
    ProductInstanceSetupOut,
    ProductRuntimeCapabilities,
    ProductRuntimeOut,
)
from src.modules.system.setup.service import InstanceSetupService

router = APIRouter(prefix="/runtime", tags=["product.runtime"])


@router.get(
    "",
    response_model=ResponseModel[ProductRuntimeOut],
    summary="Get the public Product runtime state",
)
async def get_product_runtime(
    settings: Settings = Depends(get_settings),
) -> ResponseModel[ProductRuntimeOut]:
    """Expose only the non-sensitive bootstrap state required by the Product Application."""

    policy = await get_public_register_policy(settings)
    setup_state = await InstanceSetupService(settings).get_state()
    return ApiResponse.success(
        data=ProductRuntimeOut(
            capabilities=ProductRuntimeCapabilities(public_register_enabled=policy.enabled),
            instance_setup=ProductInstanceSetupOut(
                status=setup_state.status,
                repair_reason=setup_state.repair_reason,
            ),
        )
    )
