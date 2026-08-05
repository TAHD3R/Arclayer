from __future__ import annotations

from datetime import UTC, datetime
from typing import Protocol, cast
from uuid import NAMESPACE_URL, UUID, uuid5

from pydantic import BaseModel, ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError

from src.common.schemas import BaseSchema
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, ServiceUnavailable
from src.core.services.base import BaseService
from src.models.commerce.billing import (
    BillingProviderMode,
    CommercePlan,
    CommercePlanRevision,
    CommercePlanRevisionPrice,
    CommerceProviderEventApplication,
    CommercialAccessState,
    PlanRevisionStatus,
    SubscriptionStatus,
    WorkspaceCreditAccount,
    WorkspaceSubscription,
)
from src.models.commerce.credit_allocation import PlanPeriodGrantReason
from src.modules.commerce.access_state.composition import (
    CommercialAccessStateComposition,
    build_commercial_access_state_composition,
)
from src.modules.commerce.access_state.dunning_policy import (
    DunningPolicyResolver,
    TortoiseDunningPolicyResolver,
)
from src.modules.commerce.access_state.schema import (
    CommercialAccessStateApplyOutcome,
    ProviderDunningFactKind,
    VerifiedProviderDunningFact,
)
from src.modules.commerce.billing_connector import ProviderSubscription
from src.modules.commerce.checkout_activation_repository import (
    CheckoutActivationRecord,
    CheckoutActivationRequest,
    TortoiseCheckoutActivationRepository,
)
from src.modules.commerce.convergence.composition import build_plan_access_convergence_service
from src.modules.commerce.convergence.schema import ProviderConfirmedConvergenceApplication
from src.modules.commerce.convergence.service import PlanAccessConvergenceService
from src.modules.commerce.provider_payment_projection import (
    ProviderPaymentProjectionCommand,
    ProviderPaymentProjectionService,
    build_provider_payment_projection_service,
)
from src.modules.commerce.provider_period_credit_grant import (
    ProviderPeriodCreditCommand,
    ProviderPeriodCreditGrantService,
    build_provider_period_credit_grant_service,
)
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
    checkout_session_id: UUID | None
    checkout_outcome_command_id: UUID | None
    applied_at: datetime | None
    result_code: str | None


