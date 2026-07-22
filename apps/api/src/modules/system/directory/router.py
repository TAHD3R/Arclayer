from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Query, Request

from src.common.constants.assets import ASSET_SCOPE_USER
from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.exceptions import BadRequest
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import t
from src.models.organization.user import User, UserStatus
from src.modules.assets.admin.uploads.schema import (
    UploadAbortOut,
    UploadCompleteOut,
    UploadInitOut,
    UploadInitRequest,
    UploadPartCommitRequest,
    UploadPartPresignOut,
    UploadStatusOut,
    build_upload_init_out,
)
from src.modules.assets.admin.uploads.service import UploadsService
from src.modules.assets.scope import AssetScope
from src.modules.auth.http.service import require_super_admin
from src.modules.system.directory.schema import (
    DirectoryDeleteRequest,
    DirectoryProjectDetailOut,
    DirectoryProjectListFilters,
    DirectoryProjectListItemOut,
    DirectoryProjectUpdateRequest,
    DirectoryUserDetailOut,
    DirectoryUserListFilters,
    DirectoryUserListItemOut,
    DirectoryUserResetPasswordRequest,
    DirectoryUserUpdateRequest,
    DirectoryWorkspaceDetailOut,
    DirectoryWorkspaceListFilters,
    DirectoryWorkspaceListItemOut,
    DirectoryWorkspaceUpdateRequest,
)
from src.modules.system.directory.service import SystemDirectoryService
from src.platform.cache.valkey import get_valkey

router = APIRouter(
    tags=["internal.system.directory"],
    dependencies=[Depends(require_super_admin)],
)


def get_directory_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> SystemDirectoryService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    return SystemDirectoryService(settings, valkey=valkey)


def get_uploads_service(settings: Settings = Depends(get_settings)) -> UploadsService:
    return UploadsService(settings)


async def require_directory_user_scope(
    user_id: PublicUUID,
    directory_service: SystemDirectoryService = Depends(get_directory_service),
) -> AssetScope:
    user = await directory_service.require_user(user_id=user_id)
    return AssetScope(type=ASSET_SCOPE_USER, id=user.id)


def _upload_init_out(session) -> UploadInitOut:
    return build_upload_init_out(session)


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
    status: UserStatus | None = Query(default=None, description="Filter by account status."),
    is_super_admin: bool | None = Query(default=None, description="Filter by super admin permission."),
    has_password: bool | None = Query(default=None, description="Filter by local password configuration."),
    two_factor_enabled: bool | None = Query(default=None, description="Filter by two-factor authentication."),
    oauth_provider: str | None = Query(default=None, description="Filter by OAuth linkage. Use any or none."),
) -> ResponseModel[PageData[DirectoryUserListItemOut]]:
    filters = DirectoryUserListFilters(
        status=status,
        is_super_admin=is_super_admin,
        has_password=has_password,
        two_factor_enabled=two_factor_enabled,
        oauth_provider=oauth_provider,
    )
    page = await service.list_users(params=params, q=q, ordering=ordering, filters=filters)
    return ApiResponse.success(data=page)


@router.get(
    "/users/{user_id}",
    response_model=ResponseModel[DirectoryUserDetailOut],
    summary="Get user detail in the system directory",
)
async def get_user_detail(
    user_id: PublicUUID,
    service: SystemDirectoryService = Depends(get_directory_service),
) -> ResponseModel[DirectoryUserDetailOut]:
    detail = await service.get_user_detail(user_id=user_id)
    return ApiResponse.success(data=detail)


@router.patch(
    "/users/{user_id}",
    response_model=ResponseModel[DirectoryUserDetailOut],
    summary="Update user account profile in the system directory",
)
async def update_user(
    user_id: PublicUUID,
    payload: DirectoryUserUpdateRequest,
    acting_user: User = Depends(require_super_admin),
    service: SystemDirectoryService = Depends(get_directory_service),
) -> ResponseModel[DirectoryUserDetailOut]:
    detail = await service.update_user(
        user_id=user_id,
        payload=payload,
        acting_user_id=acting_user.id,
    )
    return ApiResponse.success(data=detail)


