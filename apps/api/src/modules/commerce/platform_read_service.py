from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol, cast
from uuid import UUID

from src.core.services import BaseService
from src.models.commerce.billing import CommercePlanRevision
from src.modules.commerce.catalog_repository import CommerceCatalogRepository
from src.modules.commerce.platform_payment_read_repository import PlatformPaymentReadRepository
from src.modules.commerce.platform_payment_read_schema import (
    PlatformInvoiceListOut,
    PlatformInvoiceOut,
    PlatformInvoiceQuery,
    PlatformRefundListOut,
    PlatformRefundOut,
    PlatformRefundQuery,
    PlatformTransactionListOut,
    PlatformTransactionOut,
    PlatformTransactionQuery,
)
from src.modules.commerce.platform_schema import (
    PlatformCommercePlanCatalogOut,
    PlatformCommercePlanOut,
    PlatformCommerceRevisionSummaryOut,
    PlatformCommerceSubscriptionListOut,
    PlatformCommerceSubscriptionOut,
    PlatformCommerceSubscriptionQuery,
)
from src.modules.commerce.repository import CommerceRepository
from src.modules.commerce.simulator_read_repository import SimulatorReadRepository
from src.modules.commerce.simulator_read_schema import (
    SimulatorApplicationOut,
    SimulatorCheckoutOut,
    SimulatorCorrectionOut,
    SimulatorInboxOut,
    SimulatorInvoiceOut,
    SimulatorJobOut,
    SimulatorOutcomeCommandOut,
    SimulatorRefundOut,
    SimulatorStateOut,
    SimulatorTransactionOut,
)


class _PlanWithRevisions(Protocol):
    revisions: Sequence[CommercePlanRevision]