class _ValidatedProviderPrice(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid", frozen=True)

    plan_code: str
    amount_micros: int
    revision: CommercePlanRevision


class BillingProviderSubscriptionApplicationService(BaseService):
    """Applies exact Provider facts without interpreting a mutable Plan code."""

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        access_state: CommercialAccessStateComposition | None = None,
        convergence: PlanAccessConvergenceService | None = None,
        convergence_resolver: ProviderConfirmedConvergenceResolver | None = None,
        checkout_activation: TortoiseCheckoutActivationRepository | None = None,
        dunning_policy: DunningPolicyResolver | None = None,
        period_credits: ProviderPeriodCreditGrantService | None = None,
        payments: ProviderPaymentProjectionService | None = None,
    ) -> None:
        super().__init__(settings)
        self._access_state = access_state or build_commercial_access_state_composition(settings=self.settings)
        self._convergence = convergence or build_plan_access_convergence_service(self.settings)
        self._convergence_resolver = convergence_resolver or TortoiseProviderConfirmedConvergenceResolver()
        self._checkout_activation = checkout_activation or TortoiseCheckoutActivationRepository()
        self._dunning_policy = dunning_policy or TortoiseDunningPolicyResolver()
        self._period_credits = period_credits or build_provider_period_credit_grant_service(settings=self.settings)
        self._payments = payments or build_provider_payment_projection_service(settings=self.settings)

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
            validated_price = await self._validate_exact_price(
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
            if subscription.payment is not None:
                await self._payments.apply(
                    command=ProviderPaymentProjectionCommand(
                        workspace_id=subscription.workspace_id,
                        subscription_id=UUID(str(workspace_subscription.id)),
                        plan_revision_id=subscription.plan_revision_id,
                        application_id=UUID(str(application.id)),
                        provider=provider,
                        provider_mode=mode,
                        provider_account_id=provider_account_id,
                        provider_event_id=verified_event.provider_event_id,
                        payload_sha256=verified_event.payload_sha256,
                        signature_reference=verified_event.signature_reference,
                    ),
                    payment=subscription.payment,
                    conn=conn,
                )
            activation: CheckoutActivationRecord | None = None
            try:
                activation = await self._resolve_checkout_activation(
                    subscription=subscription,
                    workspace_subscription=workspace_subscription,
                    validated_price=validated_price,
                    provider=provider,
                    provider_mode=mode,
                    provider_account_id=provider_account_id,
                    conn=conn,
                )
                await self._persist_activation_evidence(
                    application=application,
                    activation=activation,
                    conn=conn,
                )
                await self._apply_confirmed_convergence(
                    subscription=subscription,
                    provider_event_id=verified_event.provider_event_id,
                    workspace_subscription=workspace_subscription,
                    activation=activation,
                    conn=conn,
                )
            except Conflict as exc:
                await self._record_reconciliation_failure(application=application, conn=conn)
                reconciliation_error = exc
            is_applied_replay = False
            if reconciliation_error is None and not is_new:
                is_applied_replay = self._validate_existing_application(
                    application=application,
                    workspace_subscription=workspace_subscription,
                    subscription=subscription,
                    activation=activation,
                )
            if reconciliation_error is None and not is_applied_replay:
                self._validate_subscription_order(
                    current=workspace_subscription,
                    incoming=subscription,
                )
                grant_reason = self._grant_reason(
                    current=workspace_subscription,
                    incoming=subscription,
                )
                dunning_outcome = await self._apply_verified_dunning_fact(
                    subscription=subscription,
                    provider=provider,
                    provider_mode=mode,
                    provider_account_id=provider_account_id,
                    verified_event=verified_event,
                    conn=conn,
                )
                if dunning_outcome is not None and not dunning_outcome.transitioned:
                    await self._complete_application(
                        application=application,
                        result_code=f"dunning_{dunning_outcome.disposition}",
                        conn=conn,
                    )
                    return
                access_projection = (
                    dunning_outcome.result.projection
                    if dunning_outcome is not None
                    else await self._access_state.current_projection(
                        workspace_id=subscription.workspace_id,
                        conn=conn,
                        for_update=True,
                    )
                )
                if access_projection is None:
                    raise ServiceUnavailable(error="COMMERCIAL_ACCESS_STATE_UNAVAILABLE")
                if (
                    subscription.status is SubscriptionStatus.ACTIVE
                    and access_projection.state != CommercialAccessState.NORMAL
                ):
                    raise Conflict(error="COMMERCIAL_RECOVERY_FACT_REQUIRED")
                credit_account = await self._lock_credit_account(
                    workspace_id=subscription.workspace_id,
                    subscription_id=workspace_subscription.id,
                    conn=conn,
                )
                await self._period_credits.apply(
                    command=ProviderPeriodCreditCommand(
                        workspace_id=subscription.workspace_id,
                        subscription_id=UUID(str(workspace_subscription.id)),
                        plan_revision_id=subscription.plan_revision_id,
                        application_id=UUID(str(application.id)),
                        provider=provider,
                        provider_mode=mode,
                        provider_account_id=provider_account_id,
                        provider_event_id=verified_event.provider_event_id,
                        provider_period_identity=_provider_period_identity(subscription),
                        period_start=subscription.current_period_start,
                        period_end=subscription.current_period_end,
                        reason=grant_reason,
                    ),
                    account=credit_account,
                    revision=validated_price.revision,
                    conn=conn,
                )
                self._apply_subscription(
                    current=workspace_subscription,
                    incoming=subscription,
                    provider=provider,
                    provider_mode=mode,
                )
                await workspace_subscription.save(using_db=conn)
                await self._complete_application(
                    application=application,
                    result_code="applied",
                    conn=conn,
                )
        if reconciliation_error is not None:
            raise reconciliation_error

    async def _apply_confirmed_convergence(
        self,
        *,
        subscription: ProviderSubscription,
        provider_event_id: str,
        workspace_subscription: WorkspaceSubscription,
        activation: CheckoutActivationRecord | None,
        conn: BaseDBAsyncClient,
    ) -> None:
        evidence = subscription.confirmed_transition
        revision_changed = workspace_subscription.plan_revision_id != subscription.plan_revision_id
        if evidence is None and not revision_changed:
            return
        if evidence is None:
            if activation is None:
                raise Conflict(error="SUBSCRIPTION_TRANSITION_PROVIDER_RECONCILIATION_REQUIRED")
            requires_convergence = await self._convergence.requires_transition_convergence(
                workspace_id=subscription.workspace_id,
                source_revision_id=UUID(str(workspace_subscription.plan_revision_id)),
                target_revision_id=subscription.plan_revision_id,
                conn=conn,
            )
            if requires_convergence:
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

    async def _resolve_checkout_activation(
        self,
        *,
        subscription: ProviderSubscription,
        workspace_subscription: WorkspaceSubscription,
        validated_price: _ValidatedProviderPrice,
        provider: str,
        provider_mode: BillingProviderMode,
        provider_account_id: str,
        conn: BaseDBAsyncClient,
    ) -> CheckoutActivationRecord | None:
        evidence = subscription.checkout_activation
        if evidence is None:
            return None
        return await self._checkout_activation.resolve(
            request=CheckoutActivationRequest(
                workspace_id=subscription.workspace_id,
                subscription_id=UUID(str(workspace_subscription.id)),
                target_plan_revision_id=subscription.plan_revision_id,
                plan_code=validated_price.plan_code,
                provider=provider,
                provider_mode=provider_mode,
                provider_account_id=provider_account_id,
                billing_cycle=subscription.billing_cycle,
                currency=subscription.currency,
                amount_micros=validated_price.amount_micros,
                external_price_id=subscription.external_price_id,
                checkout_session_id=evidence.checkout_session_id,
                external_session_id=evidence.external_session_id,
                checkout_outcome_event_id=evidence.checkout_outcome_event_id,
                lifecycle_occurred_at=evidence.occurred_at,
            ),
            conn=conn,
        )

    @staticmethod
    async def _persist_activation_evidence(
        *,
        application: CommerceProviderEventApplication,
        activation: CheckoutActivationRecord | None,
        conn: BaseDBAsyncClient,
    ) -> None:
        identity = cast(_ProviderApplicationIdentity, application)
        if activation is None:
            if identity.checkout_session_id is not None or identity.checkout_outcome_command_id is not None:
                raise BadRequest(error="BILLING_WEBHOOK_EVENT_CONFLICT")
            return
        if identity.checkout_session_id is None and identity.checkout_outcome_command_id is None:
            application.checkout_session_id = activation.checkout_session_id
            application.checkout_outcome_command_id = activation.checkout_outcome_command_id
            await application.save(
                update_fields=["checkout_session_id", "checkout_outcome_command_id"],
                using_db=conn,
            )
            return
        if (
            identity.checkout_session_id != activation.checkout_session_id
            or identity.checkout_outcome_command_id != activation.checkout_outcome_command_id
        ):
            raise BadRequest(error="BILLING_WEBHOOK_EVENT_CONFLICT")

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
        provider_mode: BillingProviderMode,
        provider_account_id: str,
        verified_event: VerifiedBillingProviderEvent,
        conn: BaseDBAsyncClient,
    ) -> CommercialAccessStateApplyOutcome | None:
        dunning = subscription.dunning_event
        if dunning is None:
            return None
        policy = await self._dunning_policy.resolve(
            provider=provider,
            provider_mode=provider_mode.value,
            conn=conn,
        )
        projection = await self._access_state.current_projection(
            workspace_id=subscription.workspace_id,
            conn=conn,
            for_update=True,
        )
        if projection is None:
            raise ServiceUnavailable(error="COMMERCIAL_ACCESS_STATE_UNAVAILABLE")
        source = VerifiedProviderDunningFact(
            workspace_id=subscription.workspace_id,
            subscription_revision_id=subscription.plan_revision_id,
            provider=provider,
            provider_mode=provider_mode.value,
            provider_account_id=provider_account_id,
            provider_event_id=verified_event.provider_event_id,
            provider_period_id=dunning.provider_period_id,
            provider_period_start=subscription.current_period_start,
            provider_period_end=subscription.current_period_end,
            kind=ProviderDunningFactKind(dunning.kind),
            occurred_at=dunning.occurred_at,
            recovery_deadline=dunning.recovery_deadline,
            source_payload_sha256=verified_event.payload_sha256,
            signature_reference=verified_event.signature_reference,
        )
        return await self._access_state.apply_verified_provider_fact_outcome(
            source=source,
            policy=policy,
            expected_access_revision=projection.access_revision,
            idempotency_key=f"provider:{provider}:{verified_event.provider_event_id}",
            conn=conn,
        )

    @staticmethod
    async def _complete_application(
        *,
        application: CommerceProviderEventApplication,
        result_code: str,
        conn: BaseDBAsyncClient,
    ) -> None:
        application.applied_at = datetime.now(UTC)
        application.result_code = result_code
        await application.save(update_fields=["applied_at", "result_code"], using_db=conn)

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
    ) -> _ValidatedProviderPrice:
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
        price = (
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
            .first()
        )
        if price is None:
            raise BadRequest(error="BILLING_PROVIDER_PRICE_INVALID")
        plan = await CommercePlan.filter(id=subscription.plan_id).using_db(conn).first()
        if plan is None:
            raise BadRequest(error="BILLING_PROVIDER_REVISION_INVALID")
        return _ValidatedProviderPrice(
            plan_code=plan.code,
            amount_micros=int(price.amount_micros),
            revision=revision,
        )

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
        activation: CheckoutActivationRecord | None,
    ) -> bool:
        identity = cast(_ProviderApplicationIdentity, application)
        activation_checkout_id = activation.checkout_session_id if activation is not None else None
        activation_command_id = activation.checkout_outcome_command_id if activation is not None else None
        if (
            identity.workspace_id != subscription.workspace_id
            or identity.subscription_id != workspace_subscription.id
            or identity.plan_revision_id != subscription.plan_revision_id
            or identity.checkout_session_id != activation_checkout_id
            or identity.checkout_outcome_command_id != activation_command_id
        ):
            raise BadRequest(error="BILLING_WEBHOOK_EVENT_CONFLICT")
        if identity.applied_at is not None and (
            identity.result_code == "applied" or (identity.result_code or "").startswith("dunning_")
        ):
            return True
        if identity.applied_at is None and identity.result_code == "provider_reconciliation_required":
            return False
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
        if (
            current.external_subscription_id == incoming.subscription_id
            and current.current_period_end == incoming.current_period_end
            and current.current_period_start != incoming.current_period_start
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
        revision_changed = current.plan_revision_id != incoming.plan_revision_id
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
        if revision_changed:
            current.revision += 1

    @staticmethod
    def _grant_reason(
        *, current: WorkspaceSubscription, incoming: ProviderSubscription
    ) -> PlanPeriodGrantReason | None:
        if incoming.dunning_event is not None:
            if incoming.dunning_event.kind == ProviderDunningFactKind.PAYMENT_RECOVERED.value:
                return PlanPeriodGrantReason.RECOVERY
            return None
        if incoming.status is not SubscriptionStatus.ACTIVE:
            return None
        if incoming.checkout_activation is not None:
            return PlanPeriodGrantReason.ACTIVATION
        if (
            incoming.current_period_start > current.current_period_start
            or incoming.current_period_end > current.current_period_end
        ):
            return PlanPeriodGrantReason.RENEWAL
        return None


def _provider_period_identity(subscription: ProviderSubscription) -> str:
    if subscription.dunning_event is not None:
        return subscription.dunning_event.provider_period_id
    return f"subscription:{subscription.subscription_id}:{subscription.current_period_start.isoformat()}"
