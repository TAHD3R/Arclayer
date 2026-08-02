from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import TYPE_CHECKING, TypedDict
from uuid import UUID, uuid4

import pytest

from src.modules.system.admin.notifications.catalog import (
    NotificationRecordCreateDisposition,
    NotificationRecordCreateResult,
)

if TYPE_CHECKING:
    from src.models.system.commercial_notification import CommercialLifecycleNotificationChannel


@dataclass(frozen=True)
class _Recipient:
    id: UUID
    email: str | None
    is_billing_contact: bool


@dataclass(frozen=True)
class _Lease:
    attempt_id: UUID
    fencing_token: UUID
    claimed_at: datetime
    lease_until: datetime


class _ClaimedDelivery(TypedDict):
    id: UUID
    attempt: int
    state: str
    retryable: bool


def _lease(*, claimed_at: datetime | None = None) -> _Lease:
    started_at = claimed_at or datetime.now(UTC)
    return _Lease(
        attempt_id=uuid4(),
        fencing_token=uuid4(),
        claimed_at=started_at,
        lease_until=started_at + timedelta(minutes=1),
    )


class _NotificationPersistence:
    def __init__(
        self,
        *,
        fact,
        recipients: list[_Recipient],
        in_app_failures: dict[UUID, Exception] | None = None,
        in_app_results: dict[UUID, NotificationRecordCreateResult] | None = None,
        existing_notification_ids: dict[UUID, UUID | None] | None = None,
    ) -> None:
        self.fact = fact
        self.recipients = recipients
        self.in_app_failures = in_app_failures or {}
        self.in_app_results = in_app_results or {}
        self.existing_notification_ids = existing_notification_ids or {}
        self.claimed: dict[tuple[UUID, str], _ClaimedDelivery] = {}
        self.sent: list[tuple[UUID, str]] = []
        self.sent_notification_ids: dict[tuple[UUID, str], UUID | None] = {}
        self.failed: list[tuple[UUID, str, bool]] = []
        self.suppressed: list[tuple[UUID, str]] = []
        self.suppression_reasons: list[tuple[UUID, str, str]] = []
        self.critical_failure_checks: list[tuple[UUID, ...]] = []

    async def load_fact(self, *, source_identity: str):
        assert source_identity == self.fact.source_identity
        return self.fact

    async def list_recipients(self, *, workspace_id: UUID):
        assert workspace_id == self.fact.workspace_id
        return self.recipients

    async def claim(
        self,
        *,
        fact,
        recipient: _Recipient,
        channel: CommercialLifecycleNotificationChannel,
        lease: _Lease,
    ):
        key: tuple[UUID, str] = (recipient.id, channel.value)
        delivery = self.claimed.get(key)
        if delivery is None:
            delivery: _ClaimedDelivery = {"id": uuid4(), "attempt": 1, "state": "processing", "retryable": False}
            self.claimed[key] = delivery
        elif delivery["state"] == "failed" and delivery["retryable"]:
            delivery["attempt"] = int(delivery["attempt"]) + 1
            delivery["state"] = "processing"
            delivery["retryable"] = False
        else:
            return None
        from src.modules.system.admin.notifications.commercial_lifecycle_consumer import (
            CommercialLifecycleDeliveryClaim,
        )

        return CommercialLifecycleDeliveryClaim(
            delivery_id=delivery["id"],
            attempt_number=delivery["attempt"],
            job_attempt_id=lease.attempt_id,
            fencing_token=lease.fencing_token,
        )

    async def create_in_app(self, *, fact, recipient):
        error = self.in_app_failures.pop(recipient.id, None)
        if error is not None:
            raise error
        result = self.in_app_results.get(recipient.id)
        if result is not None:
            return result
        return NotificationRecordCreateResult(
            disposition=NotificationRecordCreateDisposition.CREATED,
            record=SimpleNamespace(id=uuid4()),
        )

    async def find_in_app_notification_id(self, *, fact, recipient):
        return self.existing_notification_ids.get(recipient.id)

    async def mark_sent(self, *, claim, notification_id=None):
        key = next(key for key, value in self.claimed.items() if value["id"] == claim.delivery_id)
        self.claimed[key]["state"] = "sent"
        self.sent.append(key)
        self.sent_notification_ids[key] = notification_id

    async def mark_suppressed(self, *, claim, reason, **_kwargs):
        key = next(key for key, value in self.claimed.items() if value["id"] == claim.delivery_id)
        self.claimed[key]["state"] = "suppressed"
        self.suppressed.append(key)
        self.suppression_reasons.append((*key, reason))

    async def mark_failed(self, *, claim, is_retryable, **_kwargs):
        key = next(key for key, value in self.claimed.items() if value["id"] == claim.delivery_id)
        self.claimed[key]["state"] = "failed"
        self.claimed[key]["retryable"] = is_retryable
        self.failed.append((*key, is_retryable))

    async def project_critical_terminal_failure(self, *, fact, billing_contact_ids):
        self.critical_failure_checks.append(tuple(billing_contact_ids))


