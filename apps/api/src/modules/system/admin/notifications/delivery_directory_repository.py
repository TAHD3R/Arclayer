from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from tortoise.expressions import Q, Subquery

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.organization.user import User
from src.models.system.notification_campaign import (
    NotificationCampaignChannel,
    NotificationCampaignRecord,
    NotificationCampaignVariantRecord,
    NotificationDeliveryRecord,
    NotificationDeliverySourceKind,
    NotificationDeliveryState,
    NotificationPresentation,
)

_DELIVERY_DIRECTORY_ORDERING = {
    "attempt_count": "attempt_count",
    "campaign_name": "campaign__name",
    "channel": "channel",
    "created_at": "created_at",
    "delivered_at": "delivered_at",
    "presentation": "presentation",
    "scheduled_at": "scheduled_at",
    "sent_at": "sent_at",
    "state": "state",
    "updated_at": "updated_at",
}


class NotificationDeliveryDirectoryRepository(TortoiseORMRepository[NotificationDeliveryRecord]):
    """Database reads for the persisted Campaign delivery ledger directory."""

    async def list_deliveries(
        self,
        *,
        offset: int,
        limit: int,
        q: str | None,
        campaign_ids: Sequence[UUID],
        states: Sequence[NotificationDeliveryState],
        channels: Sequence[NotificationCampaignChannel],
        presentations: Sequence[NotificationPresentation],
        retryable: bool | None,
        ordering: str | None,
    ) -> tuple[list[NotificationDeliveryRecord], int]:
        queryset = NotificationDeliveryRecord.filter(
            source_kind=NotificationDeliverySourceKind.CAMPAIGN,
            campaign_id__not_isnull=True,
        )
        if campaign_ids:
            queryset = queryset.filter(campaign_id__in=list(campaign_ids))
        if states:
            queryset = queryset.filter(state__in=list(states))
        if channels:
            queryset = queryset.filter(channel__in=list(channels))
        if presentations:
            queryset = queryset.filter(presentation__in=list(presentations))
        if retryable is not None:
            queryset = queryset.filter(is_retryable=retryable)
        if q and (term := q.strip()):
            queryset = queryset.filter(self._search_filter(term))
        queryset = queryset.order_by(*_normalize_ordering(ordering))
        total = int(await queryset.count())
        return list(await queryset.offset(offset).limit(limit)), total

    async def list_campaigns(self, campaign_ids: set[UUID]) -> dict[UUID, NotificationCampaignRecord]:
        if not campaign_ids:
            return {}
        rows = await NotificationCampaignRecord.filter(id__in=list(campaign_ids))
        return {UUID(str(row.id)): row for row in rows}

    async def list_variants(self, variant_ids: set[UUID]) -> dict[UUID, NotificationCampaignVariantRecord]:
        if not variant_ids:
            return {}
        rows = await NotificationCampaignVariantRecord.filter(id__in=list(variant_ids))
        return {UUID(str(row.id)): row for row in rows}

    async def list_recipients(self, recipient_ids: set[UUID]) -> dict[UUID, User]:
        if not recipient_ids:
            return {}
        rows = await User.filter(id__in=list(recipient_ids))
        return {UUID(str(row.id)): row for row in rows}

    @staticmethod
    def _search_filter(term: str) -> Q:
        return (
            Q(source_identity__icontains=term)
            | Q(provider_message_id__icontains=term)
            | Q(failure_code__icontains=term)
            | Q(failure_message__icontains=term)
            | Q(
                campaign_id__in=Subquery(
                    NotificationCampaignRecord.filter(name__icontains=term).values_list("id", flat=True)
                )
            )
            | Q(
                recipient_user_id__in=Subquery(
                    User.filter(Q(username__icontains=term) | Q(display_name__icontains=term)).values_list(
                        "id", flat=True
                    )
                )
            )
        )


def _normalize_ordering(ordering: str | None) -> tuple[str, ...]:
    requested = [item.strip() for item in (ordering or "-created_at").split(",") if item.strip()]
    normalized: list[str] = []
    for item in requested:
        descending = item.startswith("-")
        field = item[1:] if descending else item
        mapped = _DELIVERY_DIRECTORY_ORDERING.get(field)
        if mapped:
            normalized.append(f"-{mapped}" if descending else mapped)
    if not normalized:
        normalized.append("-created_at")
    if "id" not in {field.removeprefix("-") for field in normalized}:
        normalized.append("-id")
    return tuple(normalized)
