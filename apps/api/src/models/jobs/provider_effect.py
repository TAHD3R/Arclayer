from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class ProviderEffectDisposition(StrEnum):
    ACTIVE = "active"
    COMMITTED = "committed"
    CLEANED = "cleaned"


class ProviderEffectRecord(BaseModel):
    """Normalized durable ownership and settlement state for one provider effect."""

    job = fields.ForeignKeyField(
        "models.BackgroundJobRecord",
        related_name="provider_effects",
        on_delete=fields.RESTRICT,
    )
    owner_attempt = fields.ForeignKeyField(
        "models.JobAttemptRecord",
        related_name="owned_provider_effects",
        on_delete=fields.RESTRICT,
    )
    profile = fields.ForeignKeyField(
        "models.StorageProfile",
        related_name="provider_effects",
        on_delete=fields.RESTRICT,
    )
    profile_revision = fields.ForeignKeyField(
        "models.StorageProfileRouteRevision",
        related_name="provider_effects",
        on_delete=fields.RESTRICT,
    )
    effect_type = fields.CharField(max_length=128)
    # This is a short logical idempotency identity, not a provider object key.
    # Exact provider keys remain in the manifest to keep the composite unique
    # index below PostgreSQL's B-tree entry limit in the worst UTF-8 case.
    effect_key = fields.CharField(max_length=256)
    schema_version = fields.IntField()
    manifest = fields.JSONField()
    manifest_hash = fields.CharField(max_length=64)
    disposition = fields.CharEnumField(
        ProviderEffectDisposition,
        max_length=16,
        default=ProviderEffectDisposition.ACTIVE,
        db_index=True,
    )
    registered_at = fields.DatetimeField()
    settled_at = fields.DatetimeField(null=True)
    settled_by_attempt = fields.ForeignKeyField(
        "models.JobAttemptRecord",
        related_name="settled_provider_effects",
        on_delete=fields.RESTRICT,
        null=True,
    )
    settlement_reference = fields.JSONField(null=True)

    if TYPE_CHECKING:
        job_id: UUID
        owner_attempt_id: UUID
        profile_id: UUID
        profile_revision_id: UUID
        settled_by_attempt_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "provider_effect_records"
        table_description = "Durable provider effects owned and settled by fenced Job Attempts."
        abstract = False
        unique_together = (("owner_attempt_id", "effect_type", "effect_key"),)
        indexes = (
            ("job_id", "disposition", "registered_at"),
            ("profile_id", "disposition", "registered_at"),
        )
