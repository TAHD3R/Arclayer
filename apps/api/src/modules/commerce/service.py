from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import Conflict, NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.services import BaseService
from src.models.commerce.billing import (
    BillingCycle,
    CommercePlanRevision,
    CreditLedgerEntryType,
    CreditRefreshInterval,
    PlanRevisionStatus,
    SubscriptionStatus,
    WorkspaceCreditAccount,
    WorkspaceCreditLedger,
    WorkspaceSubscription,
)
from src.models.commerce.credit_allocation import (
    CreditGrantSource,
    WorkspaceCreditGrantLot,
    WorkspaceMemberCreditPolicy,
)
from src.modules.commerce.free_workspace_allowance import (
    FreeWorkspaceAllowanceAuthority,
    build_free_workspace_allowance_authority,
)
from src.modules.commerce.repository import CommercePlanRevisionTerms, CommerceRepository, WorkspaceUsageAggregate
from src.modules.commerce.schema import (
    CommercePlanRevisionOut,
    CreditLedgerOut,
    PlanRevisionEntitlementOut,
    PlanRevisionPriceOut,
    PlanRevisionResourceAllowanceOut,
    WorkspaceCommerceOverviewOut,
    WorkspaceCommerceUsageOut,
    WorkspaceCreditsOut,
    WorkspaceSubscriptionOut,
)

if TYPE_CHECKING:
    from src.models.ai.ai_budget_reservation import AIBudgetReservation


WORKSPACE_COMMERCIAL_UNINITIALIZED = "WORKSPACE_COMMERCIAL_UNINITIALIZED"
FREE_PLAN_CODE = "free"


def _billing_period(now: datetime, cycle: BillingCycle) -> tuple[datetime, datetime]:
    if cycle is BillingCycle.YEARLY:
        try:
            return now, now.replace(year=now.year + 1)
        except ValueError:
            return now, now.replace(year=now.year + 1, day=28)
    if now.month == 12:
        return now, now.replace(year=now.year + 1, month=1)
    return now, now.replace(month=now.month + 1)


def _credit_period(
    now: datetime, interval: CreditRefreshInterval, *, subscription_end: datetime
) -> tuple[datetime, datetime]:
    if interval is CreditRefreshInterval.NONE:
        return now, subscription_end
    if interval is CreditRefreshInterval.DAILY:
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return start, start + timedelta(days=1)
    if interval is CreditRefreshInterval.YEARLY:
        start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        return start, start.replace(year=start.year + 1)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        return start, start.replace(year=start.year + 1, month=1)
    return start, start.replace(month=start.month + 1)


def _revision_out(*, revision: CommercePlanRevision, terms: CommercePlanRevisionTerms) -> CommercePlanRevisionOut:
    plan = revision.plan
    return CommercePlanRevisionOut(
        id=revision.id,
        created_at=revision.created_at,
        updated_at=revision.updated_at,
        plan_id=revision.plan_id,
        plan_code=plan.code,
        sequence=revision.sequence,
        name_i18n_key=revision.name_i18n_key,
        description_i18n_key=revision.description_i18n_key,
        credit_grant_amount=int(revision.credit_grant_amount),
        credit_refresh_interval=revision.credit_refresh_interval,
        credit_value_micros=int(revision.credit_value_micros),
        currency=revision.currency,
        prices=tuple(
            PlanRevisionPriceOut(
                provider=price.provider,
                provider_mode=price.provider_mode,
                billing_cycle=price.billing_cycle,
                currency=price.currency,
                amount_micros=int(price.amount_micros),
            )
            for price in terms.prices
        ),
        resource_allowances=tuple(
            PlanRevisionResourceAllowanceOut(
                key=allowance.resource.key,
                limit_kind=allowance.limit_kind,
                limit_value=None if allowance.limit_value is None else int(allowance.limit_value),
            )
            for allowance in terms.resource_allowances
        ),
        entitlements=tuple(
            PlanRevisionEntitlementOut(
                key=entitlement.entitlement.key,
                is_included=entitlement.is_included,
                allocation_mode=entitlement.allocation_mode,
                seat_limit_kind=entitlement.seat_limit_kind,
                seat_limit_value=(None if entitlement.seat_limit_value is None else int(entitlement.seat_limit_value)),
            )
            for entitlement in terms.entitlements
        ),
        is_selling=revision.is_selling,
    )


