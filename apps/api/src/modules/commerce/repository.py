from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q
from tortoise.functions import Max, Min, Sum

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.ai.ai_budget_reservation import AIBudgetReservation
from src.models.ai.ai_usage_daily import AIUsageDaily
from src.models.commerce.billing import (
    CommercePlanRevision,
    CommercePlanRevisionEntitlement,
    CommercePlanRevisionPrice,
    CommercePlanRevisionResourceAllowance,
    CommerceProviderEventApplication,
    PlanRevisionStatus,
    WorkspaceCreditAccount,
    WorkspaceCreditLedger,
    WorkspaceSubscription,
)
from src.models.workspaces.workspace import Workspace
from src.modules.commerce.platform_schema import PlatformCommerceSubscriptionQuery


@dataclass(frozen=True, slots=True)
class WorkspaceUsageAggregate:
    period_cost_micros: int
    requests: int
    prompt_tokens: int
    completion_tokens: int
    observed_from: date
    observed_to: date


@dataclass(frozen=True, slots=True)
class CommercePlanRevisionTerms:
    """Immutable commercial declarations loaded for one published Revision."""

    prices: tuple[CommercePlanRevisionPrice, ...]
    resource_allowances: tuple[CommercePlanRevisionResourceAllowance, ...]
    entitlements: tuple[CommercePlanRevisionEntitlement, ...]


