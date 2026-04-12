from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.extensions.schema import CapabilityListOut, CapabilitySummaryOut, UIEmbedListOut
from src.modules.extensions.service import ExtensionsService
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access

router = APIRouter(prefix="/workspaces/{workspace_id}/extensions", tags=["Workspace: Extensions"])


def get_extensions_service(settings: Settings = Depends(get_settings)) -> ExtensionsService:
    return ExtensionsService(settings)


@router.get(
    "/capabilities",
    response_model=ResponseModel[CapabilityListOut],
    summary="List capabilities (extensions/integrations) visible in current workspace scope",
    dependencies=[require_workspace_permission("system:extensions:read")],
)
async def list_workspace_capabilities(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: ExtensionsService = Depends(get_extensions_service),
) -> ResponseModel[CapabilityListOut]:
    items = await service.list_workspace_capabilities(workspace_id=ctx.workspace_id)
    return ApiResponse.success(data=CapabilityListOut(items=items))


@router.post(
    "/capabilities/{capability_id}/enable",
    response_model=ResponseModel[CapabilitySummaryOut],
    summary="Enable a capability in current workspace",
    dependencies=[require_workspace_permission("system:extensions:manage")],
)
async def enable_workspace_capability(
    capability_id: str,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: ExtensionsService = Depends(get_extensions_service),
) -> ResponseModel[CapabilitySummaryOut]:
    out = await service.set_workspace_capability_enabled(
        workspace_id=ctx.workspace_id,
        capability_id=capability_id,
        enabled=True,
    )
    return ApiResponse.success(data=out)


@router.post(
    "/capabilities/{capability_id}/disable",
    response_model=ResponseModel[CapabilitySummaryOut],
    summary="Disable a capability in current workspace",
    dependencies=[require_workspace_permission("system:extensions:manage")],
)
async def disable_workspace_capability(
    capability_id: str,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: ExtensionsService = Depends(get_extensions_service),
) -> ResponseModel[CapabilitySummaryOut]:
    out = await service.set_workspace_capability_enabled(
        workspace_id=ctx.workspace_id,
        capability_id=capability_id,
        enabled=False,
    )
    return ApiResponse.success(data=out)


@router.get(
    "/ui-embeds",
    response_model=ResponseModel[UIEmbedListOut],
    summary="List UI embed descriptors (iframe) for enabled capabilities in current workspace",
    dependencies=[require_workspace_permission("system:extensions:read")],
)
async def list_workspace_ui_embeds(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    slot: str | None = Query(default=None, description="Host-defined slot id (optional)."),
    capability_id: str | None = Query(default=None, alias="capabilityId"),
    enabled_only: bool = Query(default=True, alias="enabledOnly"),
    service: ExtensionsService = Depends(get_extensions_service),
) -> ResponseModel[UIEmbedListOut]:
    items = await service.list_workspace_ui_embeds(
        workspace_id=ctx.workspace_id,
        slot=slot,
        capability_id=capability_id,
        enabled_only=enabled_only,
    )
    return ApiResponse.success(data=UIEmbedListOut(items=items))
