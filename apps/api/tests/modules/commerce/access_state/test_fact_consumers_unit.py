from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID, uuid4

import pytest


@dataclass(frozen=True)
class _Recipient:
    id: UUID
    email: str | None


class _NotificationPersistence:
    def __init__(self, *, fact, recipients: list[_Recipient]) -> None:
        self.fact = fact
        self.recipients = recipients
        self.claimed: set[tuple[UUID, str]] = set()
        self.sent: list[tuple[UUID, str]] = []
        self.failed: list[tuple[UUID, str]] = []
        self.suppressed: list[tuple[UUID, str]] = []

    async def load_fact(self, *, source_identity: str):
        assert source_identity == self.fact.source_identity
        return self.fact

    async def list_recipients(self, *, workspace_id: UUID):
        assert workspace_id == self.fact.workspace_id
        return self.recipients

    async def claim(self, *, fact, recipient, channel):
        key = (recipient.id, channel.value)
        if key in self.claimed:
            return False
        self.claimed.add(key)
        return True

    async def create_in_app(self, *, fact, recipient):
        if recipient.id == self.recipients[1].id:
            raise RuntimeError("in-app unavailable")
        return uuid4()

    async def mark_sent(self, *, recipient_user_id, channel, **_kwargs):
        self.sent.append((recipient_user_id, channel.value))

    async def mark_suppressed(self, *, recipient_user_id, channel, **_kwargs):
        self.suppressed.append((recipient_user_id, channel.value))

    async def mark_failed(self, *, recipient_user_id, channel, **_kwargs):
        self.failed.append((recipient_user_id, channel.value))


class _EmailSender:
    def __init__(self) -> None:
        self.sent_to: list[str] = []

    async def send_notification(self, *, recipient: str, **_kwargs):
        if recipient == "failure@example.com":
            raise RuntimeError("mail unavailable")
        self.sent_to.append(recipient)
        return object()


def test_fact_consumer_progress_uses_the_durable_job_progress_contract() -> None:
    from src.modules.commerce.access_state.fact_consumer_job_handler import _progress

    progress = _progress("consuming", 0)

    assert progress.phase == "consuming"
    assert progress.progress_completed == 0
    assert progress.progress_total == 1


@pytest.mark.asyncio
async def test_committed_lifecycle_fact_dispatches_once_per_recipient_channel_and_exposes_failures() -> None:
    from src.modules.system.admin.notifications.commercial_lifecycle_consumer import (
        CommercialLifecycleFact,
        CommercialLifecycleNotificationConsumer,
    )

    recipients = [_Recipient(uuid4(), "owner@example.com"), _Recipient(uuid4(), "failure@example.com")]
    fact = CommercialLifecycleFact(
        workspace_id=uuid4(), source_identity="provider:stripe:evt_1", milestone="payment_restricted"
    )
    persistence = _NotificationPersistence(fact=fact, recipients=recipients)
    sender = _EmailSender()
    consumer = CommercialLifecycleNotificationConsumer(persistence=persistence, email_sender=sender)

    await consumer.consume(source_identity=fact.source_identity)
    await consumer.consume(source_identity=fact.source_identity)

    assert sender.sent_to == ["owner@example.com"]
    assert persistence.sent == [(recipients[0].id, "in_app"), (recipients[0].id, "email")]
    assert persistence.failed == [(recipients[1].id, "in_app"), (recipients[1].id, "email")]


def test_hosting_consumer_requires_hosting_follow_up_without_claiming_restoration() -> None:
    from src.models.hosting.commercial_access import HostingCommercialAccessState
    from src.modules.hosting.commercial_access_consumer import HostingCommercialAccessConsumer

    restricted = HostingCommercialAccessConsumer._next_state({"state": "payment_restricted"})
    recovered = HostingCommercialAccessConsumer._next_state({"state": "normal"})

    assert restricted == HostingCommercialAccessState.CONTINUITY_REQUIRED
    assert recovered == HostingCommercialAccessState.RESTORATION_REQUIRED
