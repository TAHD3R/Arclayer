"""Durable Platform Commerce operations that are separate from tenant billing."""

from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
from typing import Protocol
from uuid import UUID

from src.config import Settings
from src.core.exceptions import Conflict, NotFound, ServiceUnavailable
from src.core.registries import ConnectorRegistry
from src.core.services import BaseService
from src.models.commerce.billing import (
    CommerceCreditAdjustmentReceipt,
    CommerceDunningPolicy,
    CommerceDunningPolicyCommandReceipt,
    CommercePlanRevision,
    CreditLedgerEntryType,
    WorkspaceCreditAccount,
    WorkspaceCreditLedger,
    WorkspaceSubscription,
)
from src.models.commerce.credit_allocation import (
    CreditGrantSource,
    CreditLotMutationKind,
    WorkspaceCreditGrantLot,
    WorkspaceCreditLotMutation,
)
from src.models.connectors.inbox import ConnectorEventInbox
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.commerce.billing_event_reconciliation_service import (
    BillingEventReconciliationResult,
    BillingEventReconciliationService,
)
from src.modules.commerce.platform_operations_schema import (
    CreditAdjustmentOut,
    CreditAdjustmentRequest,
    DunningPolicyOut,
    DunningPolicyWrite,
    ProviderConfigurationWrite,
    ProviderConfigurationWriteOut,
    ProviderEventListOut,
    ProviderEventOut,
    ProviderEventQuery,
    ProviderEventReconcileRequest,
    ProviderReadinessOut,
)
from src.modules.commerce.platform_schema import PlatformCommerceSubscriptionOut


class ProviderConfigurationWriter(Protocol):
    """Safe configuration port; implementations own secret persistence and rotation."""

    async def write(
        self, *, request: ProviderConfigurationWrite, actor_user_id: UUID
    ) -> ProviderConfigurationWriteOut: ...


class ProviderEventReconciler(Protocol):
    """Safe port that re-enqueues an already verified durable event by inbox identity."""

    async def reconcile(
        self,
        *,
        inbox_id: UUID,
        expected_processing_attempts: int,
        idempotency_key: str,
        actor_user_id: UUID,
    ) -> BillingEventReconciliationResult: ...


