from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Request

from src.common.constants.assets import ASSET_SCOPE_WORKSPACE
from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.exceptions import BadRequest
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import t
from src.modules.assets.admin.uploads.schema import (
    UploadAbortOut,
    UploadCompleteOut,
    UploadInitOut,
    UploadInitRequest,
    UploadPartCommitRequest,
    UploadPartPresignOut,
    UploadPolicyOut,
    UploadStatusOut,
    build_upload_init_out,
)
from src.modules.assets.admin.uploads.service import UploadsService
from src.modules.assets.scope import AssetScope
from src.modules.auth.http.service import get_current_user
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import get_workspace_context

router = APIRouter(prefix="/workspaces/{workspace_id}", tags=["domain.workspaces.uploads"])

WORKSPACE_ICON_UPLOAD_PURPOSE = "workspace_icon"


def get_uploads_service(settings: Settings = Depends(get_settings)) -> UploadsService:
    return UploadsService(settings)


def _workspace_scope(ctx: WorkspaceContext) -> AssetScope:
    return AssetScope(type=ASSET_SCOPE_WORKSPACE, id=ctx.workspace_id)


def _ensure_workspace_icon_upload(payload: UploadInitRequest) -> None:
    if str(payload.purpose or "").strip() != WORKSPACE_ICON_UPLOAD_PURPOSE:
        raise BadRequest(
            message=t("errors", "BAD_REQUEST"),
            error="WORKSPACE_UPLOAD_PURPOSE_INVALID",
        )


@router.post(
    "/uploads/init",
    response_model=ResponseModel[UploadInitOut],
    summary="Initialize workspace icon upload session",
    dependencies=[require_workspace_permission("system:settings:manage")],
)
async def init_upload(
    payload: UploadInitRequest,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadInitOut]:
    """Initialize a workspace-scoped icon upload session."""
    _ensure_workspace_icon_upload(payload)
    session = await service.init_upload(
        scope=_workspace_scope(ctx),
        actor_user_id=user.id,
        purpose=payload.purpose,
        filename=payload.filename,
        mime=payload.mime,
        size_bytes=payload.size_bytes,
        expected_sha256=payload.expected_sha256,
        requested_visibility=payload.visibility,
        requested_indexable=payload.indexable,
        target_folder_id=payload.folder_id,
    )
    return ApiResponse.success(data=build_upload_init_out(session))


@router.get(
    "/uploads/policy",
    response_model=ResponseModel[UploadPolicyOut],
    summary="Get workspace upload policy",
    dependencies=[require_workspace_permission("system:settings:manage")],
)
async def get_upload_policy(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadPolicyOut]:
    _ = ctx
    return ApiResponse.success(data=await service.get_upload_policy(purpose=WORKSPACE_ICON_UPLOAD_PURPOSE))


@router.get(
    "/uploads/{upload_id}",
    response_model=ResponseModel[UploadStatusOut],
    summary="Get workspace upload status",
    dependencies=[require_workspace_permission("system:settings:manage")],
)
async def get_upload_status(
    upload_id: PublicUUID,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadStatusOut]:
    """Get workspace-scoped upload status."""
    session, missing = await service.get_status(upload_id=upload_id, scope=_workspace_scope(ctx))
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
    "/uploads/{upload_id}/parts/{part_number}",
    response_model=ResponseModel[None],
    summary="Upload a workspace asset part",
    dependencies=[require_workspace_permission("system:settings:manage")],
)
async def upload_part(
    request: Request,
    upload_id: PublicUUID,
    part_number: int,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
    content_length: int | None = Header(default=None, alias="Content-Length"),
) -> ResponseModel[None]:
    """Upload raw bytes for a workspace-scoped upload part."""
    data = await request.body()
    if content_length is not None and content_length != len(data):
        raise BadRequest(message=t("errors", "UPLOAD_BODY_INVALID"), error="UPLOAD_BODY_INVALID")

    await service.put_part(upload_id=upload_id, scope=_workspace_scope(ctx), part_number=part_number, data=data)
    return ApiResponse.success(data=None)


@router.post(
    "/uploads/{upload_id}/complete",
    response_model=ResponseModel[UploadCompleteOut],
    summary="Complete workspace upload",
    dependencies=[require_workspace_permission("system:settings:manage")],
)
async def complete_upload(
    upload_id: PublicUUID,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadCompleteOut]:
    """Complete a workspace-scoped upload."""
    asset_id = await service.complete(upload_id=upload_id, scope=_workspace_scope(ctx))
    return ApiResponse.success(data=UploadCompleteOut(asset_id=asset_id))


@router.post(
    "/uploads/{upload_id}/abort",
    response_model=ResponseModel[UploadAbortOut],
    summary="Abort workspace upload",
    dependencies=[require_workspace_permission("system:settings:manage")],
)
async def abort_upload(
    upload_id: PublicUUID,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadAbortOut]:
    """Abort a workspace-scoped upload."""
    session = await service.abort(upload_id=upload_id, scope=_workspace_scope(ctx))
    return ApiResponse.success(data=UploadAbortOut(upload_id=session.id, status=str(session.status)))


@router.post(
    "/uploads/{upload_id}/parts/{part_number}/presign",
    response_model=ResponseModel[UploadPartPresignOut],
    summary="Presign workspace upload part",
    dependencies=[require_workspace_permission("system:settings:manage")],
)
async def presign_upload_part(
    upload_id: PublicUUID,
    part_number: int,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadPartPresignOut]:
    """Create a presigned part URL for a workspace-scoped upload."""
    out = await service.presign_part(upload_id=upload_id, scope=_workspace_scope(ctx), part_number=part_number)
    return ApiResponse.success(data=out)


@router.post(
    "/uploads/{upload_id}/parts/{part_number}/commit",
    response_model=ResponseModel[None],
    summary="Commit workspace upload part",
    dependencies=[require_workspace_permission("system:settings:manage")],
)
async def commit_upload_part(
    upload_id: PublicUUID,
    part_number: int,
    payload: UploadPartCommitRequest,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[None]:
    """Commit a presigned workspace-scoped upload part."""
    await service.commit_part(
        upload_id=upload_id,
        scope=_workspace_scope(ctx),
        part_number=part_number,
        etag=payload.etag,
        size_bytes=payload.size_bytes,
    )
    return ApiResponse.success(data=None)
