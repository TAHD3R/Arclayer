from __future__ import annotations

from tortoise import fields

from src.common.models import BaseModel


# Active sys config revision pointer (per namespace).
class SysConfigActive(BaseModel):
    """
    Active sys-domain configuration pointer (namespace -> revision).

    Notes:
    - Unique per namespace.
    - Activation metadata is tracked for audit.
    """

    namespace = fields.CharField(max_length=128, unique=True, db_index=True)
    active_revision = fields.ForeignKeyField(
        "models.SysConfigRevision",
        related_name="active_records",
        on_delete=fields.CASCADE,
    )
    activated_at = fields.DatetimeField(auto_now=True, db_index=True)
    activated_by = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "sys_config_active"
        abstract = False