class PlatformCommerceOperationsService(BaseService):
    def __init__(
        self,
        *,
        settings: Settings,
        connectors: ConnectorRegistry,
        configuration_writer: ProviderConfigurationWriter | None = None,
        event_reconciler: ProviderEventReconciler | None = None,
    ) -> None:
        super().__init__(settings)
        self._connectors = connectors
        self._configuration_writer = configuration_writer
        self._event_reconciler = event_reconciler

    async def provider_readiness(self) -> ProviderReadinessOut:
        billing = self.settings.billing
        if billing.provider == "disabled":
            return ProviderReadinessOut(
                provider="disabled",
                configured=False,
                webhook_ready=False,
                connector_registered=False,
                supported_capabilities=(),
                missing_prerequisites=("billing_provider",),
            )
        registration = self._connectors.resolve(f"billing.{billing.provider}")
        missing = []
        if not billing._stripe_configured:
            missing.append("provider_secret")
        if not billing.webhook_enabled:
            missing.append("webhook_secret")
        if registration is None:
            missing.append("billing_connector")
        return ProviderReadinessOut(
            provider=billing.provider,
            configured=not missing,
            webhook_ready=billing.webhook_enabled and registration is not None,
            connector_registered=registration is not None,
            supported_capabilities=() if registration is None else registration.definition.capabilities,
            missing_prerequisites=tuple(missing),
        )

    async def get_subscription(self, *, subscription_id: UUID) -> PlatformCommerceSubscriptionOut | None:
        subscription = await (
            WorkspaceSubscription.filter(id=subscription_id).select_related("plan_revision__plan").first()
        )
        if subscription is None:
            return None
        return PlatformCommerceSubscriptionOut(
            workspace_id=subscription.workspace_id,
            subscription_id=subscription.id,
            plan_revision_id=subscription.plan_revision_id,
            plan_code=subscription.plan_revision.plan.code,
            plan_revision=subscription.revision,
            status=subscription.status,
            billing_cycle=subscription.billing_cycle,
            current_period_start=subscription.current_period_start,
            current_period_end=subscription.current_period_end,
            cancel_at_period_end=subscription.cancel_at_period_end,
            billing_provider=subscription.billing_provider,
        )

    async def write_provider_configuration(
        self, *, request: ProviderConfigurationWrite, actor_user_id: UUID
    ) -> ProviderConfigurationWriteOut:
        if self._configuration_writer is None:
            raise ServiceUnavailable(
                error="BILLING_PROVIDER_CONFIGURATION_PORT_UNAVAILABLE",
                details={"protocol": "commerce.provider.configuration.v1"},
            )
        return await self._configuration_writer.write(request=request, actor_user_id=actor_user_id)

    async def get_dunning_policy(self) -> DunningPolicyOut | None:
        billing = self.settings.billing
        if billing.provider == "disabled":
            return None
        policy = await CommerceDunningPolicy.filter(
            provider=billing.provider,
            provider_mode="live" if billing.provider == "stripe" and billing.webhook_enabled else "test",
            is_active=True,
        ).first()
        return None if policy is None else _dunning_policy_out(policy)

    async def write_dunning_policy(self, *, request: DunningPolicyWrite, actor_user_id: UUID) -> DunningPolicyOut:
        _validate_dunning_policy(request.policy)
        fingerprint = _fingerprint(actor_user_id, request.model_dump(mode="json"))
        key_hash = _digest(request.idempotency_key)
        async with self.tx() as conn:
            receipt = await (
                CommerceDunningPolicyCommandReceipt
                .filter(
                    provider=request.provider,
                    provider_mode=request.provider_mode,
                    idempotency_key_hash=key_hash,
                )
                .using_db(conn)
                .select_for_update()
                .select_related("policy")
                .first()
            )
            if receipt is not None:
                if receipt.request_fingerprint != fingerprint:
                    raise Conflict(error="DUNNING_POLICY_IDEMPOTENCY_CONFLICT")
                return _dunning_policy_out(receipt.policy)
            current = await (
                CommerceDunningPolicy
                .filter(provider=request.provider, provider_mode=request.provider_mode, is_active=True)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            current_revision = 0 if current is None else int(current.revision)
            if current_revision != request.expected_revision:
                raise Conflict(error="DUNNING_POLICY_REVISION_STALE")
            if current is not None:
                current.is_active = False
                await current.save(using_db=conn, update_fields=["is_active", "updated_at"])
            policy = await CommerceDunningPolicy.create(
                provider=request.provider,
                provider_mode=request.provider_mode,
                revision=current_revision + 1,
                is_active=True,
                policy=request.policy,
                using_db=conn,
            )
            audit = await write_required_activity_event(
                settings=self.settings,
                payload=ActivityAuditPayload(
                    event_name="commerce.dunning_policy.updated",
                    actor_user_id=actor_user_id,
                    entity_type="commerce_dunning_policy",
                    entity_id=policy.id,
                    properties={"provider": request.provider, "revision": policy.revision, "idempotency_key": key_hash},
                ),
                conn=conn,
            )
            await CommerceDunningPolicyCommandReceipt.create(
                provider=request.provider,
                provider_mode=request.provider_mode,
                idempotency_key_hash=key_hash,
                request_fingerprint=fingerprint,
                policy_id=policy.id,
                audit_event_id=audit.id,
                using_db=conn,
            )
            return _dunning_policy_out(policy)

    async def list_provider_events(self, *, query: ProviderEventQuery) -> ProviderEventListOut:
        events = ConnectorEventInbox.all().order_by("-created_at", "-id")
        if query.provider is not None:
            events = events.filter(provider=query.provider)
        if query.status is not None:
            events = events.filter(status=query.status)
        total = await events.count()
        offset = (query.page - 1) * query.page_size
        rows = await events.offset(offset).limit(query.page_size)
        return ProviderEventListOut(items=tuple(_event_out(row) for row in rows), total=total)

    async def reconcile_provider_event(
        self,
        *,
        event_id: UUID,
        request: ProviderEventReconcileRequest,
        actor_user_id: UUID,
    ) -> ProviderEventOut:
        if self._event_reconciler is None:
            raise ServiceUnavailable(
                error="BILLING_PROVIDER_EVENT_RECONCILIATION_PORT_UNAVAILABLE",
                details={"protocol": "commerce.provider-event.reconcile.v1"},
            )
        result = await self._event_reconciler.reconcile(
            inbox_id=event_id,
            expected_processing_attempts=request.expected_processing_attempts,
            idempotency_key=request.idempotency_key,
            actor_user_id=actor_user_id,
        )
        return _event_out(result.inbox, job_id=result.reconciliation_job_id)

    async def adjust_credits(
        self, *, workspace_id: UUID, request: CreditAdjustmentRequest, actor_user_id: UUID
    ) -> CreditAdjustmentOut:
        fingerprint = _fingerprint(actor_user_id, request.model_dump(mode="json"))
        key_hash = _digest(request.idempotency_key)
        async with self.tx() as conn:
            account = await (
                WorkspaceCreditAccount.filter(workspace_id=workspace_id).using_db(conn).select_for_update().first()
            )
            if account is None:
                raise NotFound(error="WORKSPACE_CREDIT_ACCOUNT_NOT_FOUND")
            plan_revision = await CommercePlanRevision.filter(id=account.plan_revision_id).using_db(conn).get()
            receipt = await (
                CommerceCreditAdjustmentReceipt
                .filter(workspace_id=workspace_id, idempotency_key_hash=key_hash)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if receipt is not None:
                if receipt.request_fingerprint != fingerprint:
                    raise Conflict(error="CREDIT_ADJUSTMENT_IDEMPOTENCY_CONFLICT")
                return CreditAdjustmentOut.model_validate(receipt.result_snapshot)
            if account.revision != request.expected_account_revision:
                raise Conflict(error="WORKSPACE_CREDIT_ACCOUNT_REVISION_STALE")
            balance = int(account.balance_credits) + request.delta_credits
            if balance < int(account.reserved_credits):
                raise Conflict(error="CREDIT_ADJUSTMENT_WOULD_OVERDRAW_RESERVED_CREDITS")
            lot_debits = ()
            if request.delta_credits < 0:
                from src.modules.commerce.credit_lot_mutations import deplete_unreserved_credit_lots

                lot_debits = await deplete_unreserved_credit_lots(
                    account_id=UUID(str(account.id)),
                    credits=-request.delta_credits,
                    conn=conn,
                )
            else:
                await WorkspaceCreditGrantLot.create(
                    workspace_id=workspace_id,
                    account_id=account.id,
                    subscription_id=account.subscription_id,
                    plan_revision_id=account.plan_revision_id,
                    source=CreditGrantSource.ADJUSTMENT,
                    source_identity=f"platform-adjustment:{workspace_id}:{key_hash}",
                    granted_credits=request.delta_credits,
                    remaining_credits=request.delta_credits,
                    reserved_credits=0,
                    issued_at=datetime.now(UTC),
                    expires_at=request.expires_at,
                    actor_user_id=actor_user_id,
                    description_key="LEDGER_PLATFORM_ADJUSTMENT",
                    using_db=conn,
                )
            account.balance_credits = balance
            account.revision += 1
            await account.save(using_db=conn, update_fields=["balance_credits", "revision", "updated_at"])
            ledger = await WorkspaceCreditLedger.create(
                workspace_id=workspace_id,
                account_id=account.id,
                subscription_id=account.subscription_id,
                plan_revision_id=account.plan_revision_id,
                entry_type=CreditLedgerEntryType.ADJUSTMENT,
                applied_credit_value_micros=int(plan_revision.credit_value_micros),
                delta_balance_credits=request.delta_credits,
                delta_reserved_credits=0,
                balance_after_credits=balance,
                reserved_after_credits=int(account.reserved_credits),
                idempotency_key=f"platform-credit-adjustment:{key_hash}",
                actor_user_id=actor_user_id,
                description_key="LEDGER_PLATFORM_ADJUSTMENT",
                using_db=conn,
            )
            for debit in lot_debits:
                await WorkspaceCreditLotMutation.create(
                    lot_id=debit.lot_id,
                    ledger_entry_id=ledger.id,
                    kind=CreditLotMutationKind.ADJUSTMENT,
                    delta_remaining_credits=-debit.credits,
                    source_identity=f"platform-adjustment:{key_hash}:{debit.lot_id}",
                    actor_user_id=actor_user_id,
                    reason=request.reason,
                    evidence_reference=request.evidence_reference,
                    occurred_at=datetime.now(UTC),
                    using_db=conn,
                )
            audit = await write_required_activity_event(
                settings=self.settings,
                payload=ActivityAuditPayload(
                    event_name="commerce.credit_adjustment.applied",
                    actor_user_id=actor_user_id,
                    workspace_id=workspace_id,
                    entity_type="workspace_credit_ledger",
                    entity_id=ledger.id,
                    properties={
                        "delta_credits": request.delta_credits,
                        "reason": request.reason,
                        "evidence_reference": request.evidence_reference,
                        "idempotency_key": key_hash,
                    },
                ),
                conn=conn,
            )
            result = _credit_adjustment_out(ledger, audit.id, account_revision=int(account.revision))
            await CommerceCreditAdjustmentReceipt.create(
                workspace_id=workspace_id,
                idempotency_key_hash=key_hash,
                request_fingerprint=fingerprint,
                result_snapshot=result.model_dump(mode="json"),
                ledger_entry_id=ledger.id,
                audit_event_id=audit.id,
                using_db=conn,
            )
            return result


def build_platform_commerce_operations_service(
    *, settings: Settings, connectors: ConnectorRegistry
) -> PlatformCommerceOperationsService:
    return PlatformCommerceOperationsService(
        settings=settings,
        connectors=connectors,
        event_reconciler=BillingEventReconciliationService(settings),
    )


def _validate_dunning_policy(policy: dict[str, object]) -> None:
    if policy.get("recoveryDeadlineSource") != "provider":
        raise Conflict(error="DUNNING_POLICY_PROVIDER_DEADLINE_REQUIRED")
    if not policy.get("paymentGraceEffects") or not policy.get("paymentRestrictedEffects"):
        raise Conflict(error="DUNNING_POLICY_EFFECTS_REQUIRED")


def _event_out(row: ConnectorEventInbox, *, job_id: UUID | None = None) -> ProviderEventOut:
    reference = row.result_reference
    return ProviderEventOut(
        id=row.id,
        provider=row.provider,
        provider_mode=str(row.provider_mode),
        provider_account_id=row.provider_account_id,
        provider_event_id=row.provider_event_id,
        event_type=row.event_type,
        signature_timestamp=row.signature_timestamp,
        payload_sha256=row.payload_sha256,
        status=str(row.status),
        processing_attempts=row.processing_attempts,
        job_id=row.job_id if job_id is None else job_id,
        processed_at=row.processed_at,
        last_error_code=row.last_error_code,
        last_error_message=row.last_error_message,
        result_reference=reference if isinstance(reference, dict) else None,
    )


def _dunning_policy_out(policy: CommerceDunningPolicy) -> DunningPolicyOut:
    return DunningPolicyOut(
        provider=policy.provider,
        provider_mode=policy.provider_mode,
        revision=int(policy.revision),
        is_active=policy.is_active,
        policy=policy.policy,
    )


def _credit_adjustment_out(
    ledger: WorkspaceCreditLedger, audit_event_id: UUID, *, account_revision: int | None = None
) -> CreditAdjustmentOut:
    return CreditAdjustmentOut(
        workspace_id=ledger.workspace_id,
        ledger_entry_id=ledger.id,
        account_revision=1 if account_revision is None else account_revision,
        balance=int(ledger.balance_after_credits),
        reserved=int(ledger.reserved_after_credits),
        available=int(ledger.balance_after_credits) - int(ledger.reserved_after_credits),
        audit_event_id=audit_event_id,
    )


def _digest(value: str) -> str:
    return sha256(value.encode()).hexdigest()


def _fingerprint(actor_user_id: UUID, payload: object) -> str:
    return _digest(f"{actor_user_id}:{payload!r}")
