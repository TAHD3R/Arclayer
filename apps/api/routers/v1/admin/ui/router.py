from __future__ import annotations

from fastapi import APIRouter, Depends

from apps.api.core.exceptions import ServiceUnavailable
from apps.api.core.i18n import t
from apps.api.http.response import Response, ResponseModel
from apps.api.models.user import User
from apps.api.plugin.extension_points.admin_ui import get_admin_ui_context_provider
from apps.api.routers.v1.admin.ui.schema import AdminUIContext
from apps.api.routers.v1.auth.deps import get_current_user

router = APIRouter(tags=["Services: Frontend Context Service"])


@router.get("/context", response_model=ResponseModel[AdminUIContext])
async def get_admin_ui_context(
    user: User = Depends(get_current_user),
) -> ResponseModel[AdminUIContext]:
    provider = get_admin_ui_context_provider()
    if provider is None:
        raise ServiceUnavailable(
            message=t("errors", "ADMIN_UI_CONTEXT_UNAVAILABLE", default="后台 UI 上下文服务不可用"),
            error="ADMIN_UI_CONTEXT_UNAVAILABLE",
        )
    payload = await provider.get_context(user.id)
    return Response.success(data=AdminUIContext.model_validate(payload))
