from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from src.common.models.base import BaseModel


class ConnectorEventInboxStatus(StrEnum):
    RECEIVED = "received"
    PROCESSING = "processing"
    PROCESSED = "processed"
    FAILED = "failed"


class ConnectorEventInbox(BaseModel):
    """Encrypted raw Connector event accepted before asynchronous processing."""

    provider = fields.CharField(max_length=32)
    provider_mode = fields.CharField(max_length=8)
    provider_account_id = fields.CharField(max_length=255)
    provider_event_id = fields.CharField(max_length=255)
    connector_key = fields.CharField(max_length=128)
    connector_version = fields.CharField(max_length=64)
    event_type = fields.CharField(max_length=160, db_index=True)
    signature_timestamp = fields.DatetimeField()
    payload_sha256 = fields.CharField(max_length=64)
    encrypted_payload = fields.TextField()
    retention_deadline = fields.DatetimeField(db_index=True)
    status = fields.CharEnumField(
        ConnectorEventInboxStatus,
        max_length=16,
        default=ConnectorEventInboxStatus.RECEIVED,
        db_index=True,
    )
    processing_attempts = fields.IntField(default=0)
    job_id = fields.UUIDField(null=True, unique=True)
    processed_at = fields.DatetimeField(null=True)
    last_error_code = fields.CharField(max_length=96, null=True)
    last_error_message = fields.TextField(null=True)
    result_reference = fields.JSONField(null=True)

    class Meta(BaseModel.Meta):
        table = "connector_event_inbox"
        table_description = "Encrypted raw Connector events and durable processing authority."
        abstract = False
        unique_together = (("provider", "provider_mode", "provider_account_id", "provider_event_id"),)
        indexes = (
            ("status", "created_at"),
            ("connector_key", "connector_version", "created_at"),
        )