@router.post(
    "/users/{user_id}/avatar/uploads/init",
    response_model=ResponseModel[UploadInitOut],
    summary="Initialize avatar upload for a directory user",
)
async def init_user_avatar_upload(
    payload: UploadInitRequest,
    user_scope: AssetScope = Depends(require_directory_user_scope),
    actor: User = Depends(require_super_admin),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadInitOut]:
    session = await service.init_upload(
        scope=user_scope,
        actor_user_id=actor.id,
        purpose="avatar",
        filename=payload.filename,
        mime=payload.mime,
        size_bytes=payload.size_bytes,
        expected_sha256=payload.expected_sha256,
        requested_visibility="public",
        requested_indexable=False,
        target_folder_id=None,
    )
    return ApiResponse.success(data=_upload_init_out(session))


@router.get(
    "/users/{user_id}/avatar/uploads/{upload_id}",
    response_model=ResponseModel[UploadStatusOut],
    summary="Get avatar upload status for a directory user",
)
async def get_user_avatar_upload_status(
    upload_id: PublicUUID,
    user_scope: AssetScope = Depends(require_directory_user_scope),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadStatusOut]:
    session, missing = await service.get_status(upload_id=upload_id, scope=user_scope)
    return ApiResponse.success(
        data=UploadStatusOut(
            upload_id=session.id,
            status=str(session.status),
            missing_parts=missing,
            uploaded_parts=(int(session.total_parts) - len(missing)),
            total_parts=int(session.total_parts),
        )
    )


@router.put(
    "/users/{user_id}/avatar/uploads/{upload_id}/parts/{part_number}",
    response_model=ResponseModel[None],
    summary="Upload avatar part for a directory user",
)
async def upload_user_avatar_part(
    request: Request,
    upload_id: PublicUUID,
    part_number: int,
    user_scope: AssetScope = Depends(require_directory_user_scope),
    service: UploadsService = Depends(get_uploads_service),
    content_length: int | None = Header(default=None, alias="Content-Length"),
) -> ResponseModel[None]:
    data = await request.body()
    if content_length is not None and content_length != len(data):
        raise BadRequest(message=t("errors", "UPLOAD_BODY_INVALID"), error="UPLOAD_BODY_INVALID")

    await service.put_part(upload_id=upload_id, scope=user_scope, part_number=part_number, data=data)
    return ApiResponse.success(data=None)


@router.post(
    "/users/{user_id}/avatar/uploads/{upload_id}/complete",
    response_model=ResponseModel[UploadCompleteOut],
    summary="Complete avatar upload for a directory user",
)
async def complete_user_avatar_upload(
    upload_id: PublicUUID,
    user_scope: AssetScope = Depends(require_directory_user_scope),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadCompleteOut]:
    asset_id = await service.complete(upload_id=upload_id, scope=user_scope)
    return ApiResponse.success(data=UploadCompleteOut(asset_id=asset_id))


@router.post(
    "/users/{user_id}/avatar/uploads/{upload_id}/abort",
    response_model=ResponseModel[UploadAbortOut],
    summary="Abort avatar upload for a directory user",
)
async def abort_user_avatar_upload(
    upload_id: PublicUUID,
    user_scope: AssetScope = Depends(require_directory_user_scope),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadAbortOut]:
    session = await service.abort(upload_id=upload_id, scope=user_scope)
    return ApiResponse.success(data=UploadAbortOut(upload_id=session.id, status=str(session.status)))


@router.post(
    "/users/{user_id}/avatar/uploads/{upload_id}/parts/{part_number}/presign",
    response_model=ResponseModel[UploadPartPresignOut],
    summary="Presign avatar upload part for a directory user",
)
async def presign_user_avatar_upload_part(
    upload_id: PublicUUID,
    part_number: int,
    user_scope: AssetScope = Depends(require_directory_user_scope),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadPartPresignOut]:
    out = await service.presign_part(upload_id=upload_id, scope=user_scope, part_number=part_number)
    return ApiResponse.success(data=out)


