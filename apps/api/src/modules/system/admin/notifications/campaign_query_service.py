from __future__ import annotations

from math import ceil
from typing import Any
from uuid import UUID

from src.config import Settings
from src.core.exceptions import NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.services import BaseService
from src.models.system.notification_campaign import (
    NotificationCampaignRecord,
    NotificationCampaignState,
    NotificationDeliveryState,
    NotificationPresentation,
)
from src.modules.system.admin.notifications.campaign_contracts import NotificationAudienceRule
from src.modules.system.admin.notifications.campaign_projection import (
    campaign_detail_out,
    campaign_summary_out,
    campaign_variant_out,
)
from src.modules.system.admin.notifications.campaign_repository import NotificationCampaignRepository
from src.modules.system.admin.notifications.campaign_schema import (
    NotificationAudienceEstimateOut,
    NotificationCampaignDetailOut,
    NotificationCampaignPreviewOut,
    NotificationCampaignPreviewVariantOut,
    NotificationCampaignSummaryOut,
    NotificationDeliveryOut,
)


class NotificationCampaignQueryService(BaseService):
    def __init__(
        self,
        repository: NotificationCampaignRepository,
        *,
        settings: Settings | None = None,
    ) -> None:
        super().__init__(settings)
        self.repository = repository

    async def list_campaigns(
        self,
        *,
        params: PageParams,
        q: str | None,
        ordering: str | None,
        states: tuple[NotificationCampaignState, ...],
    ) -> PageData[NotificationCampaignSummaryOut]:
        rows, total = await self.repository.list_campaigns(
            offset=params.offset,
            limit=params.limit,
            q=q,
            ordering=ordering,
            states=states,
        )
        owners = await self.repository.list_users({UUID(str(row.owner_user_id)) for row in rows})
        items = [campaign_summary_out(row, owner=_require_owner(row, owners)) for row in rows]
        return _page(items=items, total=total, params=params)

    async def get_campaign(self, campaign_id: UUID) -> NotificationCampaignDetailOut:
        campaign = await self.require_campaign(campaign_id)
        return await self.detail_from_record(campaign)

    async def detail_from_record(self, campaign: NotificationCampaignRecord) -> NotificationCampaignDetailOut:
        variants = await self.repository.list_variants(UUID(str(campaign.id)))
        owner = await self.require_owner(campaign)
        return campaign_detail_out(campaign, owner=owner, variants=variants)

    async def summary_from_record(self, campaign: NotificationCampaignRecord) -> NotificationCampaignSummaryOut:
        return campaign_summary_out(campaign, owner=await self.require_owner(campaign))

    async def require_campaign(self, campaign_id: UUID) -> NotificationCampaignRecord:
        campaign = await self.repository.get_campaign(campaign_id)
        if campaign is None:
            raise NotFound(error="NOTIFICATION_CAMPAIGN_NOT_FOUND")
        return campaign

    async def require_owner(self, campaign: NotificationCampaignRecord) -> Any:
        owners = await self.repository.list_users({UUID(str(campaign.owner_user_id))})
        return _require_owner(campaign, owners)

    async def estimate_audience(self, campaign_id: UUID) -> NotificationAudienceEstimateOut:
        campaign = await self.require_campaign(campaign_id)
        total, sample = await self.repository.estimate_audience(
            NotificationAudienceRule.model_validate(campaign.audience)
        )
        await self.repository.save_campaign(campaign, fields={"audience_estimate": total})
        return NotificationAudienceEstimateOut(
            campaign_id=campaign.id,
            revision=campaign.revision,
            estimated_recipients=total,
            breakdown={"activeUsers": total},
            sampled_user_ids=sample,
        )

    async def preview(self, campaign_id: UUID) -> NotificationCampaignPreviewOut:
        campaign = await self.require_campaign(campaign_id)
        variants = await self.repository.list_variants(campaign_id)
        projected = [campaign_variant_out(row) for row in variants]
        return NotificationCampaignPreviewOut(
            campaign_id=campaign.id,
            revision=campaign.revision,
            variants=[
                NotificationCampaignPreviewVariantOut(
                    locale=variant.locale,
                    used_fallback=False,
                    presentations={
                        key: value.model_dump(mode="json", by_alias=True)
                        for key, value in (
                            (NotificationPresentation.INBOX, variant.inbox),
                            (NotificationPresentation.EMAIL, variant.email),
                            (NotificationPresentation.MODAL, variant.modal),
                            (NotificationPresentation.BANNER, variant.banner),
                            (NotificationPresentation.TOAST, variant.toast),
                        )
                        if value is not None
                    },
                )
                for variant in projected
            ],
            warnings=[] if campaign.fallback_locale else ["NOTIFICATION_CAMPAIGN_FALLBACK_LOCALE_REQUIRED"],
        )

    async def list_deliveries(
        self,
        *,
        campaign_id: UUID,
        params: PageParams,
        states: tuple[NotificationDeliveryState, ...],
    ) -> PageData[NotificationDeliveryOut]:
        await self.require_campaign(campaign_id)
        rows, total = await self.repository.list_deliveries(
            campaign_id=campaign_id,
            offset=params.offset,
            limit=params.limit,
            states=states,
        )
        return _page(
            items=[NotificationDeliveryOut.model_validate(row, from_attributes=True) for row in rows],
            total=total,
            params=params,
        )


def _require_owner(campaign: NotificationCampaignRecord, owners: dict[UUID, Any]) -> Any:
    owner = owners.get(UUID(str(campaign.owner_user_id)))
    if owner is None:
        raise RuntimeError(f"Notification campaign {campaign.id} has no owner projection")
    return owner


def _page[T](*, items: list[T], total: int, params: PageParams) -> PageData[T]:
    pages = ceil(total / params.size) if total else 0
    return PageData[T](
        items=items,
        total=total,
        page=params.page,
        size=params.size,
        pages=pages,
        next=params.page + 1 if params.page < pages else None,
        prev=min(params.page - 1, pages) if pages and params.page > 1 else None,
    )
