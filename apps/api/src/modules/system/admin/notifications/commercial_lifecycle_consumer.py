from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol
from uuid import UUID

from tortoise.expressions import F, Q
from tortoise.transactions import in_transaction

from src.common.constants.rbac import WORKSPACE_COMMERCE_MANAGE
from src.config import Settings
from src.core.exceptions import ServiceUnavailable
from src.core.i18n import t
from src.models.commerce.access_facts import CommercialAccessFact, CommercialAccessFactKind
from src.models.organization.user import User, UserStatus
from src.models.system.commercial_notification import (
    CommercialLifecycleNotificationChannel,
    CommercialLifecycleNotificationCriticalFailure,
    CommercialLifecycleNotificationDelivery,
    CommercialLifecycleNotificationDeliveryAttempt,
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
from src.modules.jobs.execution_schema import JobExecutionLease
from src.modules.system.admin.notifications.catalog import (
    NotificationRecordCreateDisposition,
    NotificationRecordCreateResult,
    create_notification_record,
)
from src.modules.system.admin.notifications.schema import NotificationWorkspaceSettingsTarget


@dataclass(frozen=True)
class CommercialLifecycleRecipient:
    id: UUID
    email: str | None
    is_billing_contact: bool


@dataclass(frozen=True)
class CommercialLifecycleFact:
    workspace_id: UUID
    source_identity: str
    milestone: str
    recovery_deadline: datetime | None


@dataclass(frozen=True)
class CommercialLifecycleDeliveryClaim:
    delivery_id: UUID
    attempt_number: int
    job_attempt_id: UUID
    fencing_token: UUID


class CommercialLifecycleTerminalDeliveryError(Exception):
    """A channel adapter raises this only for a known non-retryable send rejection."""


class CommercialLifecycleCriticalFailureProjector(Protocol):
    """Operational Signal adapter for a persisted notification-domain failure condition."""

    async def project(
        self,
        *,
        source_identity: str,
        workspace_id: UUID,
        milestone: str,
        failure_code: str,
        billing_contact_count: int,
    ) -> None: ...


class CommercialLifecycleNotificationPersistence(Protocol):
    async def load_fact(self, *, source_identity: str) -> CommercialLifecycleFact: ...

    async def list_recipients(self, *, workspace_id: UUID) -> Sequence[CommercialLifecycleRecipient]: ...

    async def claim(
        self,
        *,
        fact: CommercialLifecycleFact,
        recipient: CommercialLifecycleRecipient,
        channel: CommercialLifecycleNotificationChannel,
        lease: JobExecutionLease,
    ) -> CommercialLifecycleDeliveryClaim | None: ...

    async def create_in_app(
        self, *, fact: CommercialLifecycleFact, recipient: CommercialLifecycleRecipient
    ) -> NotificationRecordCreateResult: ...

    async def find_in_app_notification_id(
        self,
        *,
        fact: CommercialLifecycleFact,
        recipient: CommercialLifecycleRecipient,
    ) -> UUID | None: ...

    async def mark_sent(
        self,
        *,
        claim: CommercialLifecycleDeliveryClaim,
        notification_id: UUID | None = None,
    ) -> None: ...

    async def mark_suppressed(
        self,
        *,
        claim: CommercialLifecycleDeliveryClaim,
        reason: str,
    ) -> None: ...

    async def mark_failed(
        self,
        *,
        claim: CommercialLifecycleDeliveryClaim,
        error: Exception,
        is_retryable: bool,
    ) -> None: ...

    async def project_critical_terminal_failure(
        self, *, fact: CommercialLifecycleFact, billing_contact_ids: Sequence[UUID]
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

    async def consume(self, *, source_identity: str, lease: JobExecutionLease) -> None:
        fact = await self._persistence.load_fact(source_identity=source_identity)
        recipients = await self._persistence.list_recipients(workspace_id=fact.workspace_id)
        retry_error: Exception | None = None
        for recipient in recipients:
            in_app_error = await self._deliver_in_app(fact=fact, recipient=recipient, lease=lease)
            if retry_error is None:
                retry_error = in_app_error
            if recipient.is_billing_contact:
                email_error = await self._deliver_email(fact=fact, recipient=recipient, lease=lease)
                if retry_error is None:
                    retry_error = email_error
        await self._persistence.project_critical_terminal_failure(
            fact=fact,
            billing_contact_ids=tuple(recipient.id for recipient in recipients if recipient.is_billing_contact),
        )
        if retry_error is not None:
            raise ServiceUnavailable(error="COMMERCIAL_LIFECYCLE_NOTIFICATION_DELIVERY_RETRYABLE") from retry_error

    async def _deliver_in_app(
        self, *, fact: CommercialLifecycleFact, recipient: CommercialLifecycleRecipient, lease: JobExecutionLease
    ) -> Exception | None:
        channel = CommercialLifecycleNotificationChannel.IN_APP
        claim = await self._persistence.claim(fact=fact, recipient=recipient, channel=channel, lease=lease)
        if claim is None:
            return None
        try:
            result = await self._persistence.create_in_app(fact=fact, recipient=recipient)
        except Exception as exc:
            return await self._record_failure(claim=claim, error=exc)
        if result.disposition == NotificationRecordCreateDisposition.GROUP_SUPPRESSED:
            await self._persistence.mark_suppressed(claim=claim, reason="NOTIFICATION_SYSTEM_POLICY_DISABLED")
            return None
        if result.disposition == NotificationRecordCreateDisposition.PREFERENCE_SUPPRESSED:
            await self._persistence.mark_suppressed(claim=claim, reason="NOTIFICATION_IN_APP_PREFERENCE_DISABLED")
            return None
        try:
            notification_id = self._notification_id(result)
            if notification_id is None:
                notification_id = await self._persistence.find_in_app_notification_id(fact=fact, recipient=recipient)
            if notification_id is None:
                raise RuntimeError("COMMERCIAL_LIFECYCLE_DEDUPLICATED_NOTIFICATION_UNAVAILABLE")
        except Exception as exc:
            return await self._record_failure(claim=claim, error=exc)
        await self._persistence.mark_sent(claim=claim, notification_id=notification_id)
        return None

    @staticmethod
    def _notification_id(result: NotificationRecordCreateResult) -> UUID | None:
        if result.disposition == NotificationRecordCreateDisposition.CREATED:
            if result.record is None:
                raise RuntimeError("COMMERCIAL_LIFECYCLE_NOTIFICATION_CREATE_RESULT_INVALID")
            return UUID(str(result.record.id))
        if result.disposition == NotificationRecordCreateDisposition.DEDUPLICATED:
            return None
        raise RuntimeError("COMMERCIAL_LIFECYCLE_NOTIFICATION_CREATE_RESULT_INVALID")

    async def _deliver_email(
        self, *, fact: CommercialLifecycleFact, recipient: CommercialLifecycleRecipient, lease: JobExecutionLease
    ) -> Exception | None:
        channel = CommercialLifecycleNotificationChannel.EMAIL
        claim = await self._persistence.claim(fact=fact, recipient=recipient, channel=channel, lease=lease)
        if claim is None:
            return None
        if recipient.email is None:
            await self._persistence.mark_suppressed(claim=claim, reason="RECIPIENT_EMAIL_UNAVAILABLE")
            return None
        title, body = _copy(fact=fact, detailed=True)
        try:
            await self._email_sender.send_notification(
                recipient=recipient.email,
                title=title,
                body=body,
                action_to=None,
                action_label=None,
            )
        except Exception as exc:
            return await self._record_failure(claim=claim, error=exc)
        await self._persistence.mark_sent(claim=claim)
        return None

    async def _record_failure(self, *, claim: CommercialLifecycleDeliveryClaim, error: Exception) -> Exception | None:
        is_retryable = not isinstance(error, CommercialLifecycleTerminalDeliveryError)
        await self._persistence.mark_failed(claim=claim, error=error, is_retryable=is_retryable)
        return error if is_retryable else None


class TortoiseCommercialLifecycleNotificationPersistence:
    """Transactional-delivery persistence that is intentionally separate from Campaigns."""

    def __init__(self, *, settings: Settings) -> None:
        self._settings = settings

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
        recovery_deadline = _parse_recovery_deadline(payload.get("recovery_deadline"))
        return CommercialLifecycleFact(
            workspace_id=UUID(str(fact.workspace_id)),
            source_identity=fact.source_identity,
            milestone=milestone,
            recovery_deadline=recovery_deadline,
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
        billing_contact_ids = {UUID(str(workspace.owner_user_id))}
        billing_contact_ids.update(UUID(str(value)) for value in manager_ids)
        recipient_ids = {UUID(str(value)) for value in member_ids}
        recipient_ids.update(billing_contact_ids)
        users = await User.filter(id__in=recipient_ids, status=UserStatus.ACTIVE).order_by("id").all()
        return [
            CommercialLifecycleRecipient(
                id=UUID(str(user.id)),
                email=user.email,
                is_billing_contact=UUID(str(user.id)) in billing_contact_ids,
            )
            for user in users
        ]

    async def claim(
        self,
        *,
        fact: CommercialLifecycleFact,
        recipient: CommercialLifecycleRecipient,
        channel: CommercialLifecycleNotificationChannel,
        lease: JobExecutionLease,
    ) -> CommercialLifecycleDeliveryClaim | None:
        async with in_transaction() as conn:
            delivery, created = await CommercialLifecycleNotificationDelivery.get_or_create(
                source_identity=fact.source_identity,
                recipient_user_id=recipient.id,
                channel=channel,
                defaults={
                    "workspace_id": fact.workspace_id,
                    "milestone": fact.milestone,
                    "state": CommercialLifecycleNotificationState.PROCESSING,
                    "attempt_count": 1,
                    "processing_at": datetime.now(UTC),
                    "claim_job_attempt_id": lease.attempt_id,
                    "claim_fencing_token": lease.fencing_token,
                    "claim_lease_until": lease.lease_until,
                },
                using_db=conn,
            )
            if not created:
                claimed = (
                    await CommercialLifecycleNotificationDelivery
                    .filter(id=delivery.id)
                    .filter(
                        Q(state=CommercialLifecycleNotificationState.PENDING)
                        | Q(
                            state=CommercialLifecycleNotificationState.FAILED,
                            is_retryable=True,
                        )
                        | Q(
                            state=CommercialLifecycleNotificationState.PROCESSING,
                            claim_lease_until__lte=lease.claimed_at,
                        )
                    )
                    .using_db(conn)
                    .update(
                        state=CommercialLifecycleNotificationState.PROCESSING,
                        processing_at=datetime.now(UTC),
                        attempt_count=F("attempt_count") + 1,
                        failure_code=None,
                        failure_message=None,
                        is_retryable=False,
                        claim_job_attempt_id=lease.attempt_id,
                        claim_fencing_token=lease.fencing_token,
                        claim_lease_until=lease.lease_until,
                    )
                )
                if claimed != 1:
                    return None
                if delivery.state == CommercialLifecycleNotificationState.PROCESSING:
                    stale_attempt = (
                        await CommercialLifecycleNotificationDeliveryAttempt
                        .filter(
                            delivery_id=delivery.id,
                            attempt_number=delivery.attempt_count,
                            state=CommercialLifecycleNotificationState.PROCESSING,
                        )
                        .using_db(conn)
                        .update(
                            state=CommercialLifecycleNotificationState.FAILED,
                            completed_at=lease.claimed_at,
                            failure_code="COMMERCIAL_LIFECYCLE_DELIVERY_CLAIM_EXPIRED",
                            failure_message="Delivery claim expired before its worker completed",
                        )
                    )
                    if stale_attempt != 1:
                        raise ServiceUnavailable(error="COMMERCIAL_LIFECYCLE_DELIVERY_ATTEMPT_UNAVAILABLE")
                delivery = await CommercialLifecycleNotificationDelivery.get(id=delivery.id, using_db=conn)
            claim = CommercialLifecycleDeliveryClaim(
                delivery_id=UUID(str(delivery.id)),
                attempt_number=int(delivery.attempt_count),
                job_attempt_id=UUID(str(lease.attempt_id)),
                fencing_token=UUID(str(lease.fencing_token)),
            )
            await CommercialLifecycleNotificationDeliveryAttempt.create(
                delivery_id=claim.delivery_id,
                attempt_number=claim.attempt_number,
                state=CommercialLifecycleNotificationState.PROCESSING,
                using_db=conn,
            )
            return claim

    async def create_in_app(
        self,
        *,
        fact: CommercialLifecycleFact,
        recipient: CommercialLifecycleRecipient,
    ) -> NotificationRecordCreateResult:
        title, body = _copy(fact=fact, detailed=recipient.is_billing_contact)
        return await create_notification_record(
            settings=self._settings,
            workspace_id=fact.workspace_id,
            recipient_user_id=recipient.id,
            category=NotificationCategory.SYSTEM,
            title=title,
            body=body,
            target=NotificationWorkspaceSettingsTarget(destination="plan_usage"),
            event_name="commerce.lifecycle.committed",
            dedupe_key=f"commerce:{fact.source_identity}:in_app",
        )

    async def find_in_app_notification_id(
        self,
        *,
        fact: CommercialLifecycleFact,
        recipient: CommercialLifecycleRecipient,
    ) -> UUID | None:
        row = await NotificationRecord.filter(
            workspace_id=fact.workspace_id,
            recipient_user_id=recipient.id,
            dedupe_key=f"commerce:{fact.source_identity}:in_app",
        ).first()
        return UUID(str(row.id)) if row is not None else None

    async def mark_sent(
        self,
        *,
        claim: CommercialLifecycleDeliveryClaim,
        notification_id: UUID | None = None,
    ) -> None:
        fields: dict[str, Any] = {"notification_id": notification_id} if notification_id is not None else {}
        await self._settle_attempt(claim=claim, state=CommercialLifecycleNotificationState.SENT, fields=fields)

    async def mark_suppressed(
        self,
        *,
        claim: CommercialLifecycleDeliveryClaim,
        reason: str,
    ) -> None:
        await self._settle_attempt(
            claim=claim,
            state=CommercialLifecycleNotificationState.SUPPRESSED,
            fields={"failure_code": reason},
        )

    async def mark_failed(
        self,
        *,
        claim: CommercialLifecycleDeliveryClaim,
        error: Exception,
        is_retryable: bool,
    ) -> None:
        await self._settle_attempt(
            claim=claim,
            state=CommercialLifecycleNotificationState.FAILED,
            fields={
                "failure_code": type(error).__name__,
                "failure_message": str(error)[:512],
                "is_retryable": is_retryable,
            },
        )

    async def project_critical_terminal_failure(
        self, *, fact: CommercialLifecycleFact, billing_contact_ids: Sequence[UUID]
    ) -> None:
        if not billing_contact_ids:
            return
        terminal_count = await CommercialLifecycleNotificationDelivery.filter(
            source_identity=fact.source_identity,
            recipient_user_id__in=billing_contact_ids,
            state__in=[
                CommercialLifecycleNotificationState.SUPPRESSED,
                CommercialLifecycleNotificationState.FAILED,
            ],
            is_retryable=False,
        ).count()
        if terminal_count != len(billing_contact_ids) * 2:
            return
        await CommercialLifecycleNotificationCriticalFailure.get_or_create(
            source_identity=fact.source_identity,
            defaults={
                "workspace_id": fact.workspace_id,
                "milestone": fact.milestone,
                "failure_code": "COMMERCIAL_LIFECYCLE_BILLING_CONTACTS_UNREACHABLE",
                "billing_contact_count": len(billing_contact_ids),
            },
        )

    async def _settle_attempt(
        self,
        *,
        claim: CommercialLifecycleDeliveryClaim,
        state: CommercialLifecycleNotificationState,
        fields: dict[str, Any],
    ) -> None:
        now = datetime.now(UTC)
        updates = {"state": state, "processing_at": None, "failure_code": None, "failure_message": None, **fields}
        async with in_transaction() as conn:
            updated = (
                await CommercialLifecycleNotificationDelivery
                .filter(
                    id=claim.delivery_id,
                    state=CommercialLifecycleNotificationState.PROCESSING,
                    attempt_count=claim.attempt_number,
                    claim_job_attempt_id=claim.job_attempt_id,
                    claim_fencing_token=claim.fencing_token,
                )
                .using_db(conn)
                .update(**updates)
            )
            if updated != 1:
                raise ServiceUnavailable(error="COMMERCIAL_LIFECYCLE_DELIVERY_CLAIM_LOST")
            attempt_updated = (
                await CommercialLifecycleNotificationDeliveryAttempt
                .filter(
                    delivery_id=claim.delivery_id,
                    attempt_number=claim.attempt_number,
                )
                .using_db(conn)
                .update(
                    state=state,
                    completed_at=now,
                    failure_code=updates.get("failure_code"),
                    failure_message=updates.get("failure_message"),
                )
            )
            if attempt_updated != 1:
                raise ServiceUnavailable(error="COMMERCIAL_LIFECYCLE_DELIVERY_ATTEMPT_UNAVAILABLE")


def _copy(*, fact: CommercialLifecycleFact, detailed: bool) -> tuple[str, str]:
    key = {
        "payment_grace_started": "COMMERCIAL_LIFECYCLE_PAYMENT_GRACE",
        "payment_restricted": "COMMERCIAL_LIFECYCLE_PAYMENT_RESTRICTED",
        "payment_recovered": "COMMERCIAL_LIFECYCLE_PAYMENT_RECOVERED",
    }.get(fact.milestone)
    if key is None:
        raise ValueError("COMMERCIAL_LIFECYCLE_MILESTONE_INVALID")
    body = t("commerce", f"{key}_BODY")
    if detailed and fact.recovery_deadline is not None:
        body = t(
            "commerce",
            f"{key}_DETAIL_BODY",
            recovery_deadline=fact.recovery_deadline.isoformat(),
        )
    return t("commerce", f"{key}_TITLE"), body


def _parse_recovery_deadline(value: object) -> datetime | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ServiceUnavailable(error="COMMERCIAL_LIFECYCLE_FACT_INVALID")
    try:
        deadline = datetime.fromisoformat(value)
    except ValueError as exc:
        raise ServiceUnavailable(error="COMMERCIAL_LIFECYCLE_FACT_INVALID") from exc
    if deadline.tzinfo is None:
        raise ServiceUnavailable(error="COMMERCIAL_LIFECYCLE_FACT_INVALID")
    return deadline.astimezone(UTC)
