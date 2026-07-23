from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID, uuid4

import pytest

from src.common.email.provider import SendResult
from src.config import Settings
from src.models.organization.user import User, UserStatus
from src.models.system.notification_campaign import (
    NotificationCampaignChannel,
    NotificationCampaignRecord,
    NotificationCampaignState,
    NotificationCampaignVariantRecord,
    NotificationDeliveryRecord,
    NotificationDeliveryState,
    NotificationPresentation,
)
from src.modules.jobs.execution_errors import PermanentJobExecutionError
from src.modules.jobs.execution_registry import JobExecutionContext
from src.modules.system.admin.notifications import campaign_job_handler as handler_module
from src.modules.system.admin.notifications.campaign_delivery_repository import (
    NotificationCampaignDeliveryRepository,
)
from src.modules.system.admin.notifications.campaign_job_contract import (
    CAMPAIGN_STATE_INVALID_CODE,
    NotificationCampaignJobInput,
    NotificationCampaignJobResult,
    NotificationCampaignJobTarget,
)
from src.modules.system.admin.notifications.campaign_job_handler import (
    CampaignEmailSender,
    NotificationCampaignJobHandler,
)
from src.modules.system.admin.notifications.campaign_repository import NotificationCampaignRepository

pytestmark = pytest.mark.unit


class _Context:
    def __init__(self, campaign_id: UUID, *, retry_failed_only: bool = False) -> None:
        self.target = NotificationCampaignJobTarget(campaign_id=campaign_id)
        self.input_reference = NotificationCampaignJobInput(
            campaign_id=campaign_id,
            campaign_revision=1,
            retry_failed_only=retry_failed_only,
        )
        self.lease = SimpleNamespace(job_id=uuid4(), attempt_id=uuid4(), attempt_number=1)
        self.actor_user_id = None
        self.source_revision = f"notification-campaign:{campaign_id}:v1:publish"
        self.request_fingerprint = "f" * 64
        self.progress: list[Any] = []
        self.checkpoints = 0

    def idempotency_key(self, *, step: str) -> str:
        return f"campaign-test:{step}"

    async def checkpoint(self):  # type: ignore[no-untyped-def]
        self.checkpoints += 1
        return SimpleNamespace(cancellation_requested=False)

    async def report_progress(self, update):  # type: ignore[no-untyped-def]
        self.progress.append(update)
        return SimpleNamespace(cancellation_requested=False)

    async def run_fenced_domain_commit(self, operation):  # type: ignore[no-untyped-def]
        return await operation()


class _CampaignRepository:
    def __init__(self, *, variants: list[NotificationCampaignVariantRecord], users: list[User]) -> None:
        self.variants = variants
        self.users = users

    async def list_variants(self, campaign_id: UUID) -> list[NotificationCampaignVariantRecord]:
        assert campaign_id == UUID(str(self.variants[0].campaign_id))
        return self.variants

    async def list_audience_page(self, rule, *, offset: int, limit: int):  # type: ignore[no-untyped-def]
        assert rule.kind == "all_active_users"
        return self.users[offset : offset + limit]


