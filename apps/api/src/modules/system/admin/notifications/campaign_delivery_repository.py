from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from tortoise.functions import Count

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.organization.user import User
from src.models.system.notification import NotificationRecord
from src.models.system.notification_campaign import (
    NotificationCampaignRecord,
    NotificationCampaignState,
    NotificationCampaignVariantRecord,
    NotificationDeliveryRecord,
    NotificationDeliverySourceKind,
    NotificationDeliveryState,
)


class NotificationCampaignDeliveryRepository(TortoiseORMRepository[NotificationDeliveryRecord]):
    async def get_campaign(self, campaign_id: UUID) -> NotificationCampaignRecord | None:
        return await NotificationCampaignRecord.filter(id=campaign_id).first()

    async def get_variant(self, variant_id: UUID) -> NotificationCampaignVariantRecord | None:
        return await NotificationCampaignVariantRecord.filter(id=variant_id).first()

    async def get_recipient_user(self, user_id: UUID) -> User | None:
        return await User.filter(id=user_id).first()

    async def begin_dispatch(self, campaign: NotificationCampaignRecord) -> None:
        now = datetime.now(UTC)
        updated = await NotificationCampaignRecord.filter(
            id=campaign.id,
            state__in=[NotificationCampaignState.SCHEDULED, NotificationCampaignState.DISPATCHING],
        ).update(
            state=NotificationCampaignState.DISPATCHING,
            dispatch_started_at=campaign.dispatch_started_at or now,
            updated_at=now,
        )
        if updated != 1:
            raise RuntimeError(f"Notification campaign {campaign.id} cannot enter dispatching")
        campaign.state = NotificationCampaignState.DISPATCHING
        campaign.dispatch_started_at = campaign.dispatch_started_at or now

    async def create_delivery(
        self,
        *,
        data: dict[str, Any],
    ) -> tuple[NotificationDeliveryRecord, bool]:
        campaign_id = data["campaign_id"]
        variant_id = data["variant_id"]
        normalized = {
            **data,
            "source_kind": NotificationDeliverySourceKind.CAMPAIGN,
            "source_identity": f"campaign:{campaign_id}:variant:{variant_id}",
        }
        return await NotificationDeliveryRecord.get_or_create(
            idempotency_key=str(normalized["idempotency_key"]),
            defaults={key: value for key, value in normalized.items() if key != "idempotency_key"},
        )

    async def list_actionable_deliveries(
        self,
        *,
        campaign_id: UUID,
        retry_failed_only: bool,
        after_id: UUID | None,
        limit: int,
    ) -> list[NotificationDeliveryRecord]:
        queryset = NotificationDeliveryRecord.filter(campaign_id=campaign_id)
        if retry_failed_only:
            queryset = queryset.filter(state=NotificationDeliveryState.FAILED, is_retryable=True)
        else:
            queryset = queryset.filter(
                state__in=[NotificationDeliveryState.PENDING, NotificationDeliveryState.PROCESSING]
            )
        if after_id is not None:
            queryset = queryset.filter(id__gt=after_id)
        return list(await queryset.order_by("id").limit(limit))

    async def mark_processing(self, delivery: NotificationDeliveryRecord) -> None:
        now = datetime.now(UTC)
        delivery.state = NotificationDeliveryState.PROCESSING
        delivery.processing_at = now
        delivery.attempt_count = int(delivery.attempt_count) + 1
        delivery.failure_code = None
        delivery.failure_message = None
        delivery.is_retryable = False
        await delivery.save(
            update_fields=[
                "state",
                "processing_at",
                "attempt_count",
                "failure_code",
                "failure_message",
                "is_retryable",
                "updated_at",
            ]
        )

    async def mark_delivered(self, delivery: NotificationDeliveryRecord, *, notification_id: UUID) -> None:
        now = datetime.now(UTC)
        await self._save_terminal(
            delivery,
            state=NotificationDeliveryState.DELIVERED,
            fields={"sent_at": now, "delivered_at": now, "notification_id": notification_id},
        )

    async def mark_sent(self, delivery: NotificationDeliveryRecord, *, provider_message_id: str | None) -> None:
        await self._save_terminal(
            delivery,
            state=NotificationDeliveryState.SENT,
            fields={"sent_at": datetime.now(UTC), "provider_message_id": provider_message_id},
        )

    async def mark_suppressed(self, delivery: NotificationDeliveryRecord, *, reason: str) -> None:
        await self._save_terminal(
            delivery,
            state=NotificationDeliveryState.SUPPRESSED,
            fields={"failure_code": reason, "is_retryable": False},
        )

    async def mark_failed(
        self,
        delivery: NotificationDeliveryRecord,
        *,
        code: str,
        message: str,
        is_retryable: bool,
    ) -> None:
        await self._save_terminal(
            delivery,
            state=NotificationDeliveryState.FAILED,
            fields={
                "failure_code": code,
                "failure_message": message[:512],
                "is_retryable": is_retryable,
            },
        )

    async def find_notification(self, *, recipient_user_id: UUID, dedupe_key: str) -> NotificationRecord | None:
        return await NotificationRecord.filter(
            recipient_user_id=recipient_user_id,
            dedupe_key=dedupe_key,
        ).first()

    async def settle_campaign(self, campaign: NotificationCampaignRecord) -> dict[str, int]:
        state_rows = await (
            NotificationDeliveryRecord
            .filter(campaign_id=campaign.id)
            .annotate(total=Count("id"))
            .group_by("state")
            .values("state", "total")
        )
        counts = {str(row["state"]): int(row["total"]) for row in state_rows}
        recipient_rows = await (
            NotificationDeliveryRecord
            .filter(campaign_id=campaign.id)
            .annotate(total=Count("recipient_user_id", distinct=True))
            .values("total")
        )
        recipient_count = int(recipient_rows[0]["total"]) if recipient_rows else 0
        interaction_counts = await self._interaction_counts(UUID(str(campaign.id)))
        pending = sum(
            counts.get(str(state), 0)
            for state in (NotificationDeliveryState.PENDING, NotificationDeliveryState.PROCESSING)
        )
        delivered = counts.get(str(NotificationDeliveryState.DELIVERED), 0)
        sent = delivered + counts.get(str(NotificationDeliveryState.SENT), 0)
        failed = counts.get(str(NotificationDeliveryState.FAILED), 0)
        fields: dict[str, Any] = {
            "recipient_count": recipient_count,
            "pending_count": pending,
            "sent_count": sent,
            "delivered_count": delivered,
            "failed_count": failed,
            "suppressed_count": counts.get(str(NotificationDeliveryState.SUPPRESSED), 0),
            **interaction_counts,
        }
        if pending == 0:
            fields.update({
                "state": (
                    NotificationCampaignState.PARTIALLY_FAILED if failed else NotificationCampaignState.COMPLETED
                ),
                "completed_at": datetime.now(UTC),
            })
        await NotificationCampaignRecord.filter(id=campaign.id).update(**fields, updated_at=datetime.now(UTC))
        for key, value in fields.items():
            setattr(campaign, key, value)
        return {key: int(value) for key, value in fields.items() if isinstance(value, int)}

    async def _interaction_counts(self, campaign_id: UUID) -> dict[str, int]:
        queryset = NotificationDeliveryRecord.filter(campaign_id=campaign_id)
        return {
            "read_count": int(await queryset.filter(read_at__not_isnull=True).count()),
            "clicked_count": int(await queryset.filter(clicked_at__not_isnull=True).count()),
            "dismissed_count": int(await queryset.filter(dismissed_at__not_isnull=True).count()),
        }

    @staticmethod
    async def _save_terminal(
        delivery: NotificationDeliveryRecord,
        *,
        state: NotificationDeliveryState,
        fields: dict[str, Any],
    ) -> None:
        delivery.state = state
        for key, value in fields.items():
            setattr(delivery, key, value)
        await delivery.save(update_fields=["state", *fields, "updated_at"])


def delivery_idempotency_key(
    *,
    campaign_id: UUID,
    campaign_revision: int,
    recipient_user_id: UUID,
    presentation: str,
) -> str:
    return f"campaign:{campaign_id}:v{campaign_revision}:user:{recipient_user_id}:{presentation}"
