from __future__ import annotations

from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Header, Request

from src.common.constants.assets import ASSET_SCOPE_ORGANIZATION
from src.common.protocols.tortoise import HasOrganizationId
from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.exceptions import BadRequest
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import t
from src.models.organization.org_membership import OrgMembership
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
from src.modules.organization.http.service import (
    get_org_membership_for_organization,
    require_org_permission,
)

router = APIRouter(
    prefix="/organizations/{organization_id}",
    tags=["Organization: Uploads"],
    dependencies=[
        require_org_permission(
            "org.assets.manage",
            error_code="ORG_ASSETS_MANAGE_REQUIRED",
            membership_dependency=get_org_membership_for_organization,
        )
    ],
)


def _ts(key: str, default: str) -> str:
    return t("errors", key, default=default)


def get_uploads_service(settings: Settings = Depends(get_settings)) -> UploadsService:
    return UploadsService(settings)


def _org_scope(orgm: OrgMembership) -> AssetScope:
    return AssetScope(type=ASSET_SCOPE_ORGANIZATION, id=UUID(str(cast(HasOrganizationId, orgm).organization_id)))


@router.post(
    "/uploads/init",
    response_model=ResponseModel[UploadInitOut],
    summary="Initialize upload session (organization scope)",
)
async def init_upload(
    payload: UploadInitRequest,
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadInitOut]:
    session = await service.init_upload(
        scope=_org_scope(orgm),
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
    summary="Get upload status (organization scope)",
)
async def get_upload_status(
    upload_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadStatusOut]:
    session, missing = await service.get_status(upload_id=upload_id, scope=_org_scope(orgm))
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
    summary="Upload a part (organization scope)",
)
async def upload_part(
    request: Request,
    upload_id: PublicUUID,
    part_number: int,
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
    content_length: int | None = Header(default=None, alias="Content-Length"),
) -> ResponseModel[None]:
    data = await request.body()
    if content_length is not None and content_length != len(data):
        raise BadRequest(
            message=_ts("UPLOAD_BODY_INVALID", "上传内容不合法"),
            error="UPLOAD_BODY_INVALID",
        )

    await service.put_part(upload_id=upload_id, scope=_org_scope(orgm), part_number=part_number, data=data)
    return ApiResponse.success(data=None)


@router.post(
    "/uploads/{upload_id}/complete",
    response_model=ResponseModel[UploadCompleteOut],
    summary="Complete upload (organization scope)",
)
async def complete_upload(
    background_tasks: BackgroundTasks,
    upload_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadCompleteOut]:
    asset_id = await service.complete(upload_id=upload_id, scope=_org_scope(orgm), background_tasks=background_tasks)
    return ApiResponse.success(data=UploadCompleteOut(asset_id=asset_id))


@router.post(
    "/uploads/{upload_id}/abort",
    response_model=ResponseModel[UploadAbortOut],
    summary="Abort upload (organization scope)",
)
async def abort_upload(
    upload_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadAbortOut]:
    session = await service.abort(upload_id=upload_id, scope=_org_scope(orgm))
    return ApiResponse.success(data=UploadAbortOut(upload_id=session.id, status=str(session.status)))


@router.post(
    "/uploads/{upload_id}/parts/{part_number}/presign",
    response_model=ResponseModel[UploadPartPresignOut],
    summary="Presign upload part (organization scope)",
)
async def presign_upload_part(
    upload_id: PublicUUID,
    part_number: int,
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[UploadPartPresignOut]:
    out = await service.presign_part(upload_id=upload_id, scope=_org_scope(orgm), part_number=part_number)
    return ApiResponse.success(data=out)


@router.post(
    "/uploads/{upload_id}/parts/{part_number}/commit",
    response_model=ResponseModel[None],
    summary="Commit upload part (organization scope)",
)
async def commit_upload_part(
    upload_id: PublicUUID,
    part_number: int,
    payload: UploadPartCommitRequest,
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    _user=Depends(get_current_user),
    service: UploadsService = Depends(get_uploads_service),
) -> ResponseModel[None]:
    await service.commit_part(
        upload_id=upload_id,
        scope=_org_scope(orgm),
        part_number=part_number,
        etag=payload.etag,
        size_bytes=payload.size_bytes,
    )
    return ApiResponse.success(data=None)
