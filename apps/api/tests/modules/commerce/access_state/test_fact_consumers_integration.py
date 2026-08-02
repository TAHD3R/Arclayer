from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import ServiceUnavailable
from src.models.commerce.access_facts import CommercialAccessFact, CommercialAccessFactKind
from src.models.hosting.commercial_access import (
    HostingCommercialAccessProjection,
    HostingCommercialAccessState,
    HostingContinuityTarget,
)
from src.models.organization.organization import Organization
from src.models.organization.user import User
from src.models.system.commercial_notification import (
    CommercialLifecycleNotificationChannel,
    CommercialLifecycleNotificationCriticalFailure,
    CommercialLifecycleNotificationDelivery,
    CommercialLifecycleNotificationDeliveryAttempt,
    CommercialLifecycleNotificationState,
)
from src.models.system.notification import NotificationRecord
from src.models.workspaces.workspace import Workspace, WorkspaceMembership
from src.modules.hosting.commercial_access_consumer import HostingCommercialAccessConsumer
from src.modules.system.admin.notifications.commercial_lifecycle_consumer import (
    CommercialLifecycleFact,
    CommercialLifecycleNotificationConsumer,
    CommercialLifecycleRecipient,
    CommercialLifecycleTerminalDeliveryError,
    TortoiseCommercialLifecycleNotificationPersistence,
)


class _EmailSender:
    def __init__(self) -> None:
        self.recipients: list[str] = []

    async def send_notification(self, *, recipient: str, **_kwargs: object) -> object:
        self.recipients.append(recipient)
        return object()


@dataclass(frozen=True)
class _Lease:
    attempt_id: object
    fencing_token: object
    claimed_at: datetime
    lease_until: datetime


def _lease(*, claimed_at: datetime | None = None) -> _Lease:
    started_at = claimed_at or datetime.now(UTC)
    return _Lease(
        attempt_id=uuid4(),
        fencing_token=uuid4(),
        claimed_at=started_at,
        lease_until=started_at + timedelta(minutes=1),
    )


class _FailOnceEmailSender(_EmailSender):
    async def send_notification(self, *, recipient: str, **_kwargs: object) -> object:
        if not self.recipients:
            self.recipients.append(recipient)
            raise RuntimeError("mail unavailable")
        return await super().send_notification(recipient=recipient)


class _TerminalInAppPersistence(TortoiseCommercialLifecycleNotificationPersistence):
    async def create_in_app(self, *, fact, recipient):
        raise CommercialLifecycleTerminalDeliveryError("in-app rejected")


@pytest.mark.usefixtures("db")
async def test_committed_facts_drive_independent_hosting_and_delivery_receipts() -> None:
    user = await User.create(username=f"commercial-fact-{uuid4().hex}", email="commercial-fact@example.com")
    member = await User.create(username=f"commercial-member-{uuid4().hex}", email="member@example.com")
    organization = await Organization.create(
        slug=f"commercial-fact-{uuid4().hex}",
        name="Commercial facts",
        owner_user_id=user.id,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Commercial facts",
        owner_user_id=user.id,
        created_by_user_id=user.id,
    )
    await WorkspaceMembership.create(workspace_id=workspace.id, user_id=user.id)
    await WorkspaceMembership.create(workspace_id=workspace.id, user_id=member.id)
    source_identity = f"provider:stripe:{uuid4()}"
    await CommercialAccessFact.create(
        workspace_id=workspace.id,
        kind=CommercialAccessFactKind.HOSTING_HANDOFF,
        source_identity=source_identity,
        payload={"state": "payment_restricted", "cause": "provider_final_unpaid"},
        effective_at=datetime.now(UTC),
    )
    await CommercialAccessFact.create(
        workspace_id=workspace.id,
        kind=CommercialAccessFactKind.LIFECYCLE_NOTIFICATION,
        source_identity=source_identity,
        payload={"milestone": "payment_restricted", "recovery_deadline": None},
        effective_at=datetime.now(UTC),
    )

    assert await HostingCommercialAccessConsumer().consume(source_identity=source_identity) == (
        HostingCommercialAccessState.CONTINUITY_REQUIRED
    )
    projection = await HostingCommercialAccessProjection.get(workspace_id=workspace.id)
    assert await HostingContinuityTarget.filter(projection_id=projection.id).count() == 0
    assert projection.state == HostingCommercialAccessState.CONTINUITY_REQUIRED

    sender = _EmailSender()
    await CommercialLifecycleNotificationConsumer(
        persistence=TortoiseCommercialLifecycleNotificationPersistence(settings=get_settings()), email_sender=sender
    ).consume(source_identity=source_identity, lease=_lease())
    deliveries = await CommercialLifecycleNotificationDelivery.filter(source_identity=source_identity).all()

    assert sender.recipients == ["commercial-fact@example.com"]
    assert {(delivery.recipient_user_id, delivery.channel, delivery.state) for delivery in deliveries} == {
        (user.id, "in_app", CommercialLifecycleNotificationState.SENT),
        (member.id, "in_app", CommercialLifecycleNotificationState.SENT),
        (user.id, "email", CommercialLifecycleNotificationState.SENT),
    }
    notifications = await NotificationRecord.filter(workspace_id=workspace.id).all()
    assert len(notifications) == 2
    assert all(
        notification.target == {"kind": "workspace_settings", "destination": "plan_usage"}
        for notification in notifications
    )
    in_app_delivery_ids = {
        delivery.notification_id
        for delivery in deliveries
        if delivery.channel == CommercialLifecycleNotificationChannel.IN_APP
    }
    assert in_app_delivery_ids == {notification.id for notification in notifications}


