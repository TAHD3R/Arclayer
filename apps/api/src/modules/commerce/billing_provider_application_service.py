from __future__ import annotations

from datetime import UTC, datetime
from typing import Protocol, cast
from uuid import NAMESPACE_URL, UUID, uuid5

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError

from src.common.schemas import BaseSchema
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, ServiceUnavailable
from src.core.services.base import BaseService
from src.models.commerce.billing import (
    BillingProviderMode,
    CommercePlanRevision,
    CommercePlanRevisionPrice,
    CommerceProviderEventApplication,
    PlanRevisionStatus,
    WorkspaceCreditAccount,
    WorkspaceSubscription,
)
from src.modules.commerce.access_state.composition import (
    CommercialAccessStateComposition,
    build_commercial_access_state_composition,
)
from src.modules.commerce.access_state.schema import ProviderDunningFactKind, VerifiedProviderDunningFact
from src.modules.commerce.billing_connector import ProviderSubscription
from src.modules.commerce.convergence.composition import build_plan_access_convergence_service
from src.modules.commerce.convergence.schema import ProviderConfirmedConvergenceApplication
from src.modules.commerce.convergence.service import PlanAccessConvergenceService
from src.modules.commerce.subscription_transitions.provider_confirmation import (
    TortoiseProviderConfirmedConvergenceResolver,
)
from src.modules.commerce.subscription_transitions.schema import ProviderConfirmedTransitionEvidence


class VerifiedBillingProviderEvent(BaseSchema):
    """Signature-verification evidence carried from the inbox boundary into Commerce."""

    provider_event_id: str
    payload_sha256: str
    signature_reference: str


class BillingProviderSubscriptionApplicator(Protocol):
    async def apply_provider_subscription(
        self,
        *,
        subscription: ProviderSubscription,
        provider: str,
        provider_mode: str,
        provider_account_id: str,
        verified_event: VerifiedBillingProviderEvent,
    ) -> None: ...