class _EmailSender:
    def __init__(self, *, failures: dict[str, list[Exception]] | None = None) -> None:
        self.sent_to: list[str] = []
        self.failures = failures or {}

    async def send_notification(self, *, recipient: str, **_kwargs):
        failures = self.failures.get(recipient, [])
        if failures:
            raise failures.pop(0)
        self.sent_to.append(recipient)
        return object()


def test_fact_consumer_progress_uses_the_durable_job_progress_contract() -> None:
    from src.modules.commerce.access_state.fact_consumer_job_handler import _progress

    progress = _progress("consuming", 0)

    assert progress.phase == "consuming"
    assert progress.progress_completed == 0
    assert progress.progress_total == 1


@pytest.mark.asyncio
async def test_retry_reuses_one_delivery_ledger_and_attempt_history() -> None:
    from src.modules.system.admin.notifications.commercial_lifecycle_consumer import (
        CommercialLifecycleFact,
        CommercialLifecycleNotificationConsumer,
    )

    owner = _Recipient(uuid4(), "owner@example.com", True)
    fact = CommercialLifecycleFact(
        workspace_id=uuid4(),
        source_identity="provider:stripe:evt_1",
        milestone="payment_restricted",
        recovery_deadline=datetime.now(UTC),
    )
    persistence = _NotificationPersistence(fact=fact, recipients=[owner])
    sender = _EmailSender(failures={"owner@example.com": [RuntimeError("mail unavailable")]})
    consumer = CommercialLifecycleNotificationConsumer(persistence=persistence, email_sender=sender)

    with pytest.raises(Exception, match="COMMERCIAL_LIFECYCLE_NOTIFICATION_DELIVERY_RETRYABLE"):
        await consumer.consume(source_identity=fact.source_identity, lease=_lease())
    await consumer.consume(source_identity=fact.source_identity, lease=_lease())

    assert sender.sent_to == ["owner@example.com"]
    assert persistence.sent == [(owner.id, "in_app"), (owner.id, "email")]
    assert persistence.failed == [(owner.id, "email", True)]
    assert persistence.claimed[(owner.id, "email")]["attempt"] == 2


@pytest.mark.asyncio
async def test_duplicate_fact_does_not_create_a_second_delivery() -> None:
    from src.modules.system.admin.notifications.commercial_lifecycle_consumer import (
        CommercialLifecycleFact,
        CommercialLifecycleNotificationConsumer,
    )

    owner = _Recipient(uuid4(), "owner@example.com", True)
    fact = CommercialLifecycleFact(uuid4(), "provider:stripe:evt_2", "payment_restricted", None)
    persistence = _NotificationPersistence(fact=fact, recipients=[owner])
    consumer = CommercialLifecycleNotificationConsumer(persistence=persistence, email_sender=_EmailSender())

    await consumer.consume(source_identity=fact.source_identity, lease=_lease())

    assert persistence.sent == [(owner.id, "in_app"), (owner.id, "email")]
    assert persistence.failed == []
    assert persistence.suppressed == []
    assert persistence.critical_failure_checks == [(owner.id,)]
    await consumer.consume(source_identity=fact.source_identity, lease=_lease())

    assert set(persistence.claimed) == {(owner.id, "in_app"), (owner.id, "email")}
    assert persistence.sent == [(owner.id, "in_app"), (owner.id, "email")]


