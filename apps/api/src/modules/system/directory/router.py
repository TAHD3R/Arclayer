from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import require_super_admin
from src.modules.system.directory.schema import (
    DirectoryOrganizationListItemOut,
    DirectoryProjectListItemOut,
    DirectoryUserListItemOut,
    DirectoryWorkspaceListItemOut,
)
from src.modules.system.directory.service import SystemDirectoryService

router = APIRouter(
    tags=["internal.system.directory"],
    dependencies=[Depends(require_super_admin)],
)


def get_directory_service(settings: Settings = Depends(get_settings)) -> SystemDirectoryService:
    return SystemDirectoryService(settings)


@router.get(
    "/users",
    response_model=ResponseModel[PageData[DirectoryUserListItemOut]],
    summary="List users in the system directory",
)
async def list_users(
    service: SystemDirectoryService = Depends(get_directory_service),
    params: PageParams = Depends(get_page_params),
    q: str | None = Query(default=None, description="Search users by username, email, or display name."),
    ordering: str | None = Query(default=None, description="Ordering fields, for example -created_at or username."),
) -> ResponseModel[PageData[DirectoryUserListItemOut]]:
    page = await service.list_users(params=params, q=q, ordering=ordering)
    return ApiResponse.success(data=page)


@router.get(
    "/organizations",
    response_model=ResponseModel[PageData[DirectoryOrganizationListItemOut]],
    summary="List organizations in the system directory",
)
async def list_organizations(
    service: SystemDirectoryService = Depends(get_directory_service),
    params: PageParams = Depends(get_page_params),
    q: str | None = Query(default=None, description="Search organizations by name or slug."),
    ordering: str | None = Query(default=None, description="Ordering fields, for example -created_at or name."),
) -> ResponseModel[PageData[DirectoryOrganizationListItemOut]]:
    page = await service.list_organizations(params=params, q=q, ordering=ordering)
    return ApiResponse.success(data=page)


@router.get(
    "/workspaces",
    response_model=ResponseModel[PageData[DirectoryWorkspaceListItemOut]],
    summary="List workspaces in the system directory",
)
async def list_workspaces(
    service: SystemDirectoryService = Depends(get_directory_service),
    params: PageParams = Depends(get_page_params),
    q: str | None = Query(default=None, description="Search workspaces by name or description."),
    ordering: str | None = Query(default=None, description="Ordering fields, for example -created_at or name."),
) -> ResponseModel[PageData[DirectoryWorkspaceListItemOut]]:
    page = await service.list_workspaces(params=params, q=q, ordering=ordering)
    return ApiResponse.success(data=page)


@router.get(
    "/projects",
    response_model=ResponseModel[PageData[DirectoryProjectListItemOut]],
    summary="List projects in the system directory",
)
async def list_projects(
    service: SystemDirectoryService = Depends(get_directory_service),
    params: PageParams = Depends(get_page_params),
    q: str | None = Query(default=None, description="Search projects by name, slug, or description."),
    ordering: str | None = Query(default=None, description="Ordering fields, for example -created_at or name."),
) -> ResponseModel[PageData[DirectoryProjectListItemOut]]:
    page = await service.list_projects(params=params, q=q, ordering=ordering)
    return ApiResponse.success(data=page)