def _subscription_out(subscription: WorkspaceSubscription) -> WorkspaceSubscriptionOut:
    return WorkspaceSubscriptionOut(
        id=subscription.id,
        created_at=subscription.created_at,
        updated_at=subscription.updated_at,
        plan_revision_id=subscription.plan_revision_id,
        subscription_revision=int(subscription.revision),
        status=subscription.status,
        billing_cycle=subscription.billing_cycle,
        current_period_start=subscription.current_period_start,
        current_period_end=subscription.current_period_end,
        cancel_at_period_end=subscription.cancel_at_period_end,
    )


def _credits_out(account: WorkspaceCreditAccount, revision: CommercePlanRevision) -> WorkspaceCreditsOut:
    return WorkspaceCreditsOut(
        account_revision=int(account.revision),
        balance=int(account.balance_credits),
        reserved=int(account.reserved_credits),
        available=max(int(account.balance_credits) - int(account.reserved_credits), 0),
        period_start=account.period_start,
        period_end=account.period_end,
        next_refresh_at=None if revision.credit_refresh_interval is CreditRefreshInterval.NONE else account.period_end,
    )


def _ledger_out(row: WorkspaceCreditLedger) -> CreditLedgerOut:
    return CreditLedgerOut(
        id=row.id,
        created_at=row.created_at,
        updated_at=row.updated_at,
        workspace_id=row.workspace_id,
        account_id=row.account_id,
        subscription_id=row.subscription_id,
        plan_revision_id=row.plan_revision_id,
        entry_type=row.entry_type,
        request_id=row.request_id,
        provider_period_identity=row.provider_period_identity,
        estimated_cost_micros=row.estimated_cost_micros,
        actual_cost_micros=row.actual_cost_micros,
        applied_credit_value_micros=int(row.applied_credit_value_micros),
        reserved_credits=int(row.reserved_credits),
        committed_credits=int(row.committed_credits),
        delta_balance_credits=int(row.delta_balance_credits),
        delta_reserved_credits=int(row.delta_reserved_credits),
        balance_after_credits=int(row.balance_after_credits),
        reserved_after_credits=int(row.reserved_after_credits),
        actor_user_id=row.actor_user_id,
        description_key=row.description_key,
    )


