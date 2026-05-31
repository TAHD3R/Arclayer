from __future__ import annotations

from datetime import datetime

from pydantic import Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.platform.storage.profiles import is_local_storage_provider


class UploadInitRequest(BaseSchema):
    purpose: str = Field(..., min_length=1, max_length=64, description="Upload purpose.")
    filename: str = Field(..., min_length=1, max_length=255, description="Original file name.")
    mime: str | None = Field(default=None, max_length=128, description="Client-provided MIME type.")
    size_bytes: int = Field(..., ge=0, description="Total size in bytes.")
    expected_sha256: str | None = Field(default=None, min_length=64, max_length=64, description="Expected SHA-256.")
    visibility: str | None = Field(default=None, description="Requested visibility: public/private/shared.")
    indexable: bool | None = Field(default=None, description="Whether the asset is indexable by search engines.")
    folder_id: PublicUUID | None = Field(default=None, description="Target folder id (optional).")


class UploadInitOut(BaseSchema):
    upload_id: PublicUUID = Field(..., description="Upload session id.")
    chunk_size: int = Field(..., ge=1, description="Chunk size in bytes.")
    total_parts: int = Field(..., ge=1, description="Total part count.")
    expires_at: datetime = Field(..., description="Session expiration time.")
    method: str | None = Field(default=None, description="Upload method: local | s3_multipart.")
    reserved_asset_id: PublicUUID | None = Field(default=None, description="Reserved asset id (for S3 direct upload).")
    object_key: str | None = Field(default=None, description="Target object key (for S3 direct upload).")


class UploadStatusOut(BaseSchema):
    upload_id: PublicUUID = Field(..., description="Upload session id.")
    status: str = Field(..., description="Current session status.")
    missing_parts: list[int] = Field(default_factory=list, description="Missing part numbers (1-based).")
    uploaded_parts: int = Field(..., ge=0, description="Count of uploaded parts.")
    total_parts: int = Field(..., ge=1, description="Expected total parts.")


class UploadCompleteOut(BaseSchema):
    asset_id: PublicUUID = Field(..., description="Created asset id.")


class UploadAbortOut(BaseSchema):
    upload_id: PublicUUID = Field(..., description="Upload session id.")
    status: str = Field(..., description="Final session status.")


class UploadPurposePolicy(BaseSchema):
    max_size_mb: int = Field(..., ge=1, description="Maximum upload size in MiB.")
    max_size_bytes: int = Field(..., ge=1, description="Maximum upload size in bytes.")
    allowed_extensions: list[str] = Field(default_factory=list, description="Allowed file extensions.")
    allowed_mime_types: list[str] = Field(default_factory=list, description="Allowed MIME types.")
    accept: str = Field(default="", description="Browser file input accept string.")


class UploadPolicySettings(BaseSchema):
    defaults: UploadPurposePolicy
    purposes: dict[str, UploadPurposePolicy] = Field(default_factory=dict)


class UploadPolicyOut(UploadPurposePolicy):
    purpose: str = Field(..., description="Resolved upload purpose.")


class UploadPartPresignOut(BaseSchema):
    url: str = Field(..., description="Presigned URL for direct upload.")
    method: str = Field(default="PUT", description="HTTP method to use.")
    headers: dict[str, str] = Field(default_factory=dict, description="Required headers for the upload request.")
    expires_at: datetime = Field(..., description="Presigned URL expiration time.")


class UploadPartCommitRequest(BaseSchema):
    etag: str = Field(..., min_length=1, max_length=128, description="ETag returned by S3 for this uploaded part.")
    size_bytes: int = Field(..., ge=0, description="Uploaded part size (bytes).")


def build_upload_init_out(session) -> UploadInitOut:
    method = "local" if is_local_storage_provider(str(session.storage_provider)) else "s3_multipart"
    return UploadInitOut(
        upload_id=session.id,
        chunk_size=session.chunk_size,
        total_parts=session.total_parts,
        expires_at=session.expires_at,
        method=method,
        reserved_asset_id=session.reserved_asset_id,
        object_key=session.object_key,
    )
