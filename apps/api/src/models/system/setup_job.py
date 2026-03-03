from __future__ import annotations

from tortoise import fields

from apps.api.src.common.models.base import BaseModel


# System setup job status (async bootstrap progress).
class SetupJobRecord(BaseModel):
    """System setup job status for async bootstrap progress polling."""

    status = fields.CharField(max_length=16, db_index=True, default="pending")
    stage = fields.CharField(max_length=32, db_index=True, default="precheck")
    percent = fields.IntField(default=0)
    warnings = fields.JSONField(default=list)
    result = fields.JSONField(null=True)
    error_code = fields.CharField(max_length=128, null=True)
    error_message = fields.TextField(null=True)
    started_at = fields.DatetimeField(null=True)
    finished_at = fields.DatetimeField(null=True)

    class Meta(BaseModel.Meta):
        table = "system_setup_jobs"
        abstract = False