class CommerceService(BaseService):
    """Explicit Workspace commercial initialization and revision-bound credit accounting."""

    def __init__(
        self,
        settings: Settings,
        *,
        repository: CommerceRepository,
        free_allowance: FreeWorkspaceAllowanceAuthority | None = None,
    ) -> None:
        super().__init__(settings)
        self._repository = repository
        self._free_allowance = free_allowance or build_free_workspace_allowance_authority()

    async def list_selling_revisions(self, *, include_inactive: bool) -> list[CommercePlanRevisionOut]:
        revisions = await self._repository.list_selling_revisions(include_inactive=include_inactive)
        terms_by_revision = await self._repository.get_revision_terms(
            revision_ids=(UUID(str(revision.id)) for revision in revisions)
        )
        return [
            _revision_out(revision=revision, terms=terms_by_revision[UUID(str(revision.id))]) for revision in revisions
        ]

    async def ensure_workspace_billing(
        self, *, workspace_id: UUID
    ) -> tuple[WorkspaceSubscription, WorkspaceCreditAccount, CommercePlanRevision]:
        async with self.tx() as conn:
            return await self.ensure_workspace_billing_in_transaction(workspace_id=workspace_id, conn=conn)

    async def ensure_workspace_billing_in_transaction(
        self, *, workspace_id: UUID, conn: BaseDBAsyncClient
    ) -> tuple[WorkspaceSubscription, WorkspaceCreditAccount, CommercePlanRevision]:
        subscription = await self._repository.lock_subscription(workspace_id=workspace_id, conn=conn)
        if subscription is None:
            raise Conflict(error=WORKSPACE_COMMERCIAL_UNINITIALIZED)
        revision = subscription.plan_revision
        if revision.status is not PlanRevisionStatus.PUBLISHED or revision.published_at is None:
            raise Conflict(error="WORKSPACE_COMMERCIAL_REVISION_INVALID")
        account = await self._repository.lock_credit_account_by_workspace(workspace_id=workspace_id, conn=conn)
        if (
            account is None
            or account.subscription_id != subscription.id
            or account.plan_revision_id != subscription.plan_revision_id
        ):
            raise Conflict(error="WORKSPACE_COMMERCIAL_ACCOUNT_INVALID")
        return subscription, account, revision

    async def initialize_free_workspace_in_transaction(
        self, *, workspace_id: UUID, conn: BaseDBAsyncClient
    ) -> tuple[WorkspaceSubscription, WorkspaceCreditAccount, CommercePlanRevision]:
        workspace = await self._repository.lock_workspace(workspace_id=workspace_id, conn=conn)
        if workspace is None:
            raise NotFound(error="WORKSPACE_NOT_FOUND")
        existing = await self._repository.lock_subscription(workspace_id=workspace_id, conn=conn)
        if existing is not None:
            subscription, account, revision = await self.ensure_workspace_billing_in_transaction(
                workspace_id=workspace_id,
                conn=conn,
            )
            await self._repository.ensure_commercial_access(
                workspace_id=workspace_id,
                subscription_id=UUID(str(subscription.id)),
                conn=conn,
            )
            return subscription, account, revision
        revision = await self._repository.get_free_revision(conn=conn)
        if revision is None:
            raise Conflict(error="FREE_PLAN_REVISION_UNAVAILABLE")
        owner_user_id = UUID(str(workspace.owner_user_id))
        await self._free_allowance.assert_eligible(
            prospective_owner_user_id=owner_user_id,
            excluding_workspace_id=workspace_id,
            conn=conn,
        )
        now = datetime.now(UTC)
        subscription = await self._repository.create_subscription(
            values={
                "workspace_id": workspace_id,
                "plan_revision_id": revision.id,
                "status": SubscriptionStatus.ACTIVE,
                "billing_cycle": BillingCycle.MONTHLY,
                "current_period_start": now,
                "current_period_end": datetime.max.replace(tzinfo=UTC),
                "cancel_at_period_end": False,
                "billing_provider": "local",
                "provider_mode": None,
                "revision": 1,
            },
            conn=conn,
        )
        await self._repository.ensure_commercial_access(
            workspace_id=workspace_id,
            subscription_id=UUID(str(subscription.id)),
            conn=conn,
        )
        period_start, period_end = _credit_period(
            now, revision.credit_refresh_interval, subscription_end=subscription.current_period_end
        )
        account = await self._repository.create_credit_account(
            values={
                "workspace_id": workspace_id,
                "subscription_id": subscription.id,
                "plan_revision_id": revision.id,
                "balance_credits": int(revision.credit_grant_amount),
                "reserved_credits": 0,
                "period_start": period_start,
                "period_end": period_end,
                "period_identity": f"free:{workspace_id}:{revision.id}:{period_start.isoformat()}",
                "revision": 1,
            },
            conn=conn,
        )
        await WorkspaceMemberCreditPolicy.get_or_create(
            workspace_id=workspace_id,
            defaults={
                "default_limit_kind": "unlimited",
                "default_limit_credits": None,
                "revision": 1,
                "updated_by_user_id": owner_user_id,
            },
            using_db=conn,
        )
        if int(revision.credit_grant_amount) > 0:
            await WorkspaceCreditGrantLot.create(
                workspace_id=workspace_id,
                account_id=account.id,
                subscription_id=subscription.id,
                plan_revision_id=revision.id,
                source=CreditGrantSource.PLAN_PERIOD,
                source_identity=f"plan-period:{account.period_identity}",
                granted_credits=int(revision.credit_grant_amount),
                remaining_credits=int(revision.credit_grant_amount),
                reserved_credits=0,
                issued_at=now,
                expires_at=(None if revision.credit_refresh_interval is CreditRefreshInterval.NONE else period_end),
                actor_user_id=owner_user_id,
                description_key="LEDGER_PERIOD_GRANT",
                using_db=conn,
            )
        await self._write_ledger(
            conn=conn,
            account=account,
            entry_type=CreditLedgerEntryType.PERIOD_GRANT,
            delta_balance=int(revision.credit_grant_amount),
            delta_reserved=0,
            idempotency_key=f"commerce:free-initial-grant:{workspace_id}:{revision.id}",
            actor_user_id=owner_user_id,
            description_key="LEDGER_PERIOD_GRANT",
            applied_credit_value_micros=int(revision.credit_value_micros),
        )
        return subscription, account, revision

    async def _write_ledger(
        self,
        *,
        conn: BaseDBAsyncClient,
        account: WorkspaceCreditAccount,
        entry_type: CreditLedgerEntryType,
        delta_balance: int,
        delta_reserved: int,
        idempotency_key: str,
        actor_user_id: UUID | None,
        description_key: str,
        request_id: UUID | None = None,
        provider_period_identity: str | None = None,
        estimated_cost_micros: int | None = None,
        actual_cost_micros: int | None = None,
        reserved_credits: int = 0,
        committed_credits: int = 0,
        applied_credit_value_micros: int | None = None,
    ) -> None:
        await self._repository.write_credit_ledger(
            idempotency_key=idempotency_key,
            defaults={
                "workspace_id": account.workspace_id,
                "account_id": account.id,
                "subscription_id": account.subscription_id,
                "plan_revision_id": account.plan_revision_id,
                "entry_type": entry_type,
                "request_id": request_id,
                "provider_period_identity": provider_period_identity,
                "estimated_cost_micros": estimated_cost_micros,
                "actual_cost_micros": actual_cost_micros,
                "applied_credit_value_micros": (
                    int(account.plan_revision.credit_value_micros)
                    if applied_credit_value_micros is None
                    else applied_credit_value_micros
                ),
                "reserved_credits": reserved_credits,
                "committed_credits": committed_credits,
                "delta_balance_credits": delta_balance,
                "delta_reserved_credits": delta_reserved,
                "balance_after_credits": account.balance_credits,
                "reserved_after_credits": account.reserved_credits,
                "actor_user_id": actor_user_id,
                "description_key": description_key,
            },
            conn=conn,
        )

    async def write_credit_ledger_entry(
        self,
        *,
        conn: BaseDBAsyncClient,
        account: WorkspaceCreditAccount,
        entry_type: CreditLedgerEntryType,
        delta_balance: int,
        delta_reserved: int,
        idempotency_key: str,
        actor_user_id: UUID | None,
        description_key: str,
        request_id: UUID | None = None,
        estimated_cost_micros: int | None = None,
        actual_cost_micros: int | None = None,
        reserved_credits: int = 0,
        committed_credits: int = 0,
        applied_credit_value_micros: int | None = None,
    ) -> None:
        await self._write_ledger(
            conn=conn,
            account=account,
            entry_type=entry_type,
            delta_balance=delta_balance,
            delta_reserved=delta_reserved,
            idempotency_key=idempotency_key,
            actor_user_id=actor_user_id,
            description_key=description_key,
            request_id=request_id,
            estimated_cost_micros=estimated_cost_micros,
            actual_cost_micros=actual_cost_micros,
            reserved_credits=reserved_credits,
            committed_credits=committed_credits,
            applied_credit_value_micros=applied_credit_value_micros,
        )

    async def lock_credit_account(self, *, account_id: UUID, conn: BaseDBAsyncClient) -> WorkspaceCreditAccount | None:
        return await self._repository.lock_credit_account_by_id(account_id=account_id, conn=conn)

    async def save_credit_account(self, *, account: WorkspaceCreditAccount, conn: BaseDBAsyncClient) -> None:
        await self._repository.save_credit_account(account=account, conn=conn)

    async def save_budget_reservation_reconciliation(
        self,
        *,
        reservation: AIBudgetReservation,
        actual_credits: int | None,
        reconciled_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._repository.save_budget_reservation(
            reservation=reservation, actual_credits=actual_credits, reconciled_at=reconciled_at, conn=conn
        )

    async def get_overview(self, *, workspace_id: UUID) -> WorkspaceCommerceOverviewOut:
        subscription, account, revision = await self.ensure_workspace_billing(workspace_id=workspace_id)
        terms_by_revision = await self._repository.get_revision_terms(revision_ids=(UUID(str(revision.id)),))
        usage = await self._repository.summarize_workspace_usage(
            periods={workspace_id: (account.period_start.date(), account.period_end.date())}
        )
        aggregate = usage.get(workspace_id)
        return WorkspaceCommerceOverviewOut(
            plan_revision=_revision_out(revision=revision, terms=terms_by_revision[UUID(str(revision.id))]),
            subscription=_subscription_out(subscription),
            credits=_credits_out(account, revision),
            usage=_usage_out(aggregate),
        )

    async def list_credit_ledger(self, *, workspace_id: UUID, params: PageParams) -> PageData[CreditLedgerOut]:
        total, rows = await self._repository.list_credit_ledger(
            workspace_id=workspace_id, limit=params.limit, offset=params.offset
        )
        pages = (total + params.size - 1) // params.size if total else 0
        return PageData(
            items=[_ledger_out(row) for row in rows],
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=params.page + 1 if params.page < pages else None,
            prev=params.page - 1 if params.page > 1 and pages else None,
        )


def _usage_out(usage: WorkspaceUsageAggregate | None) -> WorkspaceCommerceUsageOut:
    return WorkspaceCommerceUsageOut(
        period_cost_micros=0 if usage is None else usage.period_cost_micros,
        requests=0 if usage is None else usage.requests,
        prompt_tokens=0 if usage is None else usage.prompt_tokens,
        completion_tokens=0 if usage is None else usage.completion_tokens,
    )


def build_commerce_service(settings: Settings) -> CommerceService:
    return CommerceService(settings, repository=CommerceRepository())
