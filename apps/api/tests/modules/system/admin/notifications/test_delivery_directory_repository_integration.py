from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from src.models.organization.user import User, UserStatus
from src.models.system.notification_campaign import (
    NotificationCampaignChannel,
    NotificationCampaignRecord,
    NotificationCampaignState,
    NotificationCampaignVariantRecord,
    NotificationDeliveryRecord,
    NotificationDeliverySourceKind,
    NotificationDeliveryState,
    NotificationPresentation,
)
from src.modules.system.admin.notifications.delivery_directory_repository import (
    NotificationDeliveryDirectoryRepository,
)

pytestmark = pytest.mark.integration


async def test_delivery_directory_searches_campaign_and_recipient_in_database_and_applies_filters(
    prepared_db,
) -> None:
    _ = prepared_db
    campaign_recipient = await _user(username="directory-campaign-recipient", display_name="Campaign Recipient")
    recipient_match = await _user(username="directory-recipient-match", display_name="Delivery Search Recipient")
    campaign = await _campaign(name="Searchable campaign evidence")
    other_campaign = await _campaign(name="Unrelated campaign")
    variant = await _variant(campaign)
    other_variant = await _variant(other_campaign)
    await _delivery(
        campaign=campaign,
        variant=variant,
        recipient_id=campaign_recipient.id,
        attempt_count=3,
        state=NotificationDeliveryState.FAILED,
        is_retryable=True,
    )
    await _delivery(
        campaign=other_campaign,
        variant=other_variant,
        recipient_id=recipient_match.id,
        attempt_count=1,
        state=NotificationDeliveryState.FAILED,
        is_retryable=True,
    )
    await _delivery(
        campaign=other_campaign,
        variant=other_variant,
        recipient_id=recipient_match.id,
        attempt_count=9,
        state=NotificationDeliveryState.SENT,
        is_retryable=False,
    )
    repository = NotificationDeliveryDirectoryRepository()

    campaign_rows, campaign_total = await repository.list_deliveries(
        offset=0,
        limit=20,
        q="searchable campaign",
        campaign_ids=(),
        states=(NotificationDeliveryState.FAILED,),
        channels=(NotificationCampaignChannel.EMAIL,),
        presentations=(NotificationPresentation.EMAIL,),
        retryable=True,
        ordering="-attempt_count",
    )
    recipient_rows, recipient_total = await repository.list_deliveries(
        offset=0,
        limit=20,
        q="delivery search recipient",
        campaign_ids=(),
        states=(NotificationDeliveryState.FAILED,),
        channels=(NotificationCampaignChannel.EMAIL,),
        presentations=(NotificationPresentation.EMAIL,),
        retryable=True,
        ordering="-attempt_count",
    )

    assert campaign_total == 1
    assert [UUID(str(row.campaign_id)) for row in campaign_rows] == [campaign.id]
    assert recipient_total == 1
    assert [UUID(str(row.recipient_user_id)) for row in recipient_rows] == [recipient_match.id]
    assert [row.attempt_count for row in recipient_rows] == [1]


async def _user(*, username: str, display_name: str) -> User:
    return await User.create(
        username=f"{username}-{uuid4().hex}",
        email=f"{uuid4().hex}@example.com",
        display_name=display_name,
        status=UserStatus.ACTIVE,
    )


async def _campaign(*, name: str) -> NotificationCampaignRecord:
    return await NotificationCampaignRecord.create(
        name=name,
        owner_user_id=uuid4(),
        state=NotificationCampaignState.COMPLETED,
        audience={"kind": "all_active_users"},
        channels=[NotificationCampaignChannel.EMAIL],
        presentations=[NotificationPresentation.EMAIL],
        fallback_locale="en-US",
    )


async def _variant(campaign: NotificationCampaignRecord) -> NotificationCampaignVariantRecord:
    return await NotificationCampaignVariantRecord.create(
        campaign=campaign,
        locale="en-US",
        is_fallback=True,
        email_payload={
            "templateKey": "system.directory",
            "templateVersion": 1,
            "variables": {},
        },
    )


async def _delivery(
    *,
    campaign: NotificationCampaignRecord,
    variant: NotificationCampaignVariantRecord,
    recipient_id: UUID,
    attempt_count: int,
    state: NotificationDeliveryState,
    is_retryable: bool,
) -> NotificationDeliveryRecord:
    return await NotificationDeliveryRecord.create(
        campaign=campaign,
        variant=variant,
        recipient_user_id=recipient_id,
        source_kind=NotificationDeliverySourceKind.CAMPAIGN,
        source_identity=f"campaign:{campaign.id}:variant:{variant.id}",
        recipient_locale="en-US",
        channel=NotificationCampaignChannel.EMAIL,
        presentation=NotificationPresentation.EMAIL,
        idempotency_key=f"delivery-directory:{uuid4()}",
        state=state,
        attempt_count=attempt_count,
        is_retryable=is_retryable,
    )
