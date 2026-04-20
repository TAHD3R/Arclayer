from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from starlette.responses import Response as StarletteResponse

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access
from src.modules.workspaces.themes.schema import (
    WorkspaceThemeImportIn,
    WorkspaceThemeListOut,
    WorkspaceThemeOut,
)
from src.modules.workspaces.themes.service import WorkspaceThemesService

router = APIRouter(
    prefix="/_internal/workspaces/{workspace_id}",
    tags=["domain.workspaces.themes"],
    dependencies=[require_workspace_permission("system:themes:read")],
)


def get_themes_service(settings: Settings = Depends(get_settings)) -> WorkspaceThemesService:
    return WorkspaceThemesService(settings)


@router.get("/themes", response_model=ResponseModel[WorkspaceThemeListOut], summary="List installed themes")
async def list_themes(
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    _user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceThemesService, Depends(get_themes_service)],
) -> ResponseModel[WorkspaceThemeListOut]:
    """List installed themes."""
    items = await service.list_themes(workspace_id=ctx.workspace_id)
    return ApiResponse.success(data=WorkspaceThemeListOut(items=items))


@router.post(
    "/themes/import",
    response_model=ResponseModel[WorkspaceThemeOut],
    summary="Import a theme package (zip)",
    dependencies=[require_workspace_permission("system:themes:manage")],
)
async def import_theme(
    payload: WorkspaceThemeImportIn,
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceThemesService, Depends(get_themes_service)],
) -> ResponseModel[WorkspaceThemeOut]:
    """Import a theme package (zip)."""
    out = await service.import_theme_from_asset(
        workspace_id=ctx.workspace_id,
        actor_user_id=user_id,
        asset_id=payload.asset_id,
    )
    return ApiResponse.success(data=out)


@router.get(
    "/themes/{theme_id}/{version}",
    response_model=ResponseModel[WorkspaceThemeOut],
    summary="Get theme package detail",
)
async def get_theme(
    theme_id: str,
    version: str,
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    _user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceThemesService, Depends(get_themes_service)],
) -> ResponseModel[WorkspaceThemeOut]:
    """Get theme package detail."""
    out = await service.get_theme(workspace_id=ctx.workspace_id, theme_id=theme_id, version=version)
    return ApiResponse.success(data=out)


@router.delete(
    "/themes/{theme_id}/{version}",
    response_model=ResponseModel[None],
    summary="Uninstall a theme package",
    dependencies=[require_workspace_permission("system:themes:manage")],
)
async def delete_theme(
    theme_id: str,
    version: str,
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    _user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceThemesService, Depends(get_themes_service)],
) -> ResponseModel[None]:
    """Uninstall a theme package."""
    await service.delete_theme(workspace_id=ctx.workspace_id, theme_id=theme_id, version=version)
    return ApiResponse.success(data=None)


@router.get(
    "/themes/{theme_id}/{version}/download",
    include_in_schema=False,
    summary="Download theme package",
)
async def download_theme(
    theme_id: str,
    version: str,
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    _user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceThemesService, Depends(get_themes_service)],
) -> StarletteResponse:
    """Download theme package."""
    return await service.download_theme_artifact(workspace_id=ctx.workspace_id, theme_id=theme_id, version=version)
