from __future__ import annotations

from math import ceil
from typing import Any
from uuid import UUID

from src.config import Settings
from src.core.http.pagination import PageData, PageParams
from src.core.services import BaseService
from src.models.system.notification_campaign import (
    NotificationCampaignChannel,
    NotificationCampaignRecord,
    NotificationCampaignVariantRecord,
    NotificationDeliveryRecord,
    NotificationDeliveryState,
    NotificationPresentation,
)
from src.modules.system.admin.notifications.campaign_contracts import NotificationEmailPayload
from src.modules.system.admin.notifications.delivery_directory_repository import (
    NotificationDeliveryDirectoryRepository,
)
from src.modules.system.admin.notifications.delivery_directory_schema import (
    NotificationDeliveryDirectoryCampaignOut,
    NotificationDeliveryDirectoryOut,
    NotificationDeliveryDirectoryRecipientOut,
    NotificationDeliveryDirectoryTemplateOut,
)


class NotificationDeliveryDirectoryService(BaseService):
    """Projects persisted Campaign delivery evidence into the Platform directory."""

    def __init__(
        self,
        repository: NotificationDeliveryDirectoryRepository,
        *,
        settings: Settings | None = None,
    ) -> None:
        super().__init__(settings)
        self.repository = repository

    async def list_deliveries(
        self,
        *,
        params: PageParams,
        q: str | None,
        campaign_ids: tuple[UUID, ...],
        states: tuple[NotificationDeliveryState, ...],
        channels: tuple[NotificationCampaignChannel, ...],
        presentations: tuple[NotificationPresentation, ...],
        retryable: bool | None,
        ordering: str | None,
    ) -> PageData[NotificationDeliveryDirectoryOut]:
        rows, total = await self.repository.list_deliveries(
            offset=params.offset,
            limit=params.limit,
            q=q,
            campaign_ids=campaign_ids,
            states=states,
            channels=channels,
            presentations=presentations,
            retryable=retryable,
            ordering=ordering,
        )
        campaigns = await self.repository.list_campaigns({
            UUID(str(row.campaign_id)) for row in rows if row.campaign_id is not None
        })
        variants = await self.repository.list_variants({
            UUID(str(row.variant_id)) for row in rows if row.variant_id is not None
        })
        recipients = await self.repository.list_recipients({UUID(str(row.recipient_user_id)) for row in rows})
        return _page(
            items=[
                _delivery_out(
                    row,
                    campaign=campaigns.get(UUID(str(row.campaign_id))),
                    variant=variants.get(UUID(str(row.variant_id))) if row.variant_id is not None else None,
                    recipient=recipients.get(UUID(str(row.recipient_user_id))),
                )
                for row in rows
            ],
            total=total,
            params=params,
        )


def _delivery_out(
    row: NotificationDeliveryRecord,
    *,
    campaign: NotificationCampaignRecord | None,
    variant: NotificationCampaignVariantRecord | None,
    recipient: Any | None,
) -> NotificationDeliveryDirectoryOut:
    if campaign is None:
        raise RuntimeError(f"Notification delivery {row.id} has no campaign projection")
    recipient_id = UUID(str(row.recipient_user_id))
    return NotificationDeliveryDirectoryOut(
        id=UUID(str(row.id)),
        campaign=NotificationDeliveryDirectoryCampaignOut(
            id=UUID(str(campaign.id)),
            name=str(campaign.name),
            revision=int(campaign.revision),
            state=campaign.state,
        ),
        recipient=NotificationDeliveryDirectoryRecipientOut(
            id=recipient_id,
            username=str(recipient.username) if recipient is not None else None,
            display_name=recipient.display_name if recipient is not None else None,
            status=str(recipient.status) if recipient is not None else None,
        ),
        template=_template_out(variant),
        source_kind=row.source_kind,
        source_identity=str(row.source_identity),
        channel=row.channel,
        presentation=row.presentation,
        state=row.state,
        attempt_count=int(row.attempt_count),
        is_retryable=bool(row.is_retryable),
        scheduled_at=row.scheduled_at,
        processing_at=row.processing_at,
        sent_at=row.sent_at,
        delivered_at=row.delivered_at,
        read_at=row.read_at,
        clicked_at=row.clicked_at,
        dismissed_at=row.dismissed_at,
        notification_id=row.notification_id,
        provider_message_id=row.provider_message_id,
        failure_code=row.failure_code,
        failure_message=row.failure_message,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _template_out(variant: NotificationCampaignVariantRecord | None) -> NotificationDeliveryDirectoryTemplateOut | None:
    if variant is None:
        return None
    email = NotificationEmailPayload.model_validate(variant.email_payload) if variant.email_payload else None
    return NotificationDeliveryDirectoryTemplateOut(
        variant_id=UUID(str(variant.id)),
        locale=str(variant.locale),
        content_revision=int(variant.revision),
        template_key=email.template_key if email is not None else None,
        template_version=email.template_version if email is not None else None,
    )


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
