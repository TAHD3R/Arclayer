from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Request

from src.common.constants.assets import ASSET_SCOPE_PROJECT
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
    UploadStatusOut,
    build_upload_init_out,
)
from src.modules.assets.admin.uploads.service import UploadsService
from src.modules.assets.scope import AssetScope
from src.modules.auth.http.service import get_current_user
from src.modules.projects.http.router_helpers import require_project_permission
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.tenancy.router_helpers import resolve_project_tenant_context

router = APIRouter(prefix="/projects/{project_id}", tags=["domain.projects.assets.uploads"])


def get_uploads_service(
    settings: Settings = Depends(get_settings),
    ctx: ProjectRequestContext = Depends(get_project_context),
) -> UploadsService:
    return UploadsService(
        settings,
        resolve_project_tenant_context(project_id=ctx.project_id, runtime_id=ctx.runtime_id),
    )


def _project_scope(ctx: ProjectRequestContext) -> AssetScope:
    return AssetScope(type=ASSET_SCOPE_PROJECT, id=ctx.project_id)


@router.post(
    "/uploads/init",
    response_model=ResponseModel[UploadInitOut],
    summary="Initialize project upload session",
    dependencies=[require_project_permission("project:assets:manage")],
)
async def init_upload(
    payload: UploadInitRequest,
    ctx: ProjectRequestContext = Depends(get_project_context),
    user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadInitOut]:
    session = await service.init_upload(
        scope=_project_scope(ctx),
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
    "/uploads/{upload_id}",
    response_model=ResponseModel[UploadStatusOut],
    summary="Get project upload status",
    dependencies=[require_project_permission("project:assets:manage")],
)
async def get_upload_status(
    upload_id: PublicUUID,
    ctx: ProjectRequestContext = Depends(get_project_context),
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadStatusOut]:
    session, missing = await service.get_status(upload_id=upload_id, scope=_project_scope(ctx))
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
    summary="Upload a project asset part",
    dependencies=[require_project_permission("project:assets:manage")],
)
async def upload_part(
    request: Request,
    upload_id: PublicUUID,
    part_number: int,
    ctx: ProjectRequestContext = Depends(get_project_context),
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
    content_length: int | None = Header(default=None, alias="Content-Length"),
) -> ResponseModel[None]:
    data = await request.body()
    if content_length is not None and content_length != len(data):
        raise BadRequest(message=t("errors", "UPLOAD_BODY_INVALID"), error="UPLOAD_BODY_INVALID")

    await service.put_part(upload_id=upload_id, scope=_project_scope(ctx), part_number=part_number, data=data)
    return ApiResponse.success(data=None)


@router.post(
    "/uploads/{upload_id}/complete",
    response_model=ResponseModel[UploadCompleteOut],
    summary="Complete project upload",
    dependencies=[require_project_permission("project:assets:manage")],
)
async def complete_upload(
    upload_id: PublicUUID,
    ctx: ProjectRequestContext = Depends(get_project_context),
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadCompleteOut]:
    asset_id = await service.complete(upload_id=upload_id, scope=_project_scope(ctx))
    return ApiResponse.success(data=UploadCompleteOut(asset_id=asset_id))


@router.post(
    "/uploads/{upload_id}/abort",
    response_model=ResponseModel[UploadAbortOut],
    summary="Abort project upload",
    dependencies=[require_project_permission("project:assets:manage")],
)
async def abort_upload(
    upload_id: PublicUUID,
    ctx: ProjectRequestContext = Depends(get_project_context),
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadAbortOut]:
    session = await service.abort(upload_id=upload_id, scope=_project_scope(ctx))
    return ApiResponse.success(data=UploadAbortOut(upload_id=session.id, status=str(session.status)))


@router.post(
    "/uploads/{upload_id}/parts/{part_number}/presign",
    response_model=ResponseModel[UploadPartPresignOut],
    summary="Presign project upload part",
    dependencies=[require_project_permission("project:assets:manage")],
)
async def presign_upload_part(
    upload_id: PublicUUID,
    part_number: int,
    ctx: ProjectRequestContext = Depends(get_project_context),
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadPartPresignOut]:
    out = await service.presign_part(upload_id=upload_id, scope=_project_scope(ctx), part_number=part_number)
    return ApiResponse.success(data=out)


@router.post(
    "/uploads/{upload_id}/parts/{part_number}/commit",
    response_model=ResponseModel[None],
    summary="Commit project upload part",
    dependencies=[require_project_permission("project:assets:manage")],
)
async def commit_upload_part(
    upload_id: PublicUUID,
    part_number: int,
    payload: UploadPartCommitRequest,
    ctx: ProjectRequestContext = Depends(get_project_context),
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[None]:
    await service.commit_part(
        upload_id=upload_id,
        scope=_project_scope(ctx),
        part_number=part_number,
        etag=payload.etag,
        size_bytes=payload.size_bytes,
    )
    return ApiResponse.success(data=None)
