from __future__ import annotations

from tortoise import fields

from apps.api.src.common.models.base import BaseModel


class WebhookDelivery(BaseModel):
    """
    Webhook delivery log record.

    v1 is intentionally minimal: it supports delivery diagnostics and debugging, and avoids storing
    large payloads by default.
    """

    subscription = fields.ForeignKeyField(
        "models.WebhookSubscription",
        related_name="deliveries",
        on_delete=fields.CASCADE,
    )

    event = fields.CharField(max_length=128, db_index=True)
    status = fields.CharField(max_length=32, db_index=True)  # success | failed
    response_code = fields.IntField(null=True)
    error = fields.TextField(null=True)
    duration_ms = fields.IntField(null=True)

    class Meta(BaseModel.Meta):
        table = "webhook_deliveries"
        abstract = False
