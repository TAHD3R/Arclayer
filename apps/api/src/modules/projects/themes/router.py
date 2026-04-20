from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from starlette.responses import Response as StarletteResponse

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.workspaces.authz.http.service import ensure_workspace_permission_granted
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.themes.schema import (
    WorkspaceThemeImportIn,
    WorkspaceThemeListOut,
    WorkspaceThemeOut,
)
from src.modules.workspaces.themes.service import WorkspaceThemesService


def _workspace_context_from_project(ctx: ProjectRequestContext) -> WorkspaceContext:
    return WorkspaceContext(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        workspace_kind=ctx.workspace_kind,
        access_type=ctx.access_type,
        org_membership_id=ctx.org_membership_id,
        is_org_owner=ctx.is_org_owner,
        workspace_membership_id=ctx.workspace_membership_id,
        visible_only=ctx.visible_only,
        is_creator_admin=ctx.is_creator_admin,
    )


async def _ensure_project_theme_permission(
    permission: str,
    *,
    ctx: ProjectRequestContext,
    user_id: UUID,
) -> None:
    await ensure_workspace_permission_granted(
        permission,
        user_id=user_id,
        ctx=_workspace_context_from_project(ctx),
    )


def require_project_theme_permission(permission: str):
    async def _dep(
        ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
        user_id: Annotated[UUID, Depends(get_current_user_id)],
    ) -> None:
        await _ensure_project_theme_permission(permission, ctx=ctx, user_id=user_id)

    return Depends(_dep)


router = APIRouter(
    prefix="/projects/{project_id}/themes",
    tags=["domain.projects.themes"],
    dependencies=[require_project_theme_permission("system:themes:read")],
)


def get_project_themes_service(settings: Settings = Depends(get_settings)) -> WorkspaceThemesService:
    return WorkspaceThemesService(settings)


@router.get(
    "",
    response_model=ResponseModel[WorkspaceThemeListOut],
    summary="List project themes",
)
async def list_project_themes(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    service: Annotated[WorkspaceThemesService, Depends(get_project_themes_service)],
) -> ResponseModel[WorkspaceThemeListOut]:
    items = await service.list_themes(workspace_id=ctx.workspace_id)
    return ApiResponse.success(data=WorkspaceThemeListOut(items=items))


@router.post(
    "/import",
    response_model=ResponseModel[WorkspaceThemeOut],
    summary="Import a project theme package",
    dependencies=[require_project_theme_permission("system:themes:manage")],
)
async def import_project_theme(
    payload: WorkspaceThemeImportIn,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceThemesService, Depends(get_project_themes_service)],
) -> ResponseModel[WorkspaceThemeOut]:
    out = await service.import_theme_from_asset(
        workspace_id=ctx.workspace_id,
        actor_user_id=user_id,
        asset_id=payload.asset_id,
    )
    return ApiResponse.success(data=out)


@router.get(
    "/{theme_id}/{version}",
    response_model=ResponseModel[WorkspaceThemeOut],
    summary="Get project theme package detail",
)
async def get_project_theme(
    theme_id: str,
    version: str,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    service: Annotated[WorkspaceThemesService, Depends(get_project_themes_service)],
) -> ResponseModel[WorkspaceThemeOut]:
    out = await service.get_theme(workspace_id=ctx.workspace_id, theme_id=theme_id, version=version)
    return ApiResponse.success(data=out)


@router.delete(
    "/{theme_id}/{version}",
    response_model=ResponseModel[None],
    summary="Uninstall a project theme package",
    dependencies=[require_project_theme_permission("system:themes:manage")],
)
async def delete_project_theme(
    theme_id: str,
    version: str,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    service: Annotated[WorkspaceThemesService, Depends(get_project_themes_service)],
) -> ResponseModel[None]:
    await service.delete_theme(workspace_id=ctx.workspace_id, theme_id=theme_id, version=version)
    return ApiResponse.success(data=None)


@router.get(
    "/{theme_id}/{version}/download",
    include_in_schema=False,
    summary="Download project theme package",
)
async def download_project_theme(
    theme_id: str,
    version: str,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    service: Annotated[WorkspaceThemesService, Depends(get_project_themes_service)],
) -> StarletteResponse:
    return await service.download_theme_artifact(
        workspace_id=ctx.workspace_id,
        theme_id=theme_id,
        version=version,
    )