class _DeliveryRepository:
    def __init__(
        self,
        *,
        campaign: NotificationCampaignRecord,
        variant: NotificationCampaignVariantRecord,
        users: list[User],
    ) -> None:
        self.campaign = campaign
        self.variant = variant
        self.users = {user.id: user for user in users}
        self.rows: dict[str, NotificationDeliveryRecord] = {}
        self.list_calls: list[UUID | None] = []

    async def get_campaign(self, campaign_id: UUID) -> NotificationCampaignRecord | None:
        return self.campaign if campaign_id == self.campaign.id else None

    async def get_variant(self, variant_id: UUID) -> NotificationCampaignVariantRecord | None:
        return self.variant if variant_id == self.variant.id else None

    async def get_recipient_user(self, user_id: UUID) -> User | None:
        return self.users.get(user_id)

    async def begin_dispatch(self, campaign: NotificationCampaignRecord) -> None:
        assert campaign is self.campaign
        campaign.state = NotificationCampaignState.DISPATCHING

    async def create_delivery(self, *, data: dict[str, Any]) -> tuple[NotificationDeliveryRecord, bool]:
        key = str(data["idempotency_key"])
        existing = self.rows.get(key)
        if existing is not None:
            return existing, False
        values = {field: value for field, value in data.items() if field not in {"campaign_id", "variant_id"}}
        delivery = NotificationDeliveryRecord(id=uuid4(), **values)
        object.__setattr__(delivery, "campaign_id", self.campaign.id)
        object.__setattr__(delivery, "variant_id", self.variant.id)
        self.rows[key] = delivery
        return delivery, True

    async def list_actionable_deliveries(
        self,
        *,
        campaign_id: UUID,
        retry_failed_only: bool,
        after_id: UUID | None,
        limit: int,
    ) -> list[NotificationDeliveryRecord]:
        assert campaign_id == self.campaign.id
        self.list_calls.append(after_id)
        rows = sorted(self.rows.values(), key=lambda row: row.id)
        if retry_failed_only:
            rows = [row for row in rows if row.state == NotificationDeliveryState.FAILED and row.is_retryable]
        else:
            rows = [
                row
                for row in rows
                if row.state in {NotificationDeliveryState.PENDING, NotificationDeliveryState.PROCESSING}
            ]
        if after_id is not None:
            rows = [row for row in rows if row.id > after_id]
        return rows[:limit]

    async def mark_processing(self, delivery: NotificationDeliveryRecord) -> None:
        delivery.state = NotificationDeliveryState.PROCESSING
        delivery.attempt_count = int(delivery.attempt_count) + 1
        delivery.is_retryable = False

    async def mark_delivered(self, delivery: NotificationDeliveryRecord, *, notification_id: UUID) -> None:
        delivery.state = NotificationDeliveryState.DELIVERED
        delivery.notification_id = notification_id

    async def mark_sent(self, delivery: NotificationDeliveryRecord, *, provider_message_id: str | None) -> None:
        delivery.state = NotificationDeliveryState.SENT
        delivery.provider_message_id = provider_message_id

    async def mark_suppressed(self, delivery: NotificationDeliveryRecord, *, reason: str) -> None:
        delivery.state = NotificationDeliveryState.SUPPRESSED
        delivery.failure_code = reason
        delivery.is_retryable = False

    async def mark_failed(
        self,
        delivery: NotificationDeliveryRecord,
        *,
        code: str,
        message: str,
        is_retryable: bool,
    ) -> None:
        delivery.state = NotificationDeliveryState.FAILED
        delivery.failure_code = code
        delivery.failure_message = message
        delivery.is_retryable = is_retryable

    async def find_notification(self, *, recipient_user_id: UUID, dedupe_key: str):  # type: ignore[no-untyped-def]
        _ = recipient_user_id, dedupe_key
        return None

    async def settle_campaign(self, campaign: NotificationCampaignRecord) -> dict[str, int]:
        rows = list(self.rows.values())
        campaign.recipient_count = len({row.recipient_user_id for row in rows})
        campaign.delivered_count = sum(row.state == NotificationDeliveryState.DELIVERED for row in rows)
        campaign.sent_count = campaign.delivered_count + sum(
            row.state == NotificationDeliveryState.SENT for row in rows
        )
        campaign.failed_count = sum(row.state == NotificationDeliveryState.FAILED for row in rows)
        campaign.suppressed_count = sum(row.state == NotificationDeliveryState.SUPPRESSED for row in rows)
        campaign.pending_count = sum(
            row.state in {NotificationDeliveryState.PENDING, NotificationDeliveryState.PROCESSING} for row in rows
        )
        campaign.state = (
            NotificationCampaignState.PARTIALLY_FAILED if campaign.failed_count else NotificationCampaignState.COMPLETED
        )
        return {
            "recipient_count": campaign.recipient_count,
            "sent_count": campaign.sent_count,
            "delivered_count": campaign.delivered_count,
            "failed_count": campaign.failed_count,
        }


class _EmailSender:
    def __init__(self, outcomes: dict[str, SendResult | Exception] | None = None) -> None:
        self.outcomes = outcomes or {}
        self.calls: list[dict[str, Any]] = []

    async def send_template_version(self, **values: Any) -> SendResult:
        self.calls.append(values)
        outcome = self.outcomes.get(str(values["recipient"]))
        if isinstance(outcome, Exception):
            raise outcome
        return outcome or SendResult(
            success=True,
            provider_id="smtp",
            message_id=f"message-{len(self.calls)}",
        )


def _install_preferences(monkeypatch: pytest.MonkeyPatch, *, enabled: bool) -> None:
    async def is_enabled(**values: Any) -> bool:
        assert values["event_name"] == "system.broadcast"
        return enabled

    monkeypatch.setattr(handler_module, "is_notification_channel_enabled_for_event", is_enabled)


def _campaign(*, presentations: tuple[NotificationPresentation, ...]) -> NotificationCampaignRecord:
    campaign = NotificationCampaignRecord(
        id=uuid4(),
        name="Release announcement",
        owner_user_id=uuid4(),
        revision=1,
        state=NotificationCampaignState.SCHEDULED,
        audience={"kind": "all_active_users"},
        channels=[
            str(
                NotificationCampaignChannel.EMAIL
                if presentation == NotificationPresentation.EMAIL
                else NotificationCampaignChannel.IN_APP
            )
            for presentation in presentations
        ],
        presentations=[str(presentation) for presentation in presentations],
        fallback_locale="en-US",
    )
    campaign._saved_in_db = True
    return campaign


