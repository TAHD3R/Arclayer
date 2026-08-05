from __future__ import annotations

from uuid import UUID

from pydantic import AwareDatetime, ConfigDict, Field
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.core.exceptions import Conflict
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.commerce.billing import BillingCycle, BillingProviderMode
from src.models.commerce.payments import (
    CommerceCheckoutKind,
    CommerceCheckoutOutcome,
    CommerceCheckoutOutcomeCommand,
    CommerceCheckoutSession,
    CommerceCheckoutStatus,
)

_RECONCILIATION_ERROR = "SUBSCRIPTION_TRANSITION_PROVIDER_RECONCILIATION_REQUIRED"


class CheckoutActivationRequest(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    subscription_id: UUID
    target_plan_revision_id: UUID
    plan_code: str = Field(min_length=1, max_length=48)
    provider: str = Field(min_length=1, max_length=32)
    provider_mode: BillingProviderMode
    provider_account_id: str = Field(min_length=1, max_length=255)
    billing_cycle: BillingCycle
    currency: str = Field(min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    amount_micros: int = Field(gt=0)
    external_price_id: str = Field(min_length=1, max_length=255)
    checkout_session_id: UUID
    external_session_id: str = Field(min_length=1, max_length=255)
    checkout_outcome_event_id: str = Field(min_length=1, max_length=255)
    lifecycle_occurred_at: AwareDatetime


class CheckoutActivationRecord(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    checkout_session_id: UUID
    checkout_outcome_command_id: UUID
    actor_user_id: UUID
    completed_at: AwareDatetime


class TortoiseCheckoutActivationRepository(TortoiseORMRepository[CommerceCheckoutOutcomeCommand]):
    """Resolve one completed simulated Checkout into exact Subscription activation evidence."""

    def __init__(self) -> None:
        super().__init__(CommerceCheckoutOutcomeCommand)

    async def resolve(
        self,
        *,
        request: CheckoutActivationRequest,
        conn: BaseDBAsyncClient,
    ) -> CheckoutActivationRecord:
        command = await (
            CommerceCheckoutOutcomeCommand
            .filter(provider_event_id=request.checkout_outcome_event_id)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        checkout = await (
            CommerceCheckoutSession.filter(id=request.checkout_session_id).using_db(conn).select_for_update().first()
        )
        if command is None or checkout is None:
            raise Conflict(error=_RECONCILIATION_ERROR)
        self._validate_command(command=command, checkout=checkout)
        self._validate_checkout(checkout=checkout, request=request)
        completed_at = checkout.completed_at
        if completed_at is None or completed_at > request.lifecycle_occurred_at:
            raise Conflict(error=_RECONCILIATION_ERROR)
        return CheckoutActivationRecord(
            checkout_session_id=UUID(str(checkout.id)),
            checkout_outcome_command_id=UUID(str(command.id)),
            actor_user_id=UUID(str(command.actor_user_id)),
            completed_at=completed_at,
        )

    @staticmethod
    def _validate_command(
        *,
        command: CommerceCheckoutOutcomeCommand,
        checkout: CommerceCheckoutSession,
    ) -> None:
        if (
            command.checkout_session_id != checkout.id
            or command.workspace_id != checkout.workspace_id
            or command.actor_user_id != checkout.actor_user_id
            or command.outcome != CommerceCheckoutOutcome.SUCCEEDED
            or command.result_status != CommerceCheckoutStatus.COMPLETED
            or command.accepted_inbox_id is None
            or command.accepted_job_id is None
            or command.accepted_at is None
            or command.processed_at is None
            or command.result_revision != checkout.revision
            or command.expected_revision + 1 != checkout.revision
            or command.event_created_at != checkout.completed_at
            or command.event_created_at > command.accepted_at
            or command.accepted_at > command.processed_at
        ):
            raise Conflict(error=_RECONCILIATION_ERROR)

    @staticmethod
    def _validate_checkout(
        *,
        checkout: CommerceCheckoutSession,
        request: CheckoutActivationRequest,
    ) -> None:
        if (
            checkout.workspace_id != request.workspace_id
            or checkout.subscription_id != request.subscription_id
            or checkout.target_plan_revision_id != request.target_plan_revision_id
            or checkout.plan_code != request.plan_code
            or checkout.provider != request.provider
            or checkout.provider_mode != request.provider_mode
            or checkout.provider_account_id != request.provider_account_id
            or checkout.kind != CommerceCheckoutKind.SUBSCRIPTION
            or checkout.status != CommerceCheckoutStatus.COMPLETED
            or checkout.billing_cycle != request.billing_cycle
            or checkout.currency != request.currency
            or checkout.amount_micros != request.amount_micros
            or checkout.external_price_id != request.external_price_id
            or checkout.external_session_id != request.external_session_id
            or checkout.completed_at is None
            or checkout.completed_at > checkout.expires_at
        ):
            raise Conflict(error=_RECONCILIATION_ERROR)
