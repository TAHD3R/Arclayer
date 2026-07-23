from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import date, datetime
from typing import Any, Protocol, cast
from uuid import UUID

from pydantic import ConfigDict, Field
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q
from tortoise.functions import Max, Min, Sum

from src.common.schemas import BaseSchema
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.ai.ai_budget_reservation import AIBudgetReservation
from src.models.ai.ai_usage_daily import AIUsageDaily
from src.models.commerce.billing import (
    BillingProviderEventReceipt,
    CommercePlan,
    WorkspaceCreditAccount,
    WorkspaceCreditLedger,
    WorkspaceSubscription,
)
from src.models.workspaces.workspace import Workspace


class BillingCheckoutPlan(BaseSchema):
    """Immutable plan projection required to create a provider checkout."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    id: UUID
    code: str = Field(min_length=1, max_length=48)
    currency: str = Field(min_length=3, max_length=3)


class WorkspaceUsageAggregate(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    period_cost_micros: int
    requests: int
    prompt_tokens: int
    completion_tokens: int
    observed_from: date
    observed_to: date


class BillingPlanReader(Protocol):
    async def get_active_checkout_plan(self, *, code: str) -> BillingCheckoutPlan | None: ...


class CommercePersistence(Protocol):
    async def seed_plan(
        self,
        *,
        code: str,
        defaults: dict[str, Any],
        conn: BaseDBAsyncClient | None,
    ) -> tuple[CommercePlan, bool]: ...

    async def save_plan(
        self,
        *,
        plan: CommercePlan,
        conn: BaseDBAsyncClient | None,
        update_fields: list[str] | None = None,
    ) -> None: ...

    async def list_plans(self, *, include_inactive: bool) -> list[CommercePlan]: ...

    async def lock_plan_catalog(self, *, code: str, conn: BaseDBAsyncClient) -> CommercePlan | None: ...

    async def clear_default_plans(self, *, conn: BaseDBAsyncClient) -> None: ...

    async def get_plan_by_code(
        self,
        *,
        code: str,
        conn: BaseDBAsyncClient | None = None,
        active_only: bool = False,
    ) -> CommercePlan | None: ...

    async def create_plan(
        self,
        *,
        code: str,
        values: dict[str, Any],
        conn: BaseDBAsyncClient,
    ) -> CommercePlan: ...

    async def has_active_default_plan(self, *, conn: BaseDBAsyncClient) -> bool: ...

    async def get_default_plan(self, *, conn: BaseDBAsyncClient) -> CommercePlan | None: ...

    async def get_plan(self, *, plan_id: UUID, conn: BaseDBAsyncClient) -> CommercePlan: ...

    async def lock_workspace(self, *, workspace_id: UUID, conn: BaseDBAsyncClient) -> Workspace | None: ...

    async def get_workspace(self, *, workspace_id: UUID, conn: BaseDBAsyncClient) -> Workspace: ...

    async def lock_subscription(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceSubscription | None: ...

    async def create_subscription(
        self,
        *,
        values: dict[str, Any],
        conn: BaseDBAsyncClient,
    ) -> WorkspaceSubscription: ...

    async def save_subscription(
        self,
        *,
        subscription: WorkspaceSubscription,
        conn: BaseDBAsyncClient,
    ) -> None: ...

    async def lock_credit_account_by_workspace(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceCreditAccount | None: ...

    async def lock_credit_account_by_id(
        self,
        *,
        account_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceCreditAccount | None: ...

    async def create_credit_account(
        self,
        *,
        values: dict[str, Any],
        conn: BaseDBAsyncClient,
    ) -> WorkspaceCreditAccount: ...

    async def save_credit_account(
        self,
        *,
        account: WorkspaceCreditAccount,
        conn: BaseDBAsyncClient,
    ) -> None: ...

    async def write_credit_ledger(
        self,
        *,
        idempotency_key: str,
        defaults: dict[str, Any],
        conn: BaseDBAsyncClient,
    ) -> None: ...

    async def list_credit_ledger(
        self,
        *,
        workspace_id: UUID,
        limit: int,
        offset: int,
    ) -> tuple[int, list[WorkspaceCreditLedger]]: ...

    async def list_usage(
        self,
        *,
        workspace_id: UUID,
        period_start: date,
        period_end: date,
    ) -> list[AIUsageDaily]: ...

    async def claim_provider_event(
        self,
        *,
        provider: str,
        event_id: str,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> tuple[BillingProviderEventReceipt, bool]: ...

    async def save_budget_reservation(
        self,
        *,
        reservation: AIBudgetReservation,
        actual_credits: int | None,
        reconciled_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> None: ...


class CommerceRepository(TortoiseORMRepository[CommercePlan]):
    """Canonical Tortoise persistence boundary for Commerce orchestration."""

    def __init__(self) -> None:
        super().__init__(CommercePlan)

    async def seed_plan(
        self,
        *,
        code: str,
        defaults: dict[str, Any],
        conn: BaseDBAsyncClient | None,
    ) -> tuple[CommercePlan, bool]:
        return await CommercePlan.get_or_create(code=code, defaults=defaults, using_db=conn)

    async def save_plan(
        self,
        *,
        plan: CommercePlan,
        conn: BaseDBAsyncClient | None,
        update_fields: list[str] | None = None,
    ) -> None:
        await plan.save(update_fields=update_fields, using_db=conn)

    async def list_plans(self, *, include_inactive: bool) -> list[CommercePlan]:
        query = CommercePlan.all()
        if not include_inactive:
            query = query.filter(is_active=True)
        return await query.order_by("sort_order", "code")

    async def list_workspace_subscriptions(
        self,
        *,
        workspace_ids: Iterable[UUID],
    ) -> dict[UUID, WorkspaceSubscription]:
        ids = list(set(workspace_ids))
        if not ids:
            return {}
        rows = await WorkspaceSubscription.filter(workspace_id__in=ids).select_related("plan")
        return {UUID(str(row.workspace_id)): row for row in rows}

    async def list_workspace_credit_accounts(
        self,
        *,
        workspace_ids: Iterable[UUID],
    ) -> dict[UUID, WorkspaceCreditAccount]:
        ids = list(set(workspace_ids))
        if not ids:
            return {}
        rows = await WorkspaceCreditAccount.filter(workspace_id__in=ids)
        return {UUID(str(row.workspace_id)): row for row in rows}

    async def summarize_workspace_usage(
        self,
        *,
        periods: Mapping[UUID, tuple[date, date]],
    ) -> dict[UUID, WorkspaceUsageAggregate]:
        query = Q()
        has_period = False
        for workspace_id, (period_start, period_end) in periods.items():
            period_query = Q(
                workspace_id=workspace_id,
                date__gte=period_start,
                date__lt=period_end,
            )
            query = period_query if not has_period else query | period_query
            has_period = True
        if not has_period:
            return {}

        rows = await cast(
            Any,
            AIUsageDaily
            .filter(query)
            .annotate(
                period_cost_micros=Sum("cost_micros"),
                requests=Sum("request_count"),
                prompt_tokens=Sum("prompt_tokens"),
                completion_tokens=Sum("completion_tokens"),
                observed_from=Min("date"),
                observed_to=Max("date"),
            )
            .group_by("workspace_id")
            .values(
                "workspace_id",
                "period_cost_micros",
                "requests",
                "prompt_tokens",
                "completion_tokens",
                "observed_from",
                "observed_to",
            ),
        )
        return {
            UUID(str(row["workspace_id"])): WorkspaceUsageAggregate(
                period_cost_micros=int(row["period_cost_micros"] or 0),
                requests=int(row["requests"] or 0),
                prompt_tokens=int(row["prompt_tokens"] or 0),
                completion_tokens=int(row["completion_tokens"] or 0),
                observed_from=cast(date, row["observed_from"]),
                observed_to=cast(date, row["observed_to"]),
            )
            for row in rows
        }

    async def lock_plan_catalog(self, *, code: str, conn: BaseDBAsyncClient) -> CommercePlan | None:
        query = CommercePlan.filter(code=code).select_for_update()
        return await self.using_db(query, conn).first()

    async def clear_default_plans(self, *, conn: BaseDBAsyncClient) -> None:
        await self.using_db(CommercePlan.filter(is_default=True), conn).update(is_default=False)

    async def get_plan_by_code(
        self,
        *,
        code: str,
        conn: BaseDBAsyncClient | None = None,
        active_only: bool = False,
    ) -> CommercePlan | None:
        query = CommercePlan.filter(code=code)
        if active_only:
            query = query.filter(is_active=True)
        return await self.using_db(query, conn).first()

    async def create_plan(
        self,
        *,
        code: str,
        values: dict[str, Any],
        conn: BaseDBAsyncClient,
    ) -> CommercePlan:
        return await CommercePlan.create(code=code, using_db=conn, **values)

    async def has_active_default_plan(self, *, conn: BaseDBAsyncClient) -> bool:
        query = CommercePlan.filter(is_default=True, is_active=True)
        return await self.using_db(query, conn).exists()

    async def get_default_plan(self, *, conn: BaseDBAsyncClient) -> CommercePlan | None:
        query = CommercePlan.filter(is_default=True, is_active=True)
        return await self.using_db(query, conn).first()

    async def get_plan(self, *, plan_id: UUID, conn: BaseDBAsyncClient) -> CommercePlan:
        return await CommercePlan.get(id=plan_id, using_db=conn)

    async def lock_workspace(self, *, workspace_id: UUID, conn: BaseDBAsyncClient) -> Workspace | None:
        query = Workspace.filter(id=workspace_id).select_for_update()
        return await self.using_db(query, conn).first()

    async def get_workspace(self, *, workspace_id: UUID, conn: BaseDBAsyncClient) -> Workspace:
        return await Workspace.get(id=workspace_id, using_db=conn)

    async def lock_subscription(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceSubscription | None:
        query = WorkspaceSubscription.filter(workspace_id=workspace_id).select_for_update()
        return await self.using_db(query, conn).first()

    async def create_subscription(
        self,
        *,
        values: dict[str, Any],
        conn: BaseDBAsyncClient,
    ) -> WorkspaceSubscription:
        return await WorkspaceSubscription.create(using_db=conn, **values)

    async def save_subscription(
        self,
        *,
        subscription: WorkspaceSubscription,
        conn: BaseDBAsyncClient,
    ) -> None:
        await subscription.save(using_db=conn)

    async def lock_credit_account_by_workspace(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceCreditAccount | None:
        query = WorkspaceCreditAccount.filter(workspace_id=workspace_id).select_for_update()
        return await self.using_db(query, conn).first()

    async def lock_credit_account_by_id(
        self,
        *,
        account_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceCreditAccount | None:
        query = WorkspaceCreditAccount.filter(id=account_id).select_for_update()
        return await self.using_db(query, conn).first()

    async def create_credit_account(
        self,
        *,
        values: dict[str, Any],
        conn: BaseDBAsyncClient,
    ) -> WorkspaceCreditAccount:
        return await WorkspaceCreditAccount.create(using_db=conn, **values)

    async def save_credit_account(
        self,
        *,
        account: WorkspaceCreditAccount,
        conn: BaseDBAsyncClient,
    ) -> None:
        await account.save(using_db=conn)

    async def write_credit_ledger(
        self,
        *,
        idempotency_key: str,
        defaults: dict[str, Any],
        conn: BaseDBAsyncClient,
    ) -> None:
        await WorkspaceCreditLedger.get_or_create(
            idempotency_key=idempotency_key,
            defaults=defaults,
            using_db=conn,
        )

    async def list_credit_ledger(
        self,
        *,
        workspace_id: UUID,
        limit: int,
        offset: int,
    ) -> tuple[int, list[WorkspaceCreditLedger]]:
        query = WorkspaceCreditLedger.filter(workspace_id=workspace_id).order_by("-created_at", "-id")
        total = int(await query.count())
        rows = await query.limit(limit).offset(offset)
        return total, rows

    async def list_usage(
        self,
        *,
        workspace_id: UUID,
        period_start: date,
        period_end: date,
    ) -> list[AIUsageDaily]:
        return await AIUsageDaily.filter(
            workspace_id=workspace_id,
            date__gte=period_start,
            date__lt=period_end,
        )

    async def claim_provider_event(
        self,
        *,
        provider: str,
        event_id: str,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> tuple[BillingProviderEventReceipt, bool]:
        return await BillingProviderEventReceipt.get_or_create(
            provider=provider,
            event_id=event_id,
            using_db=conn,
            defaults={"workspace_id": workspace_id},
        )

    async def save_budget_reservation(
        self,
        *,
        reservation: AIBudgetReservation,
        actual_credits: int | None,
        reconciled_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> None:
        update_fields = ["credits_reconciled_at", "updated_at"]
        reservation.credits_reconciled_at = reconciled_at
        if actual_credits is not None:
            reservation.actual_credits = actual_credits
            update_fields.insert(0, "actual_credits")
        await reservation.save(using_db=conn, update_fields=update_fields)

    async def get_active_checkout_plan(self, *, code: str) -> BillingCheckoutPlan | None:
        plan = await self.get_plan_by_code(code=code, active_only=True)
        if plan is None:
            return None
        return BillingCheckoutPlan(
            id=plan.id,
            code=plan.code,
            currency=plan.currency,
        )
