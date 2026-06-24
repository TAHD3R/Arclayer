from __future__ import annotations

from tortoise import fields

from src.common.models import BaseModel


# Sys config revision history (namespace -> value).
class SysConfigRevision(BaseModel):
    """Internal model for system configuration revisions.

    Sys-domain configuration revision (namespace -> JSON payload).

    Notes:
    - This table is the audit trail / history.
    - Active revision is tracked by SysConfigActive.
    - Secret fields remain masked in API responses, but revisions store the raw config payload.
    """

    namespace = fields.CharField(max_length=128, db_index=True)
    value = fields.JSONField(null=False)
    base_revision_id = fields.UUIDField(null=True, db_index=True)
    created_by = fields.UUIDField(null=True, db_index=True)

    # Detached signature over a canonical payload (best-effort audit hardening).
    signature = fields.CharField(max_length=256, null=True)
    signing_key_fingerprint = fields.CharField(max_length=128, null=True)

    class Meta(BaseModel.Meta):
        table = "system_config_revisions"
        table_description = "Versioned system configuration revision history."
        abstract = False
        indexes = (("namespace", "created_at"),)
