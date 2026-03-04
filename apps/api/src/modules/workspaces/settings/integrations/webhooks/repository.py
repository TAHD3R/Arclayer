from __future__ import annotations

from uuid import UUID

from apps.api.src.common.repositories import BaseRepository
from apps.api.src.models.integrations.webhook_delivery import WebhookDelivery
from apps.api.src.models.integrations.webhook_subscription import WebhookSubscription


class WebhooksRepository(BaseRepository):
    async def list_subscriptions(self, *, workspace_id: UUID) -> list[WebhookSubscription]:
        return await WebhookSubscription.filter(workspace_id=workspace_id).order_by("created_at").all()

    async def list_enabled_subscriptions(self, *, workspace_id: UUID, event: str) -> list[WebhookSubscription]:
        return await WebhookSubscription.filter(workspace_id=workspace_id, event=event, enabled=True).all()

    async def create_subscription(
        self,
        *,
        workspace_id: UUID,
        capability_id: str | None,
        event: str,
        endpoint_url: str,
        enabled: bool,
        secret: str | None,
    ) -> WebhookSubscription:
        return await WebhookSubscription.create(
            workspace_id=workspace_id,
            capability_id=capability_id,
            event=event,
            endpoint_url=endpoint_url,
            enabled=enabled,
            secret=secret,
        )

    async def create_delivery(
        self,
        *,
        subscription_id: UUID,
        event: str,
        status: str,
        response_code: int | None,
        error: str | None,
        duration_ms: int | None,
    ) -> WebhookDelivery:
        return await WebhookDelivery.create(
            subscription_id=subscription_id,
            event=event,
            status=status,
            response_code=response_code,
            error=error,
            duration_ms=duration_ms,
        )

    async def list_deliveries(self, *, workspace_id: UUID, limit: int) -> list[WebhookDelivery]:
        max_items = max(min(int(limit or 0), 200), 1)
        return (
            await WebhookDelivery
            .filter(subscription__workspace_id=workspace_id)
            .order_by("-created_at")
            .limit(max_items)
            .all()
        )
