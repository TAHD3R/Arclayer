from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Protocol
from uuid import UUID

from src.common.constants.rbac import WORKSPACE_COMMERCE_MANAGE
from src.core.exceptions import ServiceUnavailable
from src.core.i18n import t
from src.models.commerce.access_facts import CommercialAccessFact, CommercialAccessFactKind
from src.models.organization.user import User, UserStatus
from src.models.system.commercial_notification import (
    CommercialLifecycleNotificationChannel,
    CommercialLifecycleNotificationDelivery,
    CommercialLifecycleNotificationState,
)
from src.models.system.notification import NotificationCategory, NotificationRecord
from src.models.system.rbac import SystemRolePermission
from src.models.workspaces.workspace import (
    Workspace,
    WorkspaceMembership,
    WorkspaceMembershipRole,
    WorkspaceMembershipStatus,
)


@dataclass(frozen=True)
class CommercialLifecycleRecipient:
    id: UUID
    email: str | None


@dataclass(frozen=True)
class CommercialLifecycleFact:
    workspace_id: UUID
    source_identity: str
    milestone: str


class CommercialLifecycleNotificationPersistence(Protocol):
    async def load_fact(self, *, source_identity: str) -> CommercialLifecycleFact: ...

    async def list_recipients(self, *, workspace_id: UUID) -> Sequence[CommercialLifecycleRecipient]: ...

    async def claim(
        self,
        *,
        fact: CommercialLifecycleFact,
        recipient: CommercialLifecycleRecipient,
        channel: CommercialLifecycleNotificationChannel,
    ) -> bool: ...

    async def create_in_app(
        self, *, fact: CommercialLifecycleFact, recipient: CommercialLifecycleRecipient
    ) -> UUID: ...

    async def mark_sent(
        self,
        *,
        source_identity: str,
        recipient_user_id: UUID,
        channel: CommercialLifecycleNotificationChannel,
        notification_id: UUID | None = None,
    ) -> None: ...

    async def mark_suppressed(
        self,
        *,
        source_identity: str,
        recipient_user_id: UUID,
        channel: CommercialLifecycleNotificationChannel,
        reason: str,
    ) -> None: ...

    async def mark_failed(
        self,
        *,
        source_identity: str,
        recipient_user_id: UUID,
        channel: CommercialLifecycleNotificationChannel,
        error: Exception,
    ) -> None: ...


class CommercialLifecycleEmailSender(Protocol):
    async def send_notification(
        self,
        *,
        recipient: str,
        title: str,
        body: str | None,
        action_to: str | None,
        action_label: str | None,
        locale: str | None = None,
    ) -> object: ...


class CommercialLifecycleNotificationConsumer:
    """Delivers only committed Commerce milestones and never mutates their source state."""

    def __init__(
        self,
        *,
        persistence: CommercialLifecycleNotificationPersistence,
        email_sender: CommercialLifecycleEmailSender,
    ) -> None:
        self._persistence = persistence
        self._email_sender = email_sender

    async def consume(self, *, source_identity: str) -> None:
        fact = await self._persistence.load_fact(source_identity=source_identity)
        for recipient in await self._persistence.list_recipients(workspace_id=fact.workspace_id):
            await self._deliver_in_app(fact=fact, recipient=recipient)
            await self._deliver_email(fact=fact, recipient=recipient)

    async def _deliver_in_app(self, *, fact: CommercialLifecycleFact, recipient: CommercialLifecycleRecipient) -> None:
        channel = CommercialLifecycleNotificationChannel.IN_APP
        if not await self._persistence.claim(fact=fact, recipient=recipient, channel=channel):
            return
        try:
            notification_id = await self._persistence.create_in_app(fact=fact, recipient=recipient)
        except Exception as exc:
            await self._persistence.mark_failed(
                source_identity=fact.source_identity,
                recipient_user_id=recipient.id,
                channel=channel,
                error=exc,
            )
            return
        await self._persistence.mark_sent(
            source_identity=fact.source_identity,
            recipient_user_id=recipient.id,
            channel=channel,
            notification_id=notification_id,
        )

    async def _deliver_email(self, *, fact: CommercialLifecycleFact, recipient: CommercialLifecycleRecipient) -> None:
        channel = CommercialLifecycleNotificationChannel.EMAIL
        if not await self._persistence.claim(fact=fact, recipient=recipient, channel=channel):
            return
        if recipient.email is None:
            await self._persistence.mark_suppressed(
                source_identity=fact.source_identity,
                recipient_user_id=recipient.id,
                channel=channel,
                reason="RECIPIENT_EMAIL_UNAVAILABLE",
            )
            return
        title, body = _copy(fact.milestone)
        try:
            await self._email_sender.send_notification(
                recipient=recipient.email,
                title=title,
                body=body,
                action_to="/settings/billing",
                action_label=t("commerce", "COMMERCIAL_LIFECYCLE_NOTIFICATION_ACTION"),
            )
        except Exception as exc:
            await self._persistence.mark_failed(
                source_identity=fact.source_identity,
                recipient_user_id=recipient.id,
                channel=channel,
                error=exc,
            )
            return
        await self._persistence.mark_sent(
            source_identity=fact.source_identity,
            recipient_user_id=recipient.id,
            channel=channel,
        )