class PlatformCommerceReadService(BaseService):
    def __init__(
        self,
        *,
        catalog: CommerceCatalogRepository,
        commerce: CommerceRepository,
        simulator: SimulatorReadRepository | None = None,
        payments: PlatformPaymentReadRepository | None = None,
    ) -> None:
        super().__init__()
        self._catalog = catalog
        self._commerce = commerce
        self._simulator = simulator or SimulatorReadRepository()
        self._payments = payments or PlatformPaymentReadRepository()

    async def list_plan_catalog(self, *, include_inactive: bool) -> PlatformCommercePlanCatalogOut:
        plans = await self._catalog.list_plans_with_revisions(include_inactive=include_inactive)
        return PlatformCommercePlanCatalogOut(
            items=tuple(
                PlatformCommercePlanOut(
                    id=plan.id,
                    code=plan.code,
                    is_active=plan.is_active,
                    sort_order=plan.sort_order,
                    revisions=tuple(
                        PlatformCommerceRevisionSummaryOut(
                            id=revision.id,
                            sequence=revision.sequence,
                            revision=revision.revision,
                            status=revision.status,
                            is_selling=revision.is_selling,
                            name_i18n_key=revision.name_i18n_key,
                            description_i18n_key=revision.description_i18n_key,
                            published_at=revision.published_at,
                        )
                        for revision in sorted(cast(_PlanWithRevisions, plan).revisions, key=lambda item: item.sequence)
                    ),
                )
                for plan in plans
            )
        )

    async def list_plan_revisions(
        self, *, code: str, include_inactive: bool
    ) -> tuple[PlatformCommerceRevisionSummaryOut, ...]:
        plan = await self._catalog.get_plan_with_revisions(code=code, include_inactive=include_inactive)
        if plan is None:
            return ()
        return tuple(
            PlatformCommerceRevisionSummaryOut(
                id=revision.id,
                sequence=revision.sequence,
                revision=revision.revision,
                status=revision.status,
                is_selling=revision.is_selling,
                name_i18n_key=revision.name_i18n_key,
                description_i18n_key=revision.description_i18n_key,
                published_at=revision.published_at,
            )
            for revision in sorted(cast(_PlanWithRevisions, plan).revisions, key=lambda item: item.sequence)
        )

    async def list_subscriptions(
        self, *, query: PlatformCommerceSubscriptionQuery
    ) -> PlatformCommerceSubscriptionListOut:
        rows, total = await self._commerce.list_platform_subscriptions(query=query)
        access_by_workspace = await self._commerce.get_commercial_access_by_workspace_ids(
            workspace_ids=(row.workspace_id for row in rows)
        )
        return PlatformCommerceSubscriptionListOut(
            total=total,
            items=tuple(
                PlatformCommerceSubscriptionOut(
                    workspace_id=row.workspace_id,
                    subscription_id=row.id,
                    plan_revision_id=row.plan_revision_id,
                    plan_code=row.plan_revision.plan.code,
                    plan_revision=row.revision,
                    status=row.status,
                    billing_cycle=row.billing_cycle,
                    current_period_start=row.current_period_start,
                    current_period_end=row.current_period_end,
                    cancel_at_period_end=row.cancel_at_period_end,
                    billing_provider=row.billing_provider,
                    commercial_access_state=(
                        None if (access := access_by_workspace.get(row.workspace_id)) is None else access.state
                    ),
                    recovery_deadline_at=None if access is None else access.deadline_at,
                    access_revision=None if access is None else int(access.state_revision),
                )
                for row in rows
            ),
        )

    async def list_transactions(self, *, query: PlatformTransactionQuery) -> PlatformTransactionListOut:
        rows, total = await self._payments.list_transactions(query=query)
        return PlatformTransactionListOut(
            total=total,
            items=tuple(
                PlatformTransactionOut(
                    transaction_id=row.id,
                    workspace_id=row.workspace_id,
                    external_transaction_id=row.external_transaction_id,
                    provider=row.provider,
                    provider_mode=str(row.provider_mode),
                    kind=row.kind,
                    status=row.status,
                    currency=row.currency,
                    amount_micros=int(row.amount_micros),
                    credit_amount=None if row.credit_amount is None else int(row.credit_amount),
                    checkout_session_id=row.checkout_session_id,
                    invoice_id=row.invoice_id,
                    occurred_at=row.occurred_at,
                )
                for row in rows
            ),
        )

    async def list_invoices(self, *, query: PlatformInvoiceQuery) -> PlatformInvoiceListOut:
        rows, total, transaction_ids = await self._payments.list_invoices(query=query)
        return PlatformInvoiceListOut(
            total=total,
            items=tuple(
                PlatformInvoiceOut(
                    invoice_id=row.id,
                    workspace_id=row.workspace_id,
                    external_invoice_id=row.external_invoice_id,
                    provider=row.provider,
                    provider_mode=str(row.provider_mode),
                    status=row.status,
                    currency=row.currency,
                    amount_due_micros=int(row.amount_due_micros),
                    amount_paid_micros=int(row.amount_paid_micros),
                    amount_refunded_micros=int(row.amount_refunded_micros),
                    period_start=row.period_start,
                    period_end=row.period_end,
                    issued_at=row.issued_at,
                    paid_at=row.paid_at,
                    transaction_ids=transaction_ids.get(row.id, ()),
                )
                for row in rows
            ),
        )

    async def list_refunds(self, *, query: PlatformRefundQuery) -> PlatformRefundListOut:
        rows, total = await self._payments.list_refunds(query=query)
        return PlatformRefundListOut(
            total=total,
            items=tuple(
                PlatformRefundOut(
                    refund_id=row.id,
                    workspace_id=row.transaction.workspace_id,
                    transaction_id=row.transaction_id,
                    status=row.status,
                    amount_micros=int(row.amount_micros),
                    credit_amount=None if row.credit_amount is None else int(row.credit_amount),
                    reason=row.reason,
                    external_refund_id=row.external_refund_id,
                    provider_event_id=row.provider_event_id,
                    completed_at=row.completed_at,
                    failure_code=row.failure_code,
                )
                for row in rows
            ),
        )

    async def get_simulator_state(self, *, workspace_id: UUID) -> SimulatorStateOut:
        rows = await self._simulator.get_workspace_state(workspace_id=workspace_id)
        return SimulatorStateOut(
            workspace_id=workspace_id,
            checkouts=tuple(
                SimulatorCheckoutOut(
                    id=row.id,
                    external_session_id=row.external_session_id,
                    kind=str(row.kind),
                    provider=row.provider,
                    provider_mode=str(row.provider_mode),
                    provider_account_id=row.provider_account_id,
                    status=str(row.status),
                    currency=row.currency,
                    amount_micros=int(row.amount_micros),
                    credit_amount=None if row.credit_amount is None else int(row.credit_amount),
                    external_price_id=row.external_price_id,
                    actor_user_id=row.actor_user_id,
                    revision=int(row.revision),
                    expires_at=row.expires_at,
                    completed_at=row.completed_at,
                )
                for row in rows.checkouts
            ),
            outcome_commands=tuple(
                SimulatorOutcomeCommandOut(
                    id=row.id,
                    checkout_session_id=row.checkout_session_id,
                    actor_user_id=row.actor_user_id,
                    outcome=str(row.outcome),
                    expected_revision=int(row.expected_revision),
                    provider_event_id=row.provider_event_id,
                    accepted_inbox_id=row.accepted_inbox_id,
                    accepted_job_id=row.accepted_job_id,
                    processed_at=row.processed_at,
                    result_status=None if row.result_status is None else str(row.result_status),
                    result_revision=None if row.result_revision is None else int(row.result_revision),
                )
                for row in rows.commands
            ),
            inboxes=tuple(
                SimulatorInboxOut(
                    id=row.id,
                    provider=row.provider,
                    provider_mode=row.provider_mode,
                    provider_account_id=row.provider_account_id,
                    provider_event_id=row.provider_event_id,
                    event_type=row.event_type,
                    status=str(row.status),
                    processing_attempts=int(row.processing_attempts),
                    job_id=row.job_id,
                    processed_at=row.processed_at,
                    last_error_code=row.last_error_code,
                )
                for row in rows.inboxes
            ),
            jobs=tuple(
                SimulatorJobOut(
                    id=row.id,
                    job_type=row.job_type,
                    internal_status=str(row.internal_status),
                    workspace_id=row.workspace_id,
                    attempt_count=int(row.attempt_count),
                    next_attempt_at=row.next_attempt_at,
                    completed_at=row.completed_at,
                    error_code=row.error_code,
                )
                for row in rows.jobs
            ),
            transactions=tuple(
                SimulatorTransactionOut(
                    id=row.id,
                    external_transaction_id=row.external_transaction_id,
                    provider=row.provider,
                    provider_mode=str(row.provider_mode),
                    kind=str(row.kind),
                    status=str(row.status),
                    currency=row.currency,
                    amount_micros=int(row.amount_micros),
                    credit_amount=None if row.credit_amount is None else int(row.credit_amount),
                    checkout_session_id=row.checkout_session_id,
                    invoice_id=row.invoice_id,
                    occurred_at=row.occurred_at,
                )
                for row in rows.transactions
            ),
            invoices=tuple(
                SimulatorInvoiceOut(
                    id=row.id,
                    external_invoice_id=row.external_invoice_id,
                    provider=row.provider,
                    provider_mode=str(row.provider_mode),
                    status=str(row.status),
                    currency=row.currency,
                    amount_due_micros=int(row.amount_due_micros),
                    amount_paid_micros=int(row.amount_paid_micros),
                    amount_refunded_micros=int(row.amount_refunded_micros),
                    issued_at=row.issued_at,
                    paid_at=row.paid_at,
                )
                for row in rows.invoices
            ),
            refunds=tuple(
                SimulatorRefundOut(
                    id=row.id,
                    transaction_id=row.transaction_id,
                    status=str(row.status),
                    amount_micros=int(row.amount_micros),
                    credit_amount=None if row.credit_amount is None else int(row.credit_amount),
                    external_refund_id=row.external_refund_id,
                    provider_event_id=row.provider_event_id,
                    completed_at=row.completed_at,
                    failure_code=row.failure_code,
                )
                for row in rows.refunds
            ),
            applications=tuple(
                SimulatorApplicationOut(
                    id=row.id,
                    checkout_session_id=row.checkout_session_id,
                    transaction_id=row.transaction_id,
                    invoice_id=row.invoice_id,
                    provider=row.provider,
                    provider_mode=str(row.provider_mode),
                    provider_account_id=row.provider_account_id,
                    provider_event_id=row.provider_event_id,
                    outcome=str(row.outcome),
                    result_status=str(row.result_status),
                    result_revision=int(row.result_revision),
                    applied_at=row.applied_at,
                )
                for row in rows.applications
            ),
            corrections=tuple(
                SimulatorCorrectionOut(
                    id=row.id,
                    transaction_id=row.transaction_id,
                    invoice_id=row.invoice_id,
                    refund_id=row.refund_id,
                    provider=row.provider,
                    provider_mode=str(row.provider_mode),
                    provider_account_id=row.provider_account_id,
                    provider_event_id=row.provider_event_id,
                    disposition=str(row.disposition),
                    failure_code=row.failure_code,
                    provider_event_occurred_at=row.provider_event_occurred_at,
                )
                for row in rows.corrections
            ),
        )


def build_platform_commerce_read_service() -> PlatformCommerceReadService:
    return PlatformCommerceReadService(
        catalog=CommerceCatalogRepository(),
        commerce=CommerceRepository(),
        simulator=SimulatorReadRepository(),
        payments=PlatformPaymentReadRepository(),
    )
