from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from src.models.system.notification_campaign import (
    NotificationCampaignChannel,
    NotificationCampaignRecord,
    NotificationCampaignState,
    NotificationCampaignVariantRecord,
    NotificationDeliveryRecord,
    NotificationDeliveryState,
    NotificationPresentation,
)
from src.modules.system.admin.notifications.campaign_delivery_repository import (
    NotificationCampaignDeliveryRepository,
)

pytestmark = pytest.mark.integration


async def test_campaign_delivery_settlement_aggregates_distinct_recipients_and_terminal_outcomes(
    prepared_db,
) -> None:
    _ = prepared_db
    campaign = await NotificationCampaignRecord.create(
        name="Repository settlement",
        owner_user_id=uuid4(),
        revision=1,
        state=NotificationCampaignState.DISPATCHING,
        audience={"kind": "all_active_users"},
        channels=[NotificationCampaignChannel.IN_APP, NotificationCampaignChannel.EMAIL],
        presentations=[NotificationPresentation.INBOX, NotificationPresentation.EMAIL],
        fallback_locale="en-US",
    )
    variant = await NotificationCampaignVariantRecord.create(
        campaign=campaign,
        locale="en-US",
        revision=1,
        is_fallback=True,
        inbox_payload={"title": "Inbox"},
        email_payload={
            "templateKey": "system.release",
            "templateVersion": 1,
            "variables": {},
        },
    )
    first_recipient = uuid4()
    second_recipient = uuid4()
    third_recipient = uuid4()
    now = datetime.now(UTC)
    rows = (
        (first_recipient, NotificationPresentation.INBOX, NotificationDeliveryState.DELIVERED),
        (first_recipient, NotificationPresentation.EMAIL, NotificationDeliveryState.SENT),
        (second_recipient, NotificationPresentation.EMAIL, NotificationDeliveryState.FAILED),
        (third_recipient, NotificationPresentation.INBOX, NotificationDeliveryState.SUPPRESSED),
    )
    for index, (recipient_id, presentation, state) in enumerate(rows):
        await NotificationDeliveryRecord.create(
            campaign=campaign,
            variant=variant,
            recipient_user_id=recipient_id,
            recipient_locale="en-US",
            channel=(
                NotificationCampaignChannel.EMAIL
                if presentation == NotificationPresentation.EMAIL
                else NotificationCampaignChannel.IN_APP
            ),
            presentation=presentation,
            idempotency_key=f"settlement:{campaign.id}:{index}",
            state=state,
            sent_at=now if state in {NotificationDeliveryState.SENT, NotificationDeliveryState.DELIVERED} else None,
            delivered_at=now if state == NotificationDeliveryState.DELIVERED else None,
            read_at=now if state == NotificationDeliveryState.DELIVERED else None,
            failure_code="TEST_FAILURE" if state == NotificationDeliveryState.FAILED else None,
            is_retryable=state == NotificationDeliveryState.FAILED,
        )

    counts = await NotificationCampaignDeliveryRepository().settle_campaign(campaign)

    await campaign.refresh_from_db()
    assert counts == {
        "recipient_count": 3,
        "pending_count": 0,
        "sent_count": 2,
        "delivered_count": 1,
        "failed_count": 1,
        "suppressed_count": 1,
        "read_count": 1,
        "clicked_count": 0,
        "dismissed_count": 0,
    }
    assert campaign.state == NotificationCampaignState.PARTIALLY_FAILED
    assert campaign.completed_at is not None


async def test_campaign_delivery_cursor_does_not_repeat_retryable_failures(prepared_db) -> None:
    _ = prepared_db
    campaign = await NotificationCampaignRecord.create(
        name="Cursor settlement",
        owner_user_id=uuid4(),
        state=NotificationCampaignState.DISPATCHING,
        audience={"kind": "all_active_users"},
        channels=[NotificationCampaignChannel.EMAIL],
        presentations=[NotificationPresentation.EMAIL],
        fallback_locale="en-US",
    )
    variant = await NotificationCampaignVariantRecord.create(
        campaign=campaign,
        locale="en-US",
        is_fallback=True,
        email_payload={
            "templateKey": "system.release",
            "templateVersion": 1,
            "variables": {},
        },
    )
    for index in range(3):
        await NotificationDeliveryRecord.create(
            campaign=campaign,
            variant=variant,
            recipient_user_id=uuid4(),
            recipient_locale="en-US",
            channel=NotificationCampaignChannel.EMAIL,
            presentation=NotificationPresentation.EMAIL,
            idempotency_key=f"cursor:{campaign.id}:{index}",
            state=NotificationDeliveryState.FAILED,
            failure_code="PROVIDER_UNAVAILABLE",
            is_retryable=True,
        )
    repository = NotificationCampaignDeliveryRepository()

    first = await repository.list_actionable_deliveries(
        campaign_id=campaign.id,
        retry_failed_only=True,
        after_id=None,
        limit=2,
    )
    second = await repository.list_actionable_deliveries(
        campaign_id=campaign.id,
        retry_failed_only=True,
        after_id=first[-1].id,
        limit=2,
    )

    assert len(first) == 2
    assert len(second) == 1
    assert {row.id for row in first}.isdisjoint({row.id for row in second})