def _variant(campaign: NotificationCampaignRecord) -> NotificationCampaignVariantRecord:
    variant = NotificationCampaignVariantRecord(
        id=uuid4(),
        locale="en-US",
        revision=1,
        is_fallback=True,
        inbox_payload={"title": "Release ready", "body": "Review the new capabilities."},
        email_payload={
            "template_key": "system.release",
            "template_version": 3,
            "variables": {"release": "2026.7"},
        },
    )
    object.__setattr__(variant, "campaign_id", campaign.id)
    variant._saved_in_db = True
    return variant


def _user(email: str) -> User:
    return User(
        id=uuid4(),
        username=email.split("@", maxsplit=1)[0],
        email=email,
        status=UserStatus.ACTIVE,
    )


def _handler(
    *,
    campaign: NotificationCampaignRecord,
    variant: NotificationCampaignVariantRecord,
    users: list[User],
    email_sender: _EmailSender | None = None,
) -> tuple[NotificationCampaignJobHandler, _DeliveryRepository, _EmailSender]:
    deliveries = _DeliveryRepository(campaign=campaign, variant=variant, users=users)
    sender = email_sender or _EmailSender()
    handler = NotificationCampaignJobHandler(
        settings=Settings(app_env="test", database={"enabled": False}),
        email_sender=cast(CampaignEmailSender, sender),
        campaigns=cast(
            NotificationCampaignRepository,
            _CampaignRepository(variants=[variant], users=users),
        ),
        deliveries=cast(NotificationCampaignDeliveryRepository, deliveries),
    )
    return handler, deliveries, sender


def _job_context(context: _Context) -> JobExecutionContext[NotificationCampaignJobTarget, NotificationCampaignJobInput]:
    return cast(JobExecutionContext[NotificationCampaignJobTarget, NotificationCampaignJobInput], context)


@pytest.mark.asyncio
async def test_audience_materialization_is_idempotent_per_recipient_and_presentation() -> None:
    campaign = _campaign(presentations=(NotificationPresentation.INBOX, NotificationPresentation.EMAIL))
    variant = _variant(campaign)
    user = _user("recipient@example.com")
    handler, deliveries, _ = _handler(campaign=campaign, variant=variant, users=[user])
    context = _Context(campaign.id)

    await handler._create_delivery_ledger(campaign=campaign, context=_job_context(context))
    await handler._create_delivery_ledger(campaign=campaign, context=_job_context(context))

    assert len(deliveries.rows) == 2
    assert {row.presentation for row in deliveries.rows.values()} == {
        NotificationPresentation.INBOX,
        NotificationPresentation.EMAIL,
    }


@pytest.mark.asyncio
async def test_execute_delivers_in_app_notification_and_persists_delivery_identity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    campaign = _campaign(presentations=(NotificationPresentation.INBOX,))
    campaign.priority = 42
    campaign.schedule_at = datetime(2026, 7, 23, 8, 0, tzinfo=UTC)
    campaign.display_start_at = datetime(2026, 7, 23, 9, 0, tzinfo=UTC)
    campaign.display_end_at = datetime(2026, 7, 30, 9, 0, tzinfo=UTC)
    variant = _variant(campaign)
    user = _user("inbox@example.com")
    notification_id = uuid4()
    captured_target_meta: dict[str, Any] = {}
    _install_preferences(monkeypatch, enabled=True)

    async def create_notification(**values: Any):  # type: ignore[no-untyped-def]
        target_meta = values["target_meta"]
        captured_target_meta.update(target_meta)
        assert {key: value for key, value in target_meta.items() if key != "deliveryId"} == {
            "campaignId": str(campaign.id),
            "presentation": "inbox",
            "priority": 42,
            "displayStartAt": "2026-07-23T09:00:00+00:00",
            "displayEndAt": "2026-07-30T09:00:00+00:00",
            "scheduleAt": "2026-07-23T08:00:00+00:00",
            "payload": {
                "title": "Release ready",
                "body": "Review the new capabilities.",
                "severity": "info",
                "action": None,
            },
        }
        return SimpleNamespace(id=notification_id)

    monkeypatch.setattr(handler_module, "create_notification_record", create_notification)
    handler, deliveries, _ = _handler(campaign=campaign, variant=variant, users=[user])

    result = await handler.execute(context=_job_context(_Context(campaign.id)))

    row = next(iter(deliveries.rows.values()))
    assert row.state is NotificationDeliveryState.DELIVERED
    assert row.notification_id == notification_id
    assert captured_target_meta["deliveryId"] == str(row.id)
    assert result == NotificationCampaignJobResult(
        campaign_id=campaign.id,
        campaign_revision=1,
        recipient_count=1,
        sent_count=1,
        delivered_count=1,
        failed_count=0,
    )


