from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.organization.user import User, UserStatus
from src.models.system.notification_campaign import (
    NotificationCampaignRecord,
    NotificationCampaignState,
    NotificationCampaignVariantRecord,
    NotificationDeliveryRecord,
    NotificationDeliveryState,
)
from src.models.workspaces.workspace import WorkspaceMembershipStatus
from src.modules.system.admin.notifications.campaign_contracts import (
    NotificationAudienceKind,
    NotificationAudienceRule,
)

_CAMPAIGN_ORDERING = {
    "name": "name",
    "state": "state",
    "priority": "priority",
    "schedule_at": "schedule_at",
    "created_at": "created_at",
    "updated_at": "updated_at",
}


class NotificationCampaignRepository(TortoiseORMRepository):
    async def create_campaign(
        self,
        *,
        data: dict[str, Any],
        conn: BaseDBAsyncClient | None = None,
    ) -> NotificationCampaignRecord:
        return await self.create_record(NotificationCampaignRecord, conn=conn, **data)

    async def get_campaign(
        self,
        campaign_id: UUID,
        *,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> NotificationCampaignRecord | None:
        queryset = NotificationCampaignRecord.filter(id=campaign_id)
        if for_update:
            queryset = queryset.select_for_update()
        return await self.using_db(queryset, conn).first()

    async def list_campaigns(
        self,
        *,
        offset: int,
        limit: int,
        q: str | None,
        ordering: str | None,
        states: Sequence[NotificationCampaignState],
    ) -> tuple[list[NotificationCampaignRecord], int]:
        queryset = NotificationCampaignRecord.all()
        if q:
            normalized = q.strip()
            if normalized:
                queryset = queryset.filter(
                    Q(name__icontains=normalized) | Q(internal_description__icontains=normalized)
                )
        if states:
            queryset = queryset.filter(state__in=list(states))
        queryset = queryset.order_by(*_normalize_ordering(ordering))
        total = int(await queryset.count())
        rows = await queryset.offset(offset).limit(limit)
        return list(rows), total

    async def save_campaign(
        self,
        campaign: NotificationCampaignRecord,
        *,
        fields: dict[str, Any],
        conn: BaseDBAsyncClient | None = None,
    ) -> NotificationCampaignRecord:
        return await self.update_fields(campaign, fields=fields, conn=conn)

    async def replace_variants(
        self,
        *,
        campaign_id: UUID,
        variants: Sequence[dict[str, Any]],
        conn: BaseDBAsyncClient | None = None,
    ) -> list[NotificationCampaignVariantRecord]:
        delete_query = NotificationCampaignVariantRecord.filter(campaign_id=campaign_id)
        await self.using_db(delete_query, conn).delete()
        rows: list[NotificationCampaignVariantRecord] = []
        for variant in variants:
            rows.append(
                await self.create_record(
                    NotificationCampaignVariantRecord,
                    conn=conn,
                    campaign_id=campaign_id,
                    **variant,
                )
            )
        return rows

    async def list_variants(
        self,
        campaign_id: UUID,
        *,
        conn: BaseDBAsyncClient | None = None,
    ) -> list[NotificationCampaignVariantRecord]:
        queryset = NotificationCampaignVariantRecord.filter(campaign_id=campaign_id).order_by("locale")
        return list(await self.using_db(queryset, conn))

    async def list_users(self, user_ids: set[UUID]) -> dict[UUID, User]:
        if not user_ids:
            return {}
        users = await User.filter(id__in=list(user_ids))
        return {UUID(str(user.id)): user for user in users}

    async def estimate_audience(self, rule: NotificationAudienceRule) -> tuple[int, tuple[UUID, ...]]:
        queryset = self.build_audience_queryset(rule)
        total = int(await queryset.count())
        sample = await queryset.order_by("id").limit(10).values_list("id", flat=True)
        return total, tuple(UUID(str(user_id)) for user_id in sample)

    async def list_audience_page(
        self,
        rule: NotificationAudienceRule,
        *,
        offset: int,
        limit: int,
    ) -> list[User]:
        return list(await self.build_audience_queryset(rule).order_by("id").offset(offset).limit(limit))

    def build_audience_queryset(self, rule: NotificationAudienceRule):
        queryset = User.filter(status=UserStatus.ACTIVE)
        if rule.kind == NotificationAudienceKind.EXPLICIT_USERS:
            queryset = queryset.filter(id__in=list(rule.user_ids))
        elif rule.kind == NotificationAudienceKind.WORKSPACE_MEMBERS:
            queryset = queryset.filter(
                workspace_memberships__workspace_id__in=list(rule.workspace_ids),
                workspace_memberships__status=WorkspaceMembershipStatus.ACTIVE,
            ).distinct()
        if rule.created_from:
            queryset = queryset.filter(created_at__gte=rule.created_from)
        if rule.created_to:
            queryset = queryset.filter(created_at__lt=rule.created_to)
        if rule.last_active_from:
            queryset = queryset.filter(last_login_at__gte=rule.last_active_from)
        if rule.last_active_to:
            queryset = queryset.filter(last_login_at__lt=rule.last_active_to)
        return queryset

    async def list_deliveries(
        self,
        *,
        campaign_id: UUID,
        offset: int,
        limit: int,
        states: Sequence[NotificationDeliveryState],
    ) -> tuple[list[NotificationDeliveryRecord], int]:
        queryset = NotificationDeliveryRecord.filter(campaign_id=campaign_id)
        if states:
            queryset = queryset.filter(state__in=list(states))
        queryset = queryset.order_by("-created_at")
        total = int(await queryset.count())
        return list(await queryset.offset(offset).limit(limit)), total

    async def count_retryable_deliveries(self, campaign_id: UUID) -> int:
        return int(
            await NotificationDeliveryRecord.filter(
                campaign_id=campaign_id,
                state=NotificationDeliveryState.FAILED,
                is_retryable=True,
            ).count()
        )

    async def cancel_pending_deliveries(
        self,
        *,
        campaign_id: UUID,
        cancelled_at: datetime,
        conn: BaseDBAsyncClient | None = None,
    ) -> int:
        queryset = NotificationDeliveryRecord.filter(
            campaign_id=campaign_id,
            state__in=[NotificationDeliveryState.PENDING, NotificationDeliveryState.PROCESSING],
        )
        return int(
            await self.using_db(queryset, conn).update(
                state=NotificationDeliveryState.CANCELLED,
                updated_at=cancelled_at,
            )
        )


def _normalize_ordering(ordering: str | None) -> tuple[str, ...]:
    requested = [item.strip() for item in (ordering or "-updated_at").split(",") if item.strip()]
    normalized: list[str] = []
    for item in requested:
        descending = item.startswith("-")
        field = item[1:] if descending else item
        mapped = _CAMPAIGN_ORDERING.get(field)
        if mapped:
            normalized.append(f"-{mapped}" if descending else mapped)
    return tuple(normalized or ["-updated_at"])