class CommerceRepository(TortoiseORMRepository[WorkspaceSubscription]):
    """Revision-bound persistence for Workspace commercial state."""

    def __init__(self) -> None:
        super().__init__(WorkspaceSubscription)

    async def lock_workspace(self, *, workspace_id: UUID, conn: BaseDBAsyncClient) -> Workspace | None:
        return await Workspace.filter(id=workspace_id).using_db(conn).select_for_update().first()

    async def lock_subscription(self, *, workspace_id: UUID, conn: BaseDBAsyncClient) -> WorkspaceSubscription | None:
        subscription = await (
            WorkspaceSubscription.filter(workspace_id=workspace_id).using_db(conn).select_for_update().first()
        )
        if subscription is not None:
            await subscription.fetch_related("plan_revision__plan")
        return subscription

    async def get_subscription(self, *, workspace_id: UUID) -> WorkspaceSubscription | None:
        return await (
            WorkspaceSubscription.filter(workspace_id=workspace_id).select_related("plan_revision__plan").first()
        )

    async def get_selling_revision(self, *, plan_code: str, conn: BaseDBAsyncClient) -> CommercePlanRevision | None:
        return await (
            CommercePlanRevision
            .filter(
                plan__code=plan_code,
                plan__is_active=True,
                status=PlanRevisionStatus.PUBLISHED,
                is_selling=True,
            )
            .using_db(conn)
            .select_related("plan")
            .first()
        )

    async def get_free_revision(self, *, conn: BaseDBAsyncClient) -> CommercePlanRevision | None:
        return await self.get_selling_revision(plan_code="free", conn=conn)

    async def create_subscription(self, *, values: dict[str, Any], conn: BaseDBAsyncClient) -> WorkspaceSubscription:
        return await WorkspaceSubscription.create(using_db=conn, **values)

    async def save_subscription(self, *, subscription: WorkspaceSubscription, conn: BaseDBAsyncClient) -> None:
        await subscription.save(using_db=conn)

    async def lock_credit_account_by_workspace(
        self, *, workspace_id: UUID, conn: BaseDBAsyncClient
    ) -> WorkspaceCreditAccount | None:
        account = await (
            WorkspaceCreditAccount.filter(workspace_id=workspace_id).using_db(conn).select_for_update().first()
        )
        if account is not None:
            await account.fetch_related("plan_revision")
        return account

    async def lock_credit_account_by_id(
        self, *, account_id: UUID, conn: BaseDBAsyncClient
    ) -> WorkspaceCreditAccount | None:
        account = await WorkspaceCreditAccount.filter(id=account_id).using_db(conn).select_for_update().first()
        if account is not None:
            await account.fetch_related("plan_revision")
        return account

    async def create_credit_account(self, *, values: dict[str, Any], conn: BaseDBAsyncClient) -> WorkspaceCreditAccount:
        return await WorkspaceCreditAccount.create(using_db=conn, **values)

    async def save_credit_account(self, *, account: WorkspaceCreditAccount, conn: BaseDBAsyncClient) -> None:
        await account.save(using_db=conn)

    async def write_credit_ledger(
        self, *, idempotency_key: str, defaults: dict[str, Any], conn: BaseDBAsyncClient
    ) -> WorkspaceCreditLedger:
        row, _ = await WorkspaceCreditLedger.get_or_create(
            workspace_id=defaults["workspace_id"],
            idempotency_key=idempotency_key,
            defaults=defaults,
            using_db=conn,
        )
        return row

    async def list_credit_ledger(
        self, *, workspace_id: UUID, limit: int, offset: int
    ) -> tuple[int, list[WorkspaceCreditLedger]]:
        query = WorkspaceCreditLedger.filter(workspace_id=workspace_id).order_by("-created_at", "-id")
        return int(await query.count()), await query.limit(limit).offset(offset)

    async def list_workspace_subscriptions(self, *, workspace_ids: Iterable[UUID]) -> dict[UUID, WorkspaceSubscription]:
        ids = list(set(workspace_ids))
        if not ids:
            return {}
        rows = await WorkspaceSubscription.filter(workspace_id__in=ids)
        revision_ids = [row.plan_revision_id for row in rows]
        revisions = await CommercePlanRevision.filter(id__in=revision_ids).select_related("plan")
        revisions_by_id = {revision.id: revision for revision in revisions}
        for row in rows:
            row.plan_revision = revisions_by_id[row.plan_revision_id]
        return {UUID(str(row.workspace_id)): row for row in rows}

    async def list_workspace_credit_accounts(
        self, *, workspace_ids: Iterable[UUID]
    ) -> dict[UUID, WorkspaceCreditAccount]:
        ids = list(set(workspace_ids))
        if not ids:
            return {}
        rows = await WorkspaceCreditAccount.filter(workspace_id__in=ids)
        return {UUID(str(row.workspace_id)): row for row in rows}

    async def summarize_workspace_usage(
        self, *, periods: Mapping[UUID, tuple[date, date]]
    ) -> dict[UUID, WorkspaceUsageAggregate]:
        query = Q()
        for index, (workspace_id, (start, end)) in enumerate(periods.items()):
            period_query = Q(workspace_id=workspace_id, date__gte=start, date__lt=end)
            query = period_query if index == 0 else query | period_query
        if not periods:
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

    async def claim_provider_event_application(
        self,
        *,
        provider: str,
        provider_mode: str,
        provider_account_id: str,
        provider_event_id: str,
        workspace_id: UUID,
        subscription_id: UUID,
        plan_revision_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> tuple[CommerceProviderEventApplication, bool]:
        return await CommerceProviderEventApplication.get_or_create(
            provider=provider,
            provider_mode=provider_mode,
            provider_account_id=provider_account_id,
            provider_event_id=provider_event_id,
            defaults={
                "workspace_id": workspace_id,
                "subscription_id": subscription_id,
                "plan_revision_id": plan_revision_id,
            },
            using_db=conn,
        )

    async def save_budget_reservation(
        self,
        *,
        reservation: AIBudgetReservation,
        actual_credits: int | None,
        reconciled_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> None:
        fields = ["credits_reconciled_at", "updated_at"]
        reservation.credits_reconciled_at = reconciled_at
        if actual_credits is not None:
            reservation.actual_credits = actual_credits
            fields.insert(0, "actual_credits")
        await reservation.save(using_db=conn, update_fields=fields)

    async def list_selling_revisions(self, *, include_inactive: bool) -> list[CommercePlanRevision]:
        query = CommercePlanRevision.filter(status=PlanRevisionStatus.PUBLISHED, is_selling=True).select_related("plan")
        if not include_inactive:
            query = query.filter(plan__is_active=True)
        return await query.order_by("plan__sort_order", "plan__code")

    async def list_platform_subscriptions(
        self, *, query: PlatformCommerceSubscriptionQuery
    ) -> tuple[list[WorkspaceSubscription], int]:
        subscriptions = WorkspaceSubscription.all().select_related("plan_revision__plan")
        if query.plan_code is not None:
            subscriptions = subscriptions.filter(plan_revision__plan__code=query.plan_code)
        if query.status is not None:
            subscriptions = subscriptions.filter(status=query.status)
        if query.provider is not None:
            subscriptions = subscriptions.filter(billing_provider=query.provider)
        subscriptions = subscriptions.order_by("current_period_end", "workspace_id")
        total = await subscriptions.count()
        offset = (query.page - 1) * query.page_size
        return await subscriptions.offset(offset).limit(query.page_size), total

    async def get_revision_terms(self, *, revision_ids: Iterable[UUID]) -> dict[UUID, CommercePlanRevisionTerms]:
        ids = tuple(set(revision_ids))
        if not ids:
            return {}
        prices = await CommercePlanRevisionPrice.filter(plan_revision_id__in=ids).order_by(
            "plan_revision_id", "provider", "provider_mode", "billing_cycle"
        )
        allowances = await (
            CommercePlanRevisionResourceAllowance
            .filter(plan_revision_id__in=ids)
            .select_related("resource")
            .order_by("plan_revision_id", "resource__key")
        )
        entitlements = await (
            CommercePlanRevisionEntitlement
            .filter(plan_revision_id__in=ids)
            .select_related("entitlement")
            .order_by("plan_revision_id", "entitlement__key")
        )
        prices_by_revision: dict[UUID, list[CommercePlanRevisionPrice]] = {revision_id: [] for revision_id in ids}
        allowances_by_revision: dict[UUID, list[CommercePlanRevisionResourceAllowance]] = {
            revision_id: [] for revision_id in ids
        }
        entitlements_by_revision: dict[UUID, list[CommercePlanRevisionEntitlement]] = {
            revision_id: [] for revision_id in ids
        }
        for price in prices:
            prices_by_revision[UUID(str(price.plan_revision_id))].append(price)
        for allowance in allowances:
            allowances_by_revision[UUID(str(allowance.plan_revision_id))].append(allowance)
        for entitlement in entitlements:
            entitlements_by_revision[UUID(str(entitlement.plan_revision_id))].append(entitlement)
        return {
            revision_id: CommercePlanRevisionTerms(
                prices=tuple(prices_by_revision[revision_id]),
                resource_allowances=tuple(allowances_by_revision[revision_id]),
                entitlements=tuple(entitlements_by_revision[revision_id]),
            )
            for revision_id in ids
        }