@pytest.mark.asyncio
async def test_role_change_removes_email_from_a_retrying_billing_contact() -> None:
    from src.modules.system.admin.notifications.commercial_lifecycle_consumer import (
        CommercialLifecycleFact,
        CommercialLifecycleNotificationConsumer,
    )

    member = _Recipient(uuid4(), "member@example.com", True)
    fact = CommercialLifecycleFact(uuid4(), "provider:stripe:evt_3", "payment_restricted", None)
    persistence = _NotificationPersistence(fact=fact, recipients=[member])
    sender = _EmailSender(failures={"member@example.com": [RuntimeError("mail unavailable")]})
    consumer = CommercialLifecycleNotificationConsumer(persistence=persistence, email_sender=sender)

    with pytest.raises(Exception, match="COMMERCIAL_LIFECYCLE_NOTIFICATION_DELIVERY_RETRYABLE"):
        await consumer.consume(source_identity=fact.source_identity, lease=_lease())
    persistence.recipients = [_Recipient(member.id, member.email, False)]
    await consumer.consume(source_identity=fact.source_identity, lease=_lease())

    assert sender.sent_to == []
    assert persistence.claimed[(member.id, "email")]["attempt"] == 1


@pytest.mark.asyncio
async def test_ordinary_members_receive_in_app_only() -> None:
    from src.modules.system.admin.notifications.commercial_lifecycle_consumer import (
        CommercialLifecycleFact,
        CommercialLifecycleNotificationConsumer,
    )

    owner = _Recipient(uuid4(), "owner@example.com", True)
    manager = _Recipient(uuid4(), "manager@example.com", True)
    member = _Recipient(uuid4(), "member@example.com", False)
    fact = CommercialLifecycleFact(uuid4(), "provider:stripe:evt_4", "payment_restricted", None)
    persistence = _NotificationPersistence(fact=fact, recipients=[owner, manager, member])
    sender = _EmailSender()
    consumer = CommercialLifecycleNotificationConsumer(persistence=persistence, email_sender=sender)

    await consumer.consume(source_identity=fact.source_identity, lease=_lease())

    assert sender.sent_to == ["owner@example.com", "manager@example.com"]
    assert (member.id, "email") not in persistence.claimed
    assert (member.id, "in_app") in persistence.sent


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("disposition", "reason"),
    [
        (NotificationRecordCreateDisposition.GROUP_SUPPRESSED, "NOTIFICATION_SYSTEM_POLICY_DISABLED"),
        (NotificationRecordCreateDisposition.PREFERENCE_SUPPRESSED, "NOTIFICATION_IN_APP_PREFERENCE_DISABLED"),
    ],
)
async def test_in_app_suppression_is_persisted_as_a_terminal_delivery_state(
    disposition: NotificationRecordCreateDisposition,
    reason: str,
) -> None:
    from src.modules.system.admin.notifications.commercial_lifecycle_consumer import (
        CommercialLifecycleFact,
        CommercialLifecycleNotificationConsumer,
    )

    recipient = _Recipient(uuid4(), None, False)
    fact = CommercialLifecycleFact(uuid4(), "provider:stripe:evt_suppressed", "payment_restricted", None)
    persistence = _NotificationPersistence(
        fact=fact,
        recipients=[recipient],
        in_app_results={
            recipient.id: NotificationRecordCreateResult(disposition=disposition, record=None),
        },
    )
    consumer = CommercialLifecycleNotificationConsumer(persistence=persistence, email_sender=_EmailSender())

    await consumer.consume(source_identity=fact.source_identity, lease=_lease())

    assert persistence.sent == []
    assert persistence.failed == []
    assert persistence.suppressed == [(recipient.id, "in_app")]
    assert persistence.suppression_reasons == [(recipient.id, "in_app", reason)]
    assert persistence.claimed[(recipient.id, "in_app")]["state"] == "suppressed"
    assert persistence.critical_failure_checks == [()]