@router.post(
    "/users/{user_id}/avatar/uploads/{upload_id}/parts/{part_number}/commit",
    response_model=ResponseModel[None],
    summary="Commit avatar upload part for a directory user",
)
async def commit_user_avatar_upload_part(
    upload_id: PublicUUID,
    part_number: int,
    payload: UploadPartCommitRequest,
    user_scope: AssetScope = Depends(require_directory_user_scope),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[None]:
    await service.commit_part(
        upload_id=upload_id,
        scope=user_scope,
        part_number=part_number,
        etag=payload.etag,
        size_bytes=payload.size_bytes,
    )
    return ApiResponse.success(data=None)


@router.post(
    "/users/{user_id}/reset-password",
    response_model=ResponseModel[DirectoryUserDetailOut],
    summary="Reset user password in the system directory",
)
async def reset_user_password(
    user_id: PublicUUID,
    payload: DirectoryUserResetPasswordRequest,
    service: SystemDirectoryService = Depends(get_directory_service),
) -> ResponseModel[DirectoryUserDetailOut]:
    detail = await service.reset_user_password(user_id=user_id, payload=payload)
    return ApiResponse.success(data=detail)


@router.post(
    "/users/{user_id}/send-reset-password-email",
    response_model=ResponseModel[DirectoryUserDetailOut],
    summary="Send password reset email in the system directory",
)
async def send_user_reset_password_email(
    user_id: PublicUUID,
    service: SystemDirectoryService = Depends(get_directory_service),
) -> ResponseModel[DirectoryUserDetailOut]:
    detail = await service.send_reset_password_email(user_id=user_id)
    return ApiResponse.success(data=detail)


@router.post(
    "/users/{user_id}/revoke-sessions",
    response_model=ResponseModel[DirectoryUserDetailOut],
    summary="Revoke user login sessions in the system directory",
)
async def revoke_user_sessions(
    user_id: PublicUUID,
    service: SystemDirectoryService = Depends(get_directory_service),
) -> ResponseModel[DirectoryUserDetailOut]:
    detail = await service.revoke_user_sessions(user_id=user_id)
    return ApiResponse.success(data=detail)


@router.post(
    "/users/{user_id}/disable-two-factor",
    response_model=ResponseModel[DirectoryUserDetailOut],
    summary="Disable user two-factor authentication in the system directory",
)
async def disable_user_two_factor(
    user_id: PublicUUID,
    service: SystemDirectoryService = Depends(get_directory_service),
) -> ResponseModel[DirectoryUserDetailOut]:
    detail = await service.disable_user_two_factor(user_id=user_id)
    return ApiResponse.success(data=detail)


@router.delete(
    "/users/{user_id}/oauth-identities/{provider}",
    response_model=ResponseModel[DirectoryUserDetailOut],
    summary="Unlink a user's OAuth identity in the system directory",
)
async def unlink_user_oauth_identity(
    user_id: PublicUUID,
    provider: str,
    service: SystemDirectoryService = Depends(get_directory_service),
) -> ResponseModel[DirectoryUserDetailOut]:
    detail = await service.unlink_user_oauth_provider(user_id=user_id, provider=provider)
    return ApiResponse.success(data=detail)


@router.post(
    "/users/{user_id}/disable",
    response_model=ResponseModel[DirectoryUserDetailOut],
    summary="Disable user account in the system directory",
)
async def disable_user(
    user_id: PublicUUID,
    acting_user: User = Depends(require_super_admin),
    service: SystemDirectoryService = Depends(get_directory_service),
) -> ResponseModel[DirectoryUserDetailOut]:
    detail = await service.set_user_enabled(user_id=user_id, enabled=False, acting_user_id=acting_user.id)
    return ApiResponse.success(data=detail)


@router.post(
    "/users/{user_id}/enable",
    response_model=ResponseModel[DirectoryUserDetailOut],
    summary="Enable user account in the system directory",
)
async def enable_user(
    user_id: PublicUUID,
    acting_user: User = Depends(require_super_admin),
    service: SystemDirectoryService = Depends(get_directory_service),
) -> ResponseModel[DirectoryUserDetailOut]:
    detail = await service.set_user_enabled(user_id=user_id, enabled=True, acting_user_id=acting_user.id)
    return ApiResponse.success(data=detail)


@router.delete(
    "/users/{user_id}",
    response_model=ResponseModel[None],
    summary="Delete user account in the system directory",
)
async def delete_user_account(
    user_id: PublicUUID,
    acting_user: User = Depends(require_super_admin),
    service: SystemDirectoryService = Depends(get_directory_service),
) -> ResponseModel[None]:
    await service.delete_user_account(user_id=user_id, acting_user_id=acting_user.id)
    return ApiResponse.success(data=None)


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
    is_archived: bool | None = Query(default=None, description="Filter by archive state."),
    is_active: bool | None = Query(default=None, description="Filter by active state."),
) -> ResponseModel[PageData[DirectoryWorkspaceListItemOut]]:
    filters = DirectoryWorkspaceListFilters(
        is_archived=is_archived,
        is_active=is_active,
    )
    page = await service.list_workspaces(params=params, q=q, ordering=ordering, filters=filters)
    return ApiResponse.success(data=page)


