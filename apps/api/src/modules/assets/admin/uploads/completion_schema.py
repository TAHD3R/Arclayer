from __future__ import annotations

from enum import StrEnum
from pathlib import Path
from typing import Self
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from src.common.constants.assets import (
    ASSET_SCOPE_ORGANIZATION,
    ASSET_SCOPE_PROJECT,
    ASSET_SCOPE_USER,
    ASSET_SCOPE_WORKSPACE,
)
from src.models.assets.upload import UploadSessionRecord, UploadStatus
from src.modules.assets.scope import AssetScope
from src.modules.jobs.registry import JobTypeDefinition
from src.modules.jobs.schema import BackgroundJobCreateResult


class _UploadCompletionModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, str_strip_whitespace=True)


class _UploadPartSnapshot(_UploadCompletionModel):
    part_number: int = Field(..., ge=1)
    object_key: str = Field(..., min_length=1, max_length=1024)
    size_bytes: int = Field(..., ge=0)
    checksum_sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    etag: str | None = Field(default=None, max_length=128)


class _UploadSessionSnapshot(_UploadCompletionModel):
    id: UUID
    workspace_id: UUID | None = None
    project_id: UUID | None = None
    organization_id: UUID | None = None
    user_id: UUID | None = None
    actor_user_id: UUID
    purpose: str = Field(..., min_length=1, max_length=64)
    filename: str = Field(..., min_length=1, max_length=255)
    mime: str | None = Field(default=None, max_length=128)
    size_bytes: int = Field(..., ge=0)
    expected_sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    total_parts: int = Field(..., ge=1)
    expires_at: AwareDatetime
    asset_id: UUID | None = None
    reserved_asset_id: UUID
    target_folder_id: UUID | None = None
    storage_provider: str = Field(..., min_length=1, max_length=32)
    storage_profile_key: str | None = Field(default=None, max_length=128)
    visibility: str = Field(..., min_length=1, max_length=16)
    indexable: bool
    resolved_slug: str | None = Field(default=None, max_length=128)
    resolved_ext: str | None = Field(default=None, max_length=32)
    object_key: str = Field(..., min_length=1, max_length=1024)
    multipart_upload_id: str | None = Field(default=None, max_length=256)
    s3_bucket: str | None = Field(default=None, max_length=255)

    @classmethod
    def from_record(cls, session: UploadSessionRecord) -> Self:
        return cls.model_validate(session, from_attributes=True)

    def scope(self) -> AssetScope:
        candidates = (
            (ASSET_SCOPE_WORKSPACE, self.workspace_id),
            (ASSET_SCOPE_PROJECT, self.project_id),
            (ASSET_SCOPE_ORGANIZATION, self.organization_id),
            (ASSET_SCOPE_USER, self.user_id),
        )
        resolved = [(scope_type, scope_id) for scope_type, scope_id in candidates if scope_id is not None]
        if len(resolved) != 1:
            raise ValueError("upload completion snapshot must bind exactly one asset scope")
        scope_type, scope_id = resolved[0]
        return AssetScope(type=scope_type, id=scope_id)


class _UploadCompletionClaim(_UploadCompletionModel):
    scope: AssetScope
    session: _UploadSessionSnapshot
    parts: tuple[_UploadPartSnapshot, ...]
    thumbnail_definition: JobTypeDefinition | None = Field(default=None, exclude=True, repr=False)
    claim_token: UUID
    generation: int = Field(..., ge=1)
    status: UploadStatus
    heartbeat_at: AwareDatetime
    lease_until: AwareDatetime
    storage_finalized_at: AwareDatetime | None = None
    storage_checksum_sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    finalized_storage_bucket: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def validate_claim_binding(self) -> Self:
        if self.status not in {UploadStatus.COMPLETING, UploadStatus.STORAGE_FINALIZED}:
            raise ValueError("upload completion claim must bind an active completion status")
        if self.session.scope() != self.scope:
            raise ValueError("upload completion claim scope does not match the session scope")
        if self.lease_until <= self.heartbeat_at:
            raise ValueError("upload completion lease must end after its heartbeat")

        if self.status == UploadStatus.COMPLETING:
            expected_part_numbers = tuple(range(1, self.session.total_parts + 1))
            if tuple(part.part_number for part in self.parts) != expected_part_numbers:
                raise ValueError("upload completion claim parts must be complete and ordered")
            if sum(part.size_bytes for part in self.parts) != self.session.size_bytes:
                raise ValueError("upload completion claim part bytes do not match the declared upload size")
            if self.session.storage_provider != "local" and any(not (part.etag or "").strip() for part in self.parts):
                raise ValueError("remote upload completion claims require an ETag for every part")
            if self.session.storage_provider == "local" and any(part.checksum_sha256 is None for part in self.parts):
                raise ValueError("local upload completion claims require a checksum for every part")

        finalized_values = (
            self.storage_finalized_at,
            self.storage_checksum_sha256,
            self.finalized_storage_bucket,
        )
        if self.status == UploadStatus.COMPLETING and any(value is not None for value in finalized_values):
            raise ValueError("pre-storage upload claim cannot carry finalized storage evidence")
        if self.status == UploadStatus.STORAGE_FINALIZED and self.storage_finalized_at is None:
            raise ValueError("storage-finalized upload claim requires a finalized timestamp")
        if (
            self.status == UploadStatus.STORAGE_FINALIZED
            and self.session.storage_provider == "local"
            and self.storage_checksum_sha256 is None
        ):
            raise ValueError("storage-finalized local upload claim requires a checksum")
        return self


class _UploadStorageOutcome(_UploadCompletionModel):
    asset_id: UUID
    object_key: str = Field(..., min_length=1, max_length=1024)
    checksum_sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    storage_bucket: str | None = Field(default=None, max_length=255)
    cleanup_part_paths: tuple[Path, ...] = ()


class _UploadCompletionCommit(_UploadCompletionModel):
    asset_id: UUID
    thumbnail_job_result: BackgroundJobCreateResult | None = None


class _UploadCompletionClaimDisposition(StrEnum):
    CLAIMED = "claimed"
    COMPLETED = "completed"
    BUSY = "busy"


class _UploadCompletionClaimResult(_UploadCompletionModel):
    disposition: _UploadCompletionClaimDisposition
    claim: _UploadCompletionClaim | None = None
    asset_id: UUID | None = None

    @model_validator(mode="after")
    def validate_disposition_payload(self) -> Self:
        if self.disposition == _UploadCompletionClaimDisposition.CLAIMED:
            if self.claim is None or self.asset_id is not None:
                raise ValueError("claimed completion disposition requires exactly one claim")
            return self
        if self.disposition == _UploadCompletionClaimDisposition.COMPLETED:
            if self.asset_id is None or self.claim is not None:
                raise ValueError("completed disposition requires exactly one Asset identity")
            return self
        if self.claim is not None or self.asset_id is not None:
            raise ValueError("busy completion disposition cannot carry committed or claimed state")
        return self