@pytest.mark.asyncio
async def test_deduplicated_in_app_delivery_uses_the_existing_notification_identity() -> None:
    from src.modules.system.admin.notifications.commercial_lifecycle_consumer import (
        CommercialLifecycleFact,
        CommercialLifecycleNotificationConsumer,
    )

    recipient = _Recipient(uuid4(), None, False)
    notification_id = uuid4()
    fact = CommercialLifecycleFact(uuid4(), "provider:stripe:evt_deduplicated", "payment_restricted", None)
    persistence = _NotificationPersistence(
        fact=fact,
        recipients=[recipient],
        in_app_results={
            recipient.id: NotificationRecordCreateResult(
                disposition=NotificationRecordCreateDisposition.DEDUPLICATED,
                record=None,
            ),
        },
        existing_notification_ids={recipient.id: notification_id},
    )
    consumer = CommercialLifecycleNotificationConsumer(persistence=persistence, email_sender=_EmailSender())

    await consumer.consume(source_identity=fact.source_identity, lease=_lease())

    assert persistence.sent == [(recipient.id, "in_app")]
    assert persistence.failed == []
    assert persistence.sent_notification_ids[(recipient.id, "in_app")] == notification_id


@pytest.mark.asyncio
async def test_missing_deduplicated_in_app_notification_remains_retryable() -> None:
    from src.core.exceptions import ServiceUnavailable
    from src.modules.system.admin.notifications.commercial_lifecycle_consumer import (
        CommercialLifecycleFact,
        CommercialLifecycleNotificationConsumer,
    )

    recipient = _Recipient(uuid4(), None, False)
    fact = CommercialLifecycleFact(uuid4(), "provider:stripe:evt_missing", "payment_restricted", None)
    persistence = _NotificationPersistence(
        fact=fact,
        recipients=[recipient],
        in_app_results={
            recipient.id: NotificationRecordCreateResult(
                disposition=NotificationRecordCreateDisposition.DEDUPLICATED,
                record=None,
            ),
        },
    )
    consumer = CommercialLifecycleNotificationConsumer(persistence=persistence, email_sender=_EmailSender())

    with pytest.raises(ServiceUnavailable, match="COMMERCIAL_LIFECYCLE_NOTIFICATION_DELIVERY_RETRYABLE"):
        await consumer.consume(source_identity=fact.source_identity, lease=_lease())

    assert persistence.sent == []
    assert persistence.failed == [(recipient.id, "in_app", True)]
    assert persistence.claimed[(recipient.id, "in_app")]["retryable"] is True


@pytest.mark.asyncio
async def test_terminal_delivery_failure_records_the_critical_projection_boundary() -> None:
    from src.modules.system.admin.notifications.commercial_lifecycle_consumer import (
        CommercialLifecycleFact,
        CommercialLifecycleNotificationConsumer,
        CommercialLifecycleTerminalDeliveryError,
    )

    owner = _Recipient(uuid4(), None, True)
    fact = CommercialLifecycleFact(uuid4(), "provider:stripe:evt_5", "payment_restricted", None)
    persistence = _NotificationPersistence(
        fact=fact,
        recipients=[owner],
        in_app_failures={owner.id: CommercialLifecycleTerminalDeliveryError("in-app rejected")},
    )
    consumer = CommercialLifecycleNotificationConsumer(persistence=persistence, email_sender=_EmailSender())

    await consumer.consume(source_identity=fact.source_identity, lease=_lease())


def test_lifecycle_fact_rejects_a_naive_recovery_deadline() -> None:
    from src.core.exceptions import ServiceUnavailable
    from src.modules.system.admin.notifications.commercial_lifecycle_consumer import _parse_recovery_deadline

    with pytest.raises(ServiceUnavailable, match="COMMERCIAL_LIFECYCLE_FACT_INVALID"):
        _parse_recovery_deadline("2026-08-01T12:00:00")

    assert _parse_recovery_deadline("2026-08-01T20:00:00+08:00") == datetime(2026, 8, 1, 12, tzinfo=UTC)


def test_hosting_consumer_requires_hosting_follow_up_without_claiming_restoration() -> None:
    from src.models.hosting.commercial_access import HostingCommercialAccessState
    from src.modules.hosting.commercial_access_consumer import HostingCommercialAccessConsumer

    restricted = HostingCommercialAccessConsumer._next_state({"state": "payment_restricted"})
    recovered = HostingCommercialAccessConsumer._next_state({"state": "normal"})

    assert restricted == HostingCommercialAccessState.CONTINUITY_REQUIRED
    assert recovered == HostingCommercialAccessState.RESTORATION_REQUIRED