@router.get(
    "/workspaces/{workspace_id}",
    response_model=ResponseModel[DirectoryWorkspaceDetailOut],
    summary="Get workspace detail in the system directory",
)
async def get_workspace_detail(
    workspace_id: PublicUUID,
    service: SystemDirectoryService = Depends(get_directory_service),
) -> ResponseModel[DirectoryWorkspaceDetailOut]:
    detail = await service.get_workspace_detail(workspace_id=workspace_id)
    return ApiResponse.success(data=detail)


@router.patch(
    "/workspaces/{workspace_id}",
    response_model=ResponseModel[DirectoryWorkspaceDetailOut],
    summary="Update workspace metadata in the system directory",
)
async def update_workspace(
    workspace_id: PublicUUID,
    payload: DirectoryWorkspaceUpdateRequest,
    acting_user: User = Depends(require_super_admin),
    service: SystemDirectoryService = Depends(get_directory_service),
) -> ResponseModel[DirectoryWorkspaceDetailOut]:
    detail = await service.update_workspace(
        workspace_id=workspace_id,
        payload=payload,
        actor_user_id=acting_user.id,
    )
    return ApiResponse.success(data=detail)


@router.post(
    "/workspaces/{workspace_id}/archive",
    response_model=ResponseModel[DirectoryWorkspaceDetailOut],
    summary="Archive workspace in the system directory",
)
async def archive_workspace(
    workspace_id: PublicUUID,
    acting_user: User = Depends(require_super_admin),
    service: SystemDirectoryService = Depends(get_directory_service),
) -> ResponseModel[DirectoryWorkspaceDetailOut]:
    detail = await service.archive_workspace(workspace_id=workspace_id, acting_user_id=acting_user.id)
    return ApiResponse.success(data=detail)


@router.post(
    "/workspaces/{workspace_id}/restore",
    response_model=ResponseModel[DirectoryWorkspaceDetailOut],
    summary="Restore workspace in the system directory",
)
async def restore_workspace(
    workspace_id: PublicUUID,
    acting_user: User = Depends(require_super_admin),
    service: SystemDirectoryService = Depends(get_directory_service),
) -> ResponseModel[DirectoryWorkspaceDetailOut]:
    detail = await service.restore_workspace(workspace_id=workspace_id, acting_user_id=acting_user.id)
    return ApiResponse.success(data=detail)


@router.post(
    "/workspaces/{workspace_id}/disable",
    response_model=ResponseModel[DirectoryWorkspaceDetailOut],
    summary="Disable workspace in the system directory",
)
async def disable_workspace(
    workspace_id: PublicUUID,
    service: SystemDirectoryService = Depends(get_directory_service),
) -> ResponseModel[DirectoryWorkspaceDetailOut]:
    detail = await service.set_workspace_enabled(workspace_id=workspace_id, enabled=False)
    return ApiResponse.success(data=detail)


