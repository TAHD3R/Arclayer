from __future__ import annotations

from datetime import datetime
from typing import Protocol
from uuid import UUID

from pydantic import ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound, ServiceUnavailable
from src.core.services.base import BaseService
from src.models.commerce.billing import BillingProviderMode
from src.models.commerce.payments import (
    CommerceCheckoutOutcomeCommand,
    CommerceCheckoutSession,
    CommerceCheckoutStatus,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.commerce.billing_connector import ProviderCheckoutOutcome
from src.modules.commerce.billing_provider_application_service import VerifiedBillingProviderEvent
from src.modules.commerce.checkout_outcome_repository import TortoiseCheckoutOutcomeRepository


class BillingCheckoutOutcomeApplicationResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    checkout_session_id: UUID
    status: CommerceCheckoutStatus
    revision: int
    changed: bool


class BillingProviderCheckoutOutcomeApplicator(Protocol):
    async def apply_provider_checkout_outcome(
        self,
        *,
        outcome: ProviderCheckoutOutcome,
        provider: str,
        provider_mode: str,
        provider_account_id: str,
        verified_event: VerifiedBillingProviderEvent,
    ) -> BillingCheckoutOutcomeApplicationResult: ...


class BillingCheckoutOutcomeStore(Protocol):
    async def get_command_by_event_id(
        self,
        *,
        provider_event_id: str,
        conn: BaseDBAsyncClient,
        for_update: bool = False,
    ) -> CommerceCheckoutOutcomeCommand | None: ...

    async def get_checkout_for_update(
        self,
        *,
        checkout_session_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> CommerceCheckoutSession | None: ...

    async def save_applied_outcome(
        self,
        *,
        command_id: UUID,
        command_revision: int,
        checkout_session_id: UUID,
        checkout_revision: int,
        result_status: str,
        result_revision: int,
        completed_at: datetime | None,
        processed_at: datetime,
        checkout_changed: bool,
        conn: BaseDBAsyncClient,
    ) -> tuple[int, int]: ...

    async def database_time(self, *, conn: BaseDBAsyncClient) -> datetime: ...


class BillingProviderCheckoutOutcomeApplicationService(BaseService):
    def __init__(
        self,
        *,
        settings: Settings,
        store: BillingCheckoutOutcomeStore | None = None,
    ) -> None:
        super().__init__(settings)
        self._settings = settings
        self._store = store or TortoiseCheckoutOutcomeRepository()

    async def apply_provider_checkout_outcome(
        self,
        *,
        outcome: ProviderCheckoutOutcome,
        provider: str,
        provider_mode: str,
        provider_account_id: str,
        verified_event: VerifiedBillingProviderEvent,
    ) -> BillingCheckoutOutcomeApplicationResult:
        _validate_provider_identity(
            outcome=outcome,
            provider=provider,
            provider_mode=provider_mode,
            provider_account_id=provider_account_id,
            verified_event=verified_event,
        )
        async with self.tx() as conn:
            command = await self._store.get_command_by_event_id(
                provider_event_id=outcome.event_id,
                conn=conn,
                for_update=True,
            )
            if command is None:
                raise NotFound(error="BILLING_CHECKOUT_OUTCOME_COMMAND_NOT_FOUND")
            checkout = await self._store.get_checkout_for_update(
                checkout_session_id=outcome.checkout_session_id,
                conn=conn,
            )
            if checkout is None:
                raise NotFound(error="BILLING_SIMULATED_CHECKOUT_NOT_FOUND")
            _validate_evidence(command=command, checkout=checkout, outcome=outcome)
            replay = _processed_result(command=command, checkout=checkout)
            if replay is not None:
                return replay
            status, revision, completed_at, changed = _next_checkout_state(checkout=checkout, outcome=outcome)
            processed_at = await self._store.database_time(conn=conn)
            checkout_updated, command_updated = await self._store.save_applied_outcome(
                command_id=command.id,
                command_revision=command.revision,
                checkout_session_id=checkout.id,
                checkout_revision=checkout.revision,
                result_status=str(status),
                result_revision=revision,
                completed_at=completed_at,
                processed_at=processed_at,
                checkout_changed=changed,
                conn=conn,
            )
            if command_updated != 1 or (changed and checkout_updated != 1):
                raise Conflict(error="BILLING_CHECKOUT_OUTCOME_REVISION_STALE")
            await write_required_activity_event(
                settings=self._settings,
                payload=ActivityAuditPayload(
                    event_name="commerce.simulated_checkout.outcome_applied",
                    actor_user_id=outcome.actor_user_id,
                    workspace_id=outcome.workspace_id,
                    entity_type="commerce_checkout_session",
                    entity_id=outcome.checkout_session_id,
                    source="job",
                    properties={
                        "outcome": outcome.outcome,
                        "provider_event_id": outcome.event_id,
                        "checkout_status": str(status),
                        "checkout_revision": revision,
                        "changed": changed,
                        "signature_reference": verified_event.signature_reference,
                    },
                ),
                conn=conn,
            )
            return BillingCheckoutOutcomeApplicationResult(
                workspace_id=outcome.workspace_id,
                checkout_session_id=outcome.checkout_session_id,
                status=status,
                revision=revision,
                changed=changed,
            )


def _validate_provider_identity(
    *,
    outcome: ProviderCheckoutOutcome,
    provider: str,
    provider_mode: str,
    provider_account_id: str,
    verified_event: VerifiedBillingProviderEvent,
) -> None:
    if (
        provider != "simulated"
        or provider_mode != BillingProviderMode.TEST
        or provider_account_id != "platform"
        or outcome.event_id != verified_event.provider_event_id
    ):
        raise BadRequest(error="BILLING_CHECKOUT_OUTCOME_EVIDENCE_INVALID")


def _validate_evidence(
    *,
    command: CommerceCheckoutOutcomeCommand,
    checkout: CommerceCheckoutSession,
    outcome: ProviderCheckoutOutcome,
) -> None:
    event_second = int(outcome.occurred_at.timestamp())
    if (
        command.checkout_session_id != outcome.checkout_session_id
        or command.workspace_id != outcome.workspace_id
        or command.actor_user_id != outcome.actor_user_id
        or command.provider_event_id != outcome.event_id
        or str(command.outcome) != outcome.outcome
        or command.expected_revision != outcome.expected_revision
        or int(command.event_created_at.timestamp()) != event_second
        or command.idempotency_key.rsplit(":", 1)[-1] != outcome.command_idempotency_key_hash
        or checkout.workspace_id != outcome.workspace_id
        or checkout.external_session_id != outcome.external_session_id
        or checkout.plan_code != outcome.plan_code
        or checkout.target_plan_revision_id != outcome.plan_revision_id
        or checkout.external_price_id != outcome.external_price_id
        or checkout.request_fingerprint != outcome.checkout_request_fingerprint
        or checkout.provider != "simulated"
        or checkout.provider_mode != BillingProviderMode.TEST
    ):
        raise BadRequest(error="BILLING_CHECKOUT_OUTCOME_EVIDENCE_INVALID")
    if outcome.occurred_at > checkout.expires_at:
        raise Conflict(error="BILLING_CHECKOUT_OUTCOME_EXPIRED")


def _processed_result(
    *,
    command: CommerceCheckoutOutcomeCommand,
    checkout: CommerceCheckoutSession,
) -> BillingCheckoutOutcomeApplicationResult | None:
    if command.processed_at is None:
        return None
    if command.result_status is None or command.result_revision is None:
        raise ServiceUnavailable(error="BILLING_CHECKOUT_OUTCOME_EVIDENCE_INVALID")
    return BillingCheckoutOutcomeApplicationResult(
        workspace_id=command.workspace_id,
        checkout_session_id=checkout.id,
        status=command.result_status,
        revision=command.result_revision,
        changed=str(command.outcome) != "pending",
    )


def _next_checkout_state(
    *,
    checkout: CommerceCheckoutSession,
    outcome: ProviderCheckoutOutcome,
) -> tuple[CommerceCheckoutStatus, int, datetime | None, bool]:
    if checkout.status != CommerceCheckoutStatus.PENDING or checkout.revision != outcome.expected_revision:
        raise Conflict(error="BILLING_CHECKOUT_OUTCOME_REVISION_STALE")
    if outcome.outcome == "pending":
        return CommerceCheckoutStatus.PENDING, checkout.revision, None, False
    status = {
        "succeeded": CommerceCheckoutStatus.COMPLETED,
        "failed": CommerceCheckoutStatus.FAILED,
        "canceled": CommerceCheckoutStatus.CANCELED,
    }[outcome.outcome]
    return status, checkout.revision + 1, outcome.occurred_at, True
