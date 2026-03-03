from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from apps.api.src.common.models.base import BaseModel


class NotificationCategory(StrEnum):
    """
    Notification category for basic grouping and UI styling.

    Notes:
    - Keep this small for MVP; extend when we add more notification sources.
    """

    TEAM = "team"
    SECURITY = "security"
    TASK = "task"


# Notification inbox record (per-user).
class NotificationRecord(BaseModel):
    """
    Per-user notification inbox record (workspace-scoped in v2).

    Product decisions (MVP):
    - Only show notifications for the current workspace.
    - Clicking a notification auto-marks it as read.
    - Closing (dismiss) also marks it as read.
    """

    workspace_id = fields.UUIDField(db_index=True)
    recipient_user_id = fields.UUIDField(db_index=True)

    category = fields.CharEnumField(NotificationCategory, db_index=True)
    title = fields.CharField(max_length=256)
    body = fields.CharField(max_length=512, null=True)

    # UI navigation target: frontend route path (e.g. "/team/members").
    target_to = fields.CharField(max_length=512)
    # Extra routing hints (e.g. entity ids). Keep it minimal and non-sensitive.
    target_meta = fields.JSONField(null=True)

    # Actor who triggered the notification (best-effort; may be null for system events).
    actor_user_id = fields.UUIDField(null=True, db_index=True)
    # Optional event name for analytics / future aggregation (e.g. "team.invitation.accepted").
    event_name = fields.CharField(max_length=128, null=True, db_index=True)
    # Optional dedupe key to prevent duplicated notifications for the same recipient and org.
    dedupe_key = fields.CharField(max_length=128, null=True)

    read_at = fields.DatetimeField(null=True, db_index=True)
    archived_at = fields.DatetimeField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "notifications"
        abstract = False
        unique_together = (("workspace_id", "recipient_user_id", "dedupe_key"),)
