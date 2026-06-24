from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from src.common.models import BaseModel


class UploadStatus(StrEnum):
    """Upload session state machine."""

    INITIATED = "initiated"
    UPLOADING = "uploading"
    COMPLETING = "completing"
    COMPLETED = "completed"
    ABORTED = "aborted"
    EXPIRED = "expired"


# Upload session record (multipart upload).
class UploadSessionRecord(BaseModel):
    """Domain model for upload session records."""

    # Exactly one scope id must be set (enforced at service boundary).
    workspace_id = fields.UUIDField(null=True, db_index=True)
    project_id = fields.UUIDField(null=True, db_index=True)
    organization_id = fields.UUIDField(null=True, db_index=True)
    user_id = fields.UUIDField(null=True, db_index=True)
    actor_user_id = fields.UUIDField(db_index=True)

    purpose = fields.CharField(max_length=64, db_index=True)
    filename = fields.CharField(max_length=255)
    mime = fields.CharField(max_length=128, null=True)
    size_bytes = fields.BigIntField(default=0)
    expected_sha256 = fields.CharField(max_length=64, null=True)

    chunk_size = fields.IntField(default=0)
    total_parts = fields.IntField(default=0)
    status = fields.CharEnumField(UploadStatus, default=UploadStatus.INITIATED, db_index=True)
    expires_at = fields.DatetimeField(db_index=True)
    asset_id = fields.UUIDField(null=True, db_index=True)
    reserved_asset_id = fields.UUIDField(null=True, db_index=True)

    # Resolved metadata used for immutable public URLs / object keys.
    resolved_slug = fields.CharField(max_length=128, null=True)
    resolved_ext = fields.CharField(max_length=32, null=True)
    object_key = fields.CharField(max_length=1024, null=True)

    # Provider-specific state (e.g. S3 multipart upload id).
    multipart_upload_id = fields.CharField(max_length=256, null=True, db_index=True)

    # Requested delivery policy (validated by service):
    # - avatar/site_logo/favicon are forced public + noindex
    # - indexable is only allowed when visibility is public
    visibility = fields.CharField(max_length=16, default="private", db_index=True)
    indexable = fields.BooleanField(default=False, db_index=True)

    target_folder_id = fields.UUIDField(null=True, db_index=True)
    storage_provider = fields.CharField(max_length=32, default="local")
    storage_profile_key = fields.CharField(max_length=128, null=True, db_index=True)
    # S3 bucket used for multipart upload (required for complete/presign in dual-bucket setups).
    s3_bucket = fields.CharField(max_length=255, null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "upload_sessions"
        table_description = "Multipart upload session tracking records."
        abstract = False


# Upload part record (multipart upload chunk).
class UploadPartRecord(BaseModel):
    """Domain model for upload part records."""

    session = fields.ForeignKeyField("models.UploadSessionRecord", related_name="parts", on_delete=fields.CASCADE)
    part_number = fields.IntField()
    size_bytes = fields.IntField(default=0)
    checksum_sha256 = fields.CharField(max_length=64, null=True)
    etag = fields.CharField(max_length=128, null=True)
    object_key = fields.CharField(max_length=1024)
    stored = fields.BooleanField(default=False)

    class Meta(BaseModel.Meta):
        table = "upload_parts"
        table_description = "Individual part records for multipart uploads."
        abstract = False
        unique_together = (("session_id", "part_number"),)
