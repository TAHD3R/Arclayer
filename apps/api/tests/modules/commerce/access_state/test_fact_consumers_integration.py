from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from src.models.commerce.access_facts import CommercialAccessFact, CommercialAccessFactKind
from src.models.hosting.commercial_access import HostingCommercialAccessProjection, HostingCommercialAccessState
from src.models.organization.organization import Organization
from src.models.organization.user import User
from src.models.system.commercial_notification import (
    CommercialLifecycleNotificationDelivery,
    CommercialLifecycleNotificationState,
)
from src.models.workspaces.workspace import Workspace, WorkspaceMembership
from src.modules.hosting.commercial_access_consumer import HostingCommercialAccessConsumer
from src.modules.system.admin.notifications.commercial_lifecycle_consumer import (
    CommercialLifecycleNotificationConsumer,
    TortoiseCommercialLifecycleNotificationPersistence,
)


class _EmailSender:
    def __init__(self) -> None:
        self.recipients: list[str] = []

    async def send_notification(self, *, recipient: str, **_kwargs: object) -> object:
        self.recipients.append(recipient)
        return object()


@pytest.mark.usefixtures("db")
async def test_committed_facts_drive_independent_hosting_and_delivery_receipts() -> None:
    user = await User.create(username=f"commercial-fact-{uuid4().hex}", email="commercial-fact@example.com")
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
    assert projection.preserved_release_id is None
    assert projection.state == HostingCommercialAccessState.CONTINUITY_REQUIRED

    sender = _EmailSender()
    await CommercialLifecycleNotificationConsumer(
        persistence=TortoiseCommercialLifecycleNotificationPersistence(), email_sender=sender
    ).consume(source_identity=source_identity)
    deliveries = await CommercialLifecycleNotificationDelivery.filter(source_identity=source_identity).all()

    assert sender.recipients == ["commercial-fact@example.com"]
    assert {(delivery.channel, delivery.state) for delivery in deliveries} == {
        ("in_app", CommercialLifecycleNotificationState.SENT),
        ("email", CommercialLifecycleNotificationState.SENT),
    }