class ProviderConfirmedConvergenceResolver(Protocol):
    async def resolve(
        self,
        *,
        workspace_id: UUID,
        evidence: ProviderConfirmedTransitionEvidence,
        provider_event_id: str,
        correlation_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> ProviderConfirmedConvergenceApplication: ...


class _ProviderApplicationIdentity(Protocol):
    workspace_id: UUID
    subscription_id: UUID
    plan_revision_id: UUID


class BillingProviderSubscriptionApplicationService(BaseService):
    """Applies exact Provider facts without interpreting a mutable Plan code."""

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        access_state: CommercialAccessStateComposition | None = None,
        convergence: PlanAccessConvergenceService | None = None,
        convergence_resolver: ProviderConfirmedConvergenceResolver | None = None,
    ) -> None:
        super().__init__(settings)
        self._access_state = access_state or build_commercial_access_state_composition(settings=self.settings)
        self._convergence = convergence or build_plan_access_convergence_service(self.settings)
        self._convergence_resolver = convergence_resolver or TortoiseProviderConfirmedConvergenceResolver()

    async def apply_provider_subscription(
        self,
        *,
        subscription: ProviderSubscription,
        provider: str,
        provider_mode: str,
        provider_account_id: str,
        verified_event: VerifiedBillingProviderEvent,
    ) -> None:
        if subscription.event_id != verified_event.provider_event_id:
            raise BadRequest(error="BILLING_WEBHOOK_EVENT_CONFLICT")
        try:
            mode = BillingProviderMode(provider_mode)
        except ValueError as exc:
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID") from exc
        reconciliation_error: Conflict | None = None
        async with self.tx() as conn:
            workspace_subscription = await self._lock_subscription(
                workspace_id=subscription.workspace_id,
                conn=conn,
            )
            await self._validate_exact_price(
                subscription=subscription,
                provider=provider,
                provider_mode=mode,
                conn=conn,
            )
            application, is_new = await self._claim_event(
                subscription=subscription,
                workspace_subscription=workspace_subscription,
                provider=provider,
                provider_mode=mode,
                provider_account_id=provider_account_id,
                conn=conn,
            )
            try:
                await self._apply_confirmed_convergence(
                    subscription=subscription,
                    provider_event_id=verified_event.provider_event_id,
                    workspace_subscription=workspace_subscription,
                    conn=conn,
                )
            except Conflict as exc:
                await self._record_reconciliation_failure(application=application, conn=conn)
                reconciliation_error = exc
            if reconciliation_error is None and not is_new:
                self._validate_existing_application(
                    application=application,
                    workspace_subscription=workspace_subscription,
                    subscription=subscription,
                )
            elif reconciliation_error is None:
                self._validate_subscription_order(
                    current=workspace_subscription,
                    incoming=subscription,
                )
                credit_account = await self._lock_credit_account(
                    workspace_id=subscription.workspace_id,
                    subscription_id=workspace_subscription.id,
                    conn=conn,
                )
                self._apply_subscription(
                    current=workspace_subscription,
                    incoming=subscription,
                    provider=provider,
                    provider_mode=mode,
                )
                self._apply_credit_account(
                    account=credit_account,
                    incoming=subscription,
                    provider=provider,
                )
                await workspace_subscription.save(using_db=conn)
                await credit_account.save(using_db=conn)
                application.applied_at = datetime.now(UTC)
                application.result_code = "applied"
                await application.save(update_fields=["applied_at", "result_code"], using_db=conn)
        if reconciliation_error is not None:
            raise reconciliation_error
        await self._apply_verified_dunning_fact(
            subscription=subscription,
            provider=provider,
            verified_event=verified_event,
        )

    async def _apply_confirmed_convergence(
        self,
        *,
        subscription: ProviderSubscription,
        provider_event_id: str,
        workspace_subscription: WorkspaceSubscription,
        conn: BaseDBAsyncClient,
    ) -> None:
        evidence = subscription.confirmed_transition
        if evidence is None:
            if (
                subscription.dunning_event is None
                and workspace_subscription.plan_revision_id != subscription.plan_revision_id
            ):
                raise Conflict(error="SUBSCRIPTION_TRANSITION_PROVIDER_RECONCILIATION_REQUIRED")
            return
        request = await self._convergence_resolver.resolve(
            workspace_id=subscription.workspace_id,
            evidence=evidence,
            provider_event_id=provider_event_id,
            correlation_id=uuid5(NAMESPACE_URL, f"billing-provider-event:{provider_event_id}"),
            conn=conn,
        )
        await self._convergence.apply_provider_confirmed(request=request, conn=conn)
        await workspace_subscription.refresh_from_db(using_db=conn)

    @staticmethod
    async def _record_reconciliation_failure(
        *, application: CommerceProviderEventApplication, conn: BaseDBAsyncClient
    ) -> None:
        application.result_code = "provider_reconciliation_required"
        await application.save(update_fields=["result_code"], using_db=conn)

    async def _apply_verified_dunning_fact(
        self,
        *,
        subscription: ProviderSubscription,
        provider: str,
        verified_event: VerifiedBillingProviderEvent,
    ) -> None:
        dunning = subscription.dunning_event
        if dunning is None:
            return
        projection = await self._access_state.current_projection(workspace_id=subscription.workspace_id)
        if projection is None:
            raise ServiceUnavailable(error="COMMERCIAL_ACCESS_STATE_UNAVAILABLE")
        source = VerifiedProviderDunningFact(
            workspace_id=subscription.workspace_id,
            subscription_revision_id=subscription.plan_revision_id,
            provider=provider,
            provider_event_id=verified_event.provider_event_id,
            provider_period_id=dunning.provider_period_id,
            kind=ProviderDunningFactKind(dunning.kind),
            occurred_at=dunning.occurred_at,
            recovery_deadline=dunning.recovery_deadline,
            source_payload_sha256=verified_event.payload_sha256,
            signature_reference=verified_event.signature_reference,
        )
        await self._access_state.apply_verified_provider_fact(
            source=source,
            expected_access_revision=projection.access_revision,
            idempotency_key=f"provider:{provider}:{verified_event.provider_event_id}",
        )

    async def _claim_event(
        self,
        *,
        subscription: ProviderSubscription,
        workspace_subscription: WorkspaceSubscription,
        provider: str,
        provider_mode: BillingProviderMode,
        provider_account_id: str,
        conn: BaseDBAsyncClient,
    ) -> tuple[CommerceProviderEventApplication, bool]:
        try:
            return await CommerceProviderEventApplication.get_or_create(
                provider=provider,
                provider_mode=provider_mode,
                provider_account_id=provider_account_id,
                provider_event_id=subscription.event_id,
                defaults={
                    "workspace_id": subscription.workspace_id,
                    "subscription_id": workspace_subscription.id,
                    "plan_revision_id": subscription.plan_revision_id,
                    "provider_period_identity": _provider_period_identity(subscription),
                },
                using_db=conn,
            )
        except IntegrityError:
            application = (
                await CommerceProviderEventApplication
                .filter(
                    provider=provider,
                    provider_mode=provider_mode,
                    provider_account_id=provider_account_id,
                    provider_event_id=subscription.event_id,
                )
                .using_db(conn)
                .first()
            )
            if application is None:
                raise
            return application, False

    @staticmethod
    async def _lock_subscription(*, workspace_id: UUID, conn: BaseDBAsyncClient) -> WorkspaceSubscription:
        subscription = await (
            WorkspaceSubscription.filter(workspace_id=workspace_id).using_db(conn).select_for_update().first()
        )
        if subscription is None:
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
        return subscription

    @staticmethod
    async def _validate_exact_price(
        *,
        subscription: ProviderSubscription,
        provider: str,
        provider_mode: BillingProviderMode,
        conn: BaseDBAsyncClient,
    ) -> None:
        revision = (
            await CommercePlanRevision
            .filter(
                id=subscription.plan_revision_id,
                plan_id=subscription.plan_id,
                status=PlanRevisionStatus.PUBLISHED,
            )
            .using_db(conn)
            .first()
        )
        if revision is None:
            raise BadRequest(error="BILLING_PROVIDER_REVISION_INVALID")
        price_exists = (
            await CommercePlanRevisionPrice
            .filter(
                plan_revision_id=revision.id,
                provider=provider,
                provider_mode=provider_mode,
                billing_cycle=subscription.billing_cycle,
                currency=subscription.currency,
                external_price_id=subscription.external_price_id,
            )
            .using_db(conn)
            .exists()
        )
        if not price_exists:
            raise BadRequest(error="BILLING_PROVIDER_PRICE_INVALID")

    @staticmethod
    async def _lock_credit_account(
        *, workspace_id: UUID, subscription_id: UUID, conn: BaseDBAsyncClient
    ) -> WorkspaceCreditAccount:
        account = await (
            WorkspaceCreditAccount.filter(workspace_id=workspace_id).using_db(conn).select_for_update().first()
        )
        if account is None or account.subscription_id != subscription_id:
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
        return account

    @staticmethod
    def _validate_existing_application(
        *,
        application: CommerceProviderEventApplication,
        workspace_subscription: WorkspaceSubscription,
        subscription: ProviderSubscription,
    ) -> None:
        identity = cast(_ProviderApplicationIdentity, application)
        if (
            identity.workspace_id != subscription.workspace_id
            or identity.subscription_id != workspace_subscription.id
            or identity.plan_revision_id != subscription.plan_revision_id
        ):
            raise BadRequest(error="BILLING_WEBHOOK_EVENT_CONFLICT")

    @staticmethod
    def _validate_subscription_order(*, current: WorkspaceSubscription, incoming: ProviderSubscription) -> None:
        if current.external_subscription_id not in {None, incoming.subscription_id}:
            raise BadRequest(error="BILLING_PROVIDER_SUBSCRIPTION_MISMATCH")
        if (
            current.external_subscription_id == incoming.subscription_id
            and current.current_period_end > incoming.current_period_end
        ):
            raise BadRequest(error="BILLING_PROVIDER_EVENT_OUT_OF_ORDER")

    @staticmethod
    def _apply_subscription(
        *,
        current: WorkspaceSubscription,
        incoming: ProviderSubscription,
        provider: str,
        provider_mode: BillingProviderMode,
    ) -> None:
        current.plan_revision_id = incoming.plan_revision_id
        current.status = incoming.status
        current.billing_cycle = incoming.billing_cycle
        current.current_period_start = incoming.current_period_start
        current.current_period_end = incoming.current_period_end
        current.cancel_at_period_end = incoming.cancel_at_period_end
        current.billing_provider = provider
        current.provider_mode = provider_mode
        current.external_customer_id = incoming.customer_id
        current.external_subscription_id = incoming.subscription_id

    @staticmethod
    def _apply_credit_account(
        *, account: WorkspaceCreditAccount, incoming: ProviderSubscription, provider: str
    ) -> None:
        account.plan_revision_id = incoming.plan_revision_id
        account.period_start = incoming.current_period_start
        account.period_end = incoming.current_period_end
        account.period_identity = f"provider:{provider}:{incoming.subscription_id}:{incoming.plan_revision_id}:{incoming.current_period_end.isoformat()}"


def _provider_period_identity(subscription: ProviderSubscription) -> str:
    if subscription.dunning_event is not None:
        return subscription.dunning_event.provider_period_id
    return f"subscription:{subscription.subscription_id}:{subscription.current_period_start.isoformat()}"