class TortoiseCommercialLifecycleNotificationPersistence:
    """Transactional-delivery persistence that is intentionally separate from Campaigns."""

    async def load_fact(self, *, source_identity: str) -> CommercialLifecycleFact:
        fact = await CommercialAccessFact.filter(
            kind=CommercialAccessFactKind.LIFECYCLE_NOTIFICATION,
            source_identity=source_identity,
        ).first()
        if fact is None:
            raise ServiceUnavailable(error="COMMERCIAL_LIFECYCLE_FACT_UNAVAILABLE")
        payload = fact.payload if isinstance(fact.payload, dict) else {}
        milestone = payload.get("milestone")
        if not isinstance(milestone, str):
            raise ServiceUnavailable(error="COMMERCIAL_LIFECYCLE_FACT_INVALID")
        return CommercialLifecycleFact(
            workspace_id=UUID(str(fact.workspace_id)), source_identity=fact.source_identity, milestone=milestone
        )

    async def list_recipients(self, *, workspace_id: UUID) -> Sequence[CommercialLifecycleRecipient]:
        workspace = await Workspace.get_or_none(id=workspace_id, deleted_at=None)
        if workspace is None:
            raise ServiceUnavailable(error="COMMERCIAL_LIFECYCLE_WORKSPACE_UNAVAILABLE")
        member_ids = await WorkspaceMembership.filter(
            workspace_id=workspace_id,
            status=WorkspaceMembershipStatus.ACTIVE,
        ).values_list("user_id", flat=True)
        manager_role_ids = await SystemRolePermission.filter(
            permission__code=WORKSPACE_COMMERCE_MANAGE,
            role__workspace_id=workspace_id,
            role__ended_at=None,
        ).values_list("role_id", flat=True)
        manager_ids = await WorkspaceMembershipRole.filter(
            role_id__in=manager_role_ids,
            membership__workspace_id=workspace_id,
            membership__status=WorkspaceMembershipStatus.ACTIVE,
            ended_at=None,
        ).values_list("membership__user_id", flat=True)
        recipient_ids = {UUID(str(workspace.owner_user_id))}
        recipient_ids.update(UUID(str(value)) for value in member_ids)
        recipient_ids.update(UUID(str(value)) for value in manager_ids)
        users = await User.filter(id__in=recipient_ids, status=UserStatus.ACTIVE).order_by("id").all()
        return [CommercialLifecycleRecipient(id=UUID(str(user.id)), email=user.email) for user in users]

    async def claim(
        self,
        *,
        fact: CommercialLifecycleFact,
        recipient: CommercialLifecycleRecipient,
        channel: CommercialLifecycleNotificationChannel,
    ) -> bool:
        _, created = await CommercialLifecycleNotificationDelivery.get_or_create(
            source_identity=fact.source_identity,
            recipient_user_id=recipient.id,
            channel=channel,
            defaults={"workspace_id": fact.workspace_id, "milestone": fact.milestone},
        )
        return created

    async def create_in_app(self, *, fact: CommercialLifecycleFact, recipient: CommercialLifecycleRecipient) -> UUID:
        title, body = _copy(fact.milestone)
        row, _ = await NotificationRecord.get_or_create(
            workspace_id=fact.workspace_id,
            recipient_user_id=recipient.id,
            dedupe_key=f"commerce:{fact.source_identity}:in_app",
            defaults={
                "category": NotificationCategory.SYSTEM,
                "title": title,
                "body": body,
                "target_to": "/settings/billing",
                "target_meta": {"sourceIdentity": fact.source_identity, "milestone": fact.milestone},
                "event_name": "commerce.lifecycle.committed",
            },
        )
        return UUID(str(row.id))

    async def mark_sent(
        self,
        *,
        source_identity: str,
        recipient_user_id: UUID,
        channel: CommercialLifecycleNotificationChannel,
        notification_id: UUID | None = None,
    ) -> None:
        fields: dict[str, Any] = {
            "state": CommercialLifecycleNotificationState.SENT,
            "failure_code": None,
            "failure_message": None,
        }
        if notification_id is not None:
            fields["notification_id"] = notification_id
        await CommercialLifecycleNotificationDelivery.filter(
            source_identity=source_identity, recipient_user_id=recipient_user_id, channel=channel
        ).update(**fields)

    async def mark_suppressed(
        self,
        *,
        source_identity: str,
        recipient_user_id: UUID,
        channel: CommercialLifecycleNotificationChannel,
        reason: str,
    ) -> None:
        await CommercialLifecycleNotificationDelivery.filter(
            source_identity=source_identity, recipient_user_id=recipient_user_id, channel=channel
        ).update(state=CommercialLifecycleNotificationState.SUPPRESSED, failure_code=reason)

    async def mark_failed(
        self,
        *,
        source_identity: str,
        recipient_user_id: UUID,
        channel: CommercialLifecycleNotificationChannel,
        error: Exception,
    ) -> None:
        await CommercialLifecycleNotificationDelivery.filter(
            source_identity=source_identity, recipient_user_id=recipient_user_id, channel=channel
        ).update(
            state=CommercialLifecycleNotificationState.FAILED,
            failure_code=type(error).__name__,
            failure_message=str(error)[:512],
        )


def _copy(milestone: str) -> tuple[str, str]:
    key = {
        "payment_grace_started": "COMMERCIAL_LIFECYCLE_PAYMENT_GRACE",
        "payment_restricted": "COMMERCIAL_LIFECYCLE_PAYMENT_RESTRICTED",
        "payment_recovered": "COMMERCIAL_LIFECYCLE_PAYMENT_RECOVERED",
    }.get(milestone)
    if key is None:
        raise ValueError("COMMERCIAL_LIFECYCLE_MILESTONE_INVALID")
    return t("commerce", f"{key}_TITLE"), t("commerce", f"{key}_BODY")
