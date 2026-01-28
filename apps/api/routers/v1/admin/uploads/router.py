from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request

from apps.api.config import Settings, get_settings
from apps.api.core.exceptions import BadRequest
from apps.api.core.i18n import t
from apps.api.core.organization.deps import get_current_org_id
from apps.api.http.response import Response, ResponseModel
from apps.api.routers.v1.admin.uploads.schema import (
    UploadAbortOut,
    UploadCompleteOut,
    UploadInitOut,
    UploadInitRequest,
    UploadPartCommitRequest,
    UploadPartPresignOut,
    UploadStatusOut,
)
from apps.api.routers.v1.admin.uploads.service import UploadsService
from apps.api.routers.v1.auth.deps import get_current_user

router = APIRouter(tags=["Services: Uploads"])


def get_uploads_service(settings: Settings = Depends(get_settings)) -> UploadsService:
    return UploadsService(settings)


@router.post("/uploads/init", response_model=ResponseModel[UploadInitOut])
async def init_upload(
    payload: UploadInitRequest,
    org_id: UUID = Depends(get_current_org_id),
    user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadInitOut]:
    session = await service.init_upload(
        org_id=org_id,
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
    return Response.success(
        data=UploadInitOut(
            upload_id=session.id,
            chunk_size=session.chunk_size,
            total_parts=session.total_parts,
            expires_at=session.expires_at,
            method=session.storage_provider if session.storage_provider != "s3" else "s3_multipart",
            reserved_asset_id=session.reserved_asset_id,
            object_key=session.object_key,
        )
    )


@router.get("/uploads/{upload_id}", response_model=ResponseModel[UploadStatusOut])
async def get_upload_status(
    upload_id: UUID,
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadStatusOut]:
    session, missing = await service.get_status(upload_id=upload_id, org_id=org_id)
    return Response.success(
        data=UploadStatusOut(
            upload_id=session.id,
            status=str(session.status),
            missing_parts=missing,
            uploaded_parts=(int(session.total_parts) - len(missing)),
            total_parts=int(session.total_parts),
        )
    )


@router.put("/uploads/{upload_id}/parts/{part_number}", response_model=ResponseModel[None])
async def upload_part(
    request: Request,
    upload_id: UUID,
    part_number: int,
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
    content_length: int | None = Header(default=None, alias="Content-Length"),
) -> ResponseModel[None]:
    # Chunk sizes are expected to be bounded (default 8MiB); reading into memory is acceptable for now.
    data = await request.body()
    if content_length is not None and content_length != len(data):
        # Defensive check for broken clients/proxies.
        raise BadRequest(
            message=t("errors", "UPLOAD_BODY_INVALID", default="上传内容不合法"), error="UPLOAD_BODY_INVALID"
        )

    await service.put_part(upload_id=upload_id, org_id=org_id, part_number=part_number, data=data)
    return Response.success(data=None)


@router.post("/uploads/{upload_id}/complete", response_model=ResponseModel[UploadCompleteOut])
async def complete_upload(
    upload_id: UUID,
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadCompleteOut]:
    asset_id = await service.complete(upload_id=upload_id, org_id=org_id)
    return Response.success(data=UploadCompleteOut(asset_id=asset_id))


@router.post("/uploads/{upload_id}/abort", response_model=ResponseModel[UploadAbortOut])
async def abort_upload(
    upload_id: UUID,
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadAbortOut]:
    session = await service.abort(upload_id=upload_id, org_id=org_id)
    return Response.success(data=UploadAbortOut(upload_id=session.id, status=str(session.status)))


@router.post("/uploads/{upload_id}/parts/{part_number}/presign", response_model=ResponseModel[UploadPartPresignOut])
async def presign_upload_part(
    upload_id: UUID,
    part_number: int,
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadPartPresignOut]:
    out = await service.presign_part(upload_id=upload_id, org_id=org_id, part_number=part_number)
    return Response.success(data=out)


@router.post("/uploads/{upload_id}/parts/{part_number}/commit", response_model=ResponseModel[None])
async def commit_upload_part(
    upload_id: UUID,
    part_number: int,
    payload: UploadPartCommitRequest,
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[None]:
    await service.commit_part(
        upload_id=upload_id,
        org_id=org_id,
        part_number=part_number,
        etag=payload.etag,
        size_bytes=payload.size_bytes,
    )
    return Response.success(data=None)