@router.post(
    "/workspaces/{workspace_id}/enable",
    response_model=ResponseModel[DirectoryWorkspaceDetailOut],
    summary="Enable workspace in the system directory",
)
async def enable_workspace(
    workspace_id: PublicUUID,
    service: SystemDirectoryService = Depends(get_directory_service),
) -> ResponseModel[DirectoryWorkspaceDetailOut]:
    detail = await service.set_workspace_enabled(workspace_id=workspace_id, enabled=True)
    return ApiResponse.success(data=detail)


@router.delete(
    "/workspaces/{workspace_id}",
    response_model=ResponseModel[None],
    summary="Delete workspace in the system directory",
)
async def delete_workspace(
    workspace_id: PublicUUID,
    payload: DirectoryDeleteRequest,
    acting_user: User = Depends(require_super_admin),
    service: SystemDirectoryService = Depends(get_directory_service),
) -> ResponseModel[None]:
    await service.delete_workspace(
        workspace_id=workspace_id,
        payload=payload,
        acting_user_id=acting_user.id,
    )
    return ApiResponse.success(data=None)


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
    workspace_id: PublicUUID | None = Query(default=None, description="Filter by workspace id."),
    is_active: bool | None = Query(default=None, description="Filter by active state."),
) -> ResponseModel[PageData[DirectoryProjectListItemOut]]:
    filters = DirectoryProjectListFilters(
        workspace_id=workspace_id,
        is_active=is_active,
    )
    page = await service.list_projects(params=params, q=q, ordering=ordering, filters=filters)
    return ApiResponse.success(data=page)


@router.get(
    "/projects/{project_id}",
    response_model=ResponseModel[DirectoryProjectDetailOut],
    summary="Get project detail in the system directory",
)
async def get_project_detail(
    project_id: PublicUUID,
    service: SystemDirectoryService = Depends(get_directory_service),
) -> ResponseModel[DirectoryProjectDetailOut]:
    detail = await service.get_project_detail(project_id=project_id)
    return ApiResponse.success(data=detail)


@router.patch(
    "/projects/{project_id}",
    response_model=ResponseModel[DirectoryProjectDetailOut],
    summary="Update project metadata in the system directory",
)
async def update_project(
    project_id: PublicUUID,
    payload: DirectoryProjectUpdateRequest,
    acting_user: User = Depends(require_super_admin),
    service: SystemDirectoryService = Depends(get_directory_service),
) -> ResponseModel[DirectoryProjectDetailOut]:
    detail = await service.update_project(project_id=project_id, payload=payload, acting_user_id=acting_user.id)
    return ApiResponse.success(data=detail)


@router.post(
    "/projects/{project_id}/disable",
    response_model=ResponseModel[DirectoryProjectDetailOut],
    summary="Disable project in the system directory",
)
async def disable_project(
    project_id: PublicUUID,
    service: SystemDirectoryService = Depends(get_directory_service),
) -> ResponseModel[DirectoryProjectDetailOut]:
    detail = await service.set_project_enabled(project_id=project_id, enabled=False)
    return ApiResponse.success(data=detail)


@router.post(
    "/projects/{project_id}/enable",
    response_model=ResponseModel[DirectoryProjectDetailOut],
    summary="Enable project in the system directory",
)
async def enable_project(
    project_id: PublicUUID,
    service: SystemDirectoryService = Depends(get_directory_service),
) -> ResponseModel[DirectoryProjectDetailOut]:
    detail = await service.set_project_enabled(project_id=project_id, enabled=True)
    return ApiResponse.success(data=detail)


@router.delete(
    "/projects/{project_id}",
    response_model=ResponseModel[None],
    summary="Delete project in the system directory",
)
async def delete_project(
    project_id: PublicUUID,
    payload: DirectoryDeleteRequest,
    acting_user: User = Depends(require_super_admin),
    service: SystemDirectoryService = Depends(get_directory_service),
) -> ResponseModel[None]:
    await service.delete_project(
        project_id=project_id,
        payload=payload,
        acting_user_id=acting_user.id,
    )
    return ApiResponse.success(data=None)