@pytest.mark.usefixtures("db")
async def test_retry_updates_the_existing_delivery_with_append_only_attempts() -> None:
    user = await User.create(username=f"commercial-retry-{uuid4().hex}", email="commercial-retry@example.com")
    organization = await Organization.create(
        slug=f"commercial-retry-{uuid4().hex}",
        name="Commercial retry",
        owner_user_id=user.id,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Commercial retry",
        owner_user_id=user.id,
        created_by_user_id=user.id,
    )
    await WorkspaceMembership.create(workspace_id=workspace.id, user_id=user.id)
    source_identity = f"provider:stripe:{uuid4()}"
    await CommercialAccessFact.create(
        workspace_id=workspace.id,
        kind=CommercialAccessFactKind.LIFECYCLE_NOTIFICATION,
        source_identity=source_identity,
        payload={"milestone": "payment_restricted", "recovery_deadline": None},
        effective_at=datetime.now(UTC),
    )
    sender = _FailOnceEmailSender()
    consumer = CommercialLifecycleNotificationConsumer(
        persistence=TortoiseCommercialLifecycleNotificationPersistence(settings=get_settings()), email_sender=sender
    )

    with pytest.raises(ServiceUnavailable, match="COMMERCIAL_LIFECYCLE_NOTIFICATION_DELIVERY_RETRYABLE"):
        await consumer.consume(source_identity=source_identity, lease=_lease())
    await consumer.consume(source_identity=source_identity, lease=_lease())

    delivery = await CommercialLifecycleNotificationDelivery.get(
        source_identity=source_identity,
        recipient_user_id=user.id,
        channel=CommercialLifecycleNotificationChannel.EMAIL,
    )
    attempts = await CommercialLifecycleNotificationDeliveryAttempt.filter(delivery_id=delivery.id).order_by(
        "attempt_number"
    )
    assert delivery.state == CommercialLifecycleNotificationState.SENT
    assert delivery.attempt_count == 2
    assert [attempt.state for attempt in attempts] == [
        CommercialLifecycleNotificationState.FAILED,
        CommercialLifecycleNotificationState.SENT,
    ]


@pytest.mark.usefixtures("db")
async def test_terminal_billing_contact_failures_create_a_notification_domain_condition() -> None:
    user = await User.create(username=f"commercial-terminal-{uuid4().hex}", email=None)
    organization = await Organization.create(
        slug=f"commercial-terminal-{uuid4().hex}",
        name="Commercial terminal",
        owner_user_id=user.id,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Commercial terminal",
        owner_user_id=user.id,
        created_by_user_id=user.id,
    )
    await WorkspaceMembership.create(workspace_id=workspace.id, user_id=user.id)
    source_identity = f"provider:stripe:{uuid4()}"
    await CommercialAccessFact.create(
        workspace_id=workspace.id,
        kind=CommercialAccessFactKind.LIFECYCLE_NOTIFICATION,
        source_identity=source_identity,
        payload={"milestone": "payment_restricted", "recovery_deadline": None},
        effective_at=datetime.now(UTC),
    )

    await CommercialLifecycleNotificationConsumer(
        persistence=_TerminalInAppPersistence(settings=get_settings()), email_sender=_EmailSender()
    ).consume(source_identity=source_identity, lease=_lease())

    condition = await CommercialLifecycleNotificationCriticalFailure.get(source_identity=source_identity)
    assert condition.workspace_id == workspace.id
    assert condition.failure_code == "COMMERCIAL_LIFECYCLE_BILLING_CONTACTS_UNREACHABLE"


@pytest.mark.usefixtures("db")
async def test_expired_processing_claim_is_recovered_once_under_concurrent_retries() -> None:
    user = await User.create(username=f"commercial-lease-{uuid4().hex}", email="commercial-lease@example.com")
    organization = await Organization.create(
        slug=f"commercial-lease-{uuid4().hex}",
        name="Commercial lease",
        owner_user_id=user.id,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Commercial lease",
        owner_user_id=user.id,
        created_by_user_id=user.id,
    )
    fact = CommercialLifecycleFact(
        workspace_id=workspace.id,
        source_identity=f"provider:stripe:{uuid4()}",
        milestone="payment_restricted",
        recovery_deadline=None,
    )
    recipient = CommercialLifecycleRecipient(id=user.id, email=user.email, is_billing_contact=True)
    persistence = TortoiseCommercialLifecycleNotificationPersistence(settings=get_settings())
    original_lease = _lease()
    original = await persistence.claim(
        fact=fact,
        recipient=recipient,
        channel="email",
        lease=original_lease,
    )
    assert original is not None

    recovery_lease = _lease(claimed_at=original_lease.lease_until)
    recovered = await asyncio.gather(
        persistence.claim(
            fact=fact,
            recipient=recipient,
            channel=CommercialLifecycleNotificationChannel.EMAIL,
            lease=recovery_lease,
        ),
        persistence.claim(
            fact=fact,
            recipient=recipient,
            channel=CommercialLifecycleNotificationChannel.EMAIL,
            lease=recovery_lease,
        ),
    )

    claims = [claim for claim in recovered if claim is not None]
    assert len(claims) == 1
    assert claims[0].attempt_number == 2
    attempts = await CommercialLifecycleNotificationDeliveryAttempt.filter(delivery_id=original.delivery_id).order_by(
        "attempt_number"
    )
    assert [attempt.state for attempt in attempts] == [
        CommercialLifecycleNotificationState.FAILED,
        CommercialLifecycleNotificationState.PROCESSING,
    ]
    assert attempts[0].failure_code == "COMMERCIAL_LIFECYCLE_DELIVERY_CLAIM_EXPIRED"
