from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class FeatureAccessConvergenceOutboxRecord(BaseModel):
    """Immutable committed Feature Access fact for one Plan Access Convergence."""

    convergence = fields.OneToOneField(
        "models.PlanAccessConvergence",
        related_name="feature_access_outbox",
        on_delete=fields.CASCADE,
    )
    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="feature_access_convergence_outbox",
        on_delete=fields.CASCADE,
    )
    fingerprint = fields.CharField(max_length=64)
    payload = fields.JSONField()
    effective_at = fields.DatetimeField(db_index=True)

    if TYPE_CHECKING:
        convergence_id: UUID
        workspace_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_feature_access_convergence_outbox"
        table_description = "Immutable committed Feature Access convergence facts."
        abstract = False
        indexes = (("workspace_id", "created_at"),)