@pytest.mark.asyncio
async def test_execute_records_email_success_and_failure_without_rolling_back_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    campaign = _campaign(presentations=(NotificationPresentation.EMAIL,))
    variant = _variant(campaign)
    accepted = _user("accepted@example.com")
    rejected = _user("rejected@example.com")
    sender = _EmailSender({
        accepted.email: SendResult(success=True, provider_id="smtp", message_id="provider-1"),
        rejected.email: SendResult(success=False, provider_id="smtp", error="mailbox unavailable"),
    })
    _install_preferences(monkeypatch, enabled=True)
    handler, deliveries, _ = _handler(
        campaign=campaign,
        variant=variant,
        users=[accepted, rejected],
        email_sender=sender,
    )

    result = await handler.execute(context=_job_context(_Context(campaign.id)))

    states = {row.recipient_user_id: row.state for row in deliveries.rows.values()}
    assert states == {
        accepted.id: NotificationDeliveryState.SENT,
        rejected.id: NotificationDeliveryState.FAILED,
    }
    assert result.sent_count == 1
    assert result.failed_count == 1
    assert campaign.state is NotificationCampaignState.PARTIALLY_FAILED
    assert sender.calls[0]["idempotency_key"].startswith(f"campaign:{campaign.id}:v1:user:")


@pytest.mark.asyncio
async def test_disabled_preference_is_a_visible_suppressed_terminal_outcome(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    campaign = _campaign(presentations=(NotificationPresentation.EMAIL,))
    variant = _variant(campaign)
    user = _user("suppressed@example.com")
    _install_preferences(monkeypatch, enabled=False)
    handler, deliveries, sender = _handler(campaign=campaign, variant=variant, users=[user])

    result = await handler.execute(context=_job_context(_Context(campaign.id)))

    row = next(iter(deliveries.rows.values()))
    assert row.state is NotificationDeliveryState.SUPPRESSED
    assert row.failure_code == "NOTIFICATION_EMAIL_PREFERENCE_DISABLED"
    assert sender.calls == []
    assert result.failed_count == 0
    assert campaign.suppressed_count == 1


@pytest.mark.asyncio
async def test_retry_failed_only_attempts_each_delivery_once_per_job_attempt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    campaign = _campaign(presentations=(NotificationPresentation.EMAIL,))
    campaign.state = NotificationCampaignState.DISPATCHING
    variant = _variant(campaign)
    user = _user("retry@example.com")
    sender = _EmailSender({user.email: RuntimeError("provider offline")})
    _install_preferences(monkeypatch, enabled=True)
    handler, deliveries, _ = _handler(
        campaign=campaign,
        variant=variant,
        users=[user],
        email_sender=sender,
    )
    delivery, _ = await deliveries.create_delivery(
        data={
            "campaign_id": campaign.id,
            "variant_id": variant.id,
            "recipient_user_id": user.id,
            "recipient_locale": "en-US",
            "channel": NotificationCampaignChannel.EMAIL,
            "presentation": NotificationPresentation.EMAIL,
            "idempotency_key": f"campaign:{campaign.id}:retry",
            "state": NotificationDeliveryState.FAILED,
            "is_retryable": True,
        }
    )
    context = _Context(campaign.id, retry_failed_only=True)

    await handler._deliver(campaign=campaign, context=_job_context(context))

    assert delivery.state is NotificationDeliveryState.FAILED
    assert delivery.is_retryable is True
    assert delivery.attempt_count == 1
    assert len(sender.calls) == 1
    assert deliveries.list_calls == [None, delivery.id]


@pytest.mark.asyncio
async def test_reconcile_returns_only_a_terminal_campaign_result() -> None:
    campaign = _campaign(presentations=(NotificationPresentation.INBOX,))
    variant = _variant(campaign)
    handler, _, _ = _handler(campaign=campaign, variant=variant, users=[])
    context = _Context(campaign.id)

    assert await handler.reconcile(context=_job_context(context)) is None

    campaign.state = NotificationCampaignState.COMPLETED
    campaign.recipient_count = 4
    campaign.sent_count = 4
    campaign.delivered_count = 3
    result = await handler.reconcile(context=_job_context(context))

    assert result is not None
    assert result.recipient_count == 4
    assert result.delivered_count == 3


@pytest.mark.asyncio
async def test_cancelled_campaign_cannot_resume_dispatch() -> None:
    campaign = _campaign(presentations=(NotificationPresentation.INBOX,))
    campaign.state = NotificationCampaignState.CANCELLED
    variant = _variant(campaign)
    handler, _, _ = _handler(campaign=campaign, variant=variant, users=[])

    with pytest.raises(PermanentJobExecutionError) as rejected:
        await handler.execute(context=_job_context(_Context(campaign.id)))

    assert rejected.value.code == CAMPAIGN_STATE_INVALID_CODE
