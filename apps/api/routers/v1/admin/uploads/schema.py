from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field

from apps.api.common.schemas import BaseSchema


class UploadInitRequest(BaseSchema):
    purpose: str = Field(..., min_length=1, max_length=64, description="Upload purpose.")
    filename: str = Field(..., min_length=1, max_length=255, description="Original file name.")
    mime: str | None = Field(default=None, max_length=128, description="Client-provided MIME type.")
    size_bytes: int = Field(..., ge=0, description="Total size in bytes.")
    expected_sha256: str | None = Field(default=None, min_length=64, max_length=64, description="Expected SHA-256.")
    visibility: str | None = Field(default=None, description="Requested visibility: public/private/shared.")
    indexable: bool | None = Field(default=None, description="Whether the asset is indexable by search engines.")
    folder_id: UUID | None = Field(default=None, description="Target folder id (optional).")


class UploadInitOut(BaseSchema):
    upload_id: UUID = Field(..., description="Upload session id.")
    chunk_size: int = Field(..., ge=1, description="Chunk size in bytes.")
    total_parts: int = Field(..., ge=1, description="Total part count.")
    expires_at: datetime = Field(..., description="Session expiration time.")


class UploadStatusOut(BaseSchema):
    upload_id: UUID = Field(..., description="Upload session id.")
    status: str = Field(..., description="Current session status.")
    missing_parts: list[int] = Field(default_factory=list, description="Missing part numbers (1-based).")
    uploaded_parts: int = Field(..., ge=0, description="Count of uploaded parts.")
    total_parts: int = Field(..., ge=1, description="Expected total parts.")


class UploadCompleteOut(BaseSchema):
    asset_id: UUID = Field(..., description="Created asset id.")


class UploadAbortOut(BaseSchema):
    upload_id: UUID = Field(..., description="Upload session id.")
    status: str = Field(..., description="Final session status.")
