from __future__ import annotations

from tortoise import fields

from src.common.models import BaseModel


class WebhookSubscription(BaseModel):
    """Domain model for webhook subscriptions.

    Workspace-scoped webhook subscription.

    Notes:
    - v1 scopes webhooks to workspace settings.
    - Secrets are stored encrypted-at-rest (when provided).
    """

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="webhook_subscriptions",
        on_delete=fields.CASCADE,
    )

    # Optional attribution to a capability/app (future: enforced via app registry).
    capability_id = fields.CharField(max_length=128, null=True, db_index=True)

    event = fields.CharField(max_length=128, db_index=True)
    endpoint_url = fields.CharField(max_length=512)
    enabled = fields.BooleanField(default=True, db_index=True)

    # Optional encrypted secret used for signing deliveries (HMAC).
    secret = fields.CharField(max_length=2048, null=True)

    class Meta(BaseModel.Meta):
        table = "webhook_subscriptions"
        table_description = "Webhook event subscription records per workspace."
        abstract = False
        unique_together = (("workspace_id", "event", "endpoint_url"),)
