from __future__ import annotations

from asyncio import gather
from collections.abc import Iterable, Mapping
from datetime import date
from typing import Protocol
from uuid import UUID

from src.config import Settings
from src.core.i18n import t
from src.core.services.base import BaseService
from src.models.commerce.billing import (
    CreditRefreshInterval,
    SubscriptionStatus,
    WorkspaceCreditAccount,
    WorkspaceSubscription,
)
from src.modules.commerce.repository import CommerceRepository, WorkspaceUsageAggregate
from src.modules.commerce.schema import (
    WorkspaceCommerceDirectoryDataState,
    WorkspaceCommerceDirectoryOut,
    WorkspaceCommerceDirectoryRisk,
    WorkspaceCommerceDirectoryUsageOut,
    WorkspaceCommerceUsageCoverage,
    WorkspaceCreditsOut,
)


class WorkspaceCommerceDirectoryPersistence(Protocol):
    async def list_workspace_subscriptions(
        self,
        *,
        workspace_ids: Iterable[UUID],
    ) -> dict[UUID, WorkspaceSubscription]: ...

    async def list_workspace_credit_accounts(
        self,
        *,
        workspace_ids: Iterable[UUID],
    ) -> dict[UUID, WorkspaceCreditAccount]: ...

    async def summarize_workspace_usage(
        self,
        *,
        periods: Mapping[UUID, tuple[date, date]],
    ) -> dict[UUID, WorkspaceUsageAggregate]: ...


def _risk(
    subscription: WorkspaceSubscription | None,
    account: WorkspaceCreditAccount | None,
) -> WorkspaceCommerceDirectoryRisk:
    if subscription is None or account is None:
        return WorkspaceCommerceDirectoryRisk.DATA_MISSING
    available = int(account.balance_credits) - int(account.reserved_credits)
    if subscription.status in {SubscriptionStatus.PAST_DUE, SubscriptionStatus.CANCELED}:
        return WorkspaceCommerceDirectoryRisk.ATTENTION_REQUIRED
    if available <= 0 or int(account.period_spent_credits) > int(account.period_granted_credits):
        return WorkspaceCommerceDirectoryRisk.ATTENTION_REQUIRED
    return WorkspaceCommerceDirectoryRisk.HEALTHY


class WorkspaceCommerceDirectoryService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        repository: WorkspaceCommerceDirectoryPersistence,
    ) -> None:
        super().__init__(settings)
        self._repository = repository

    async def list_projections(
        self,
        *,
        workspace_ids: Iterable[UUID],
    ) -> dict[UUID, WorkspaceCommerceDirectoryOut]:
        ids = list(dict.fromkeys(workspace_ids))
        subscriptions, accounts = await gather(
            self._repository.list_workspace_subscriptions(workspace_ids=ids),
            self._repository.list_workspace_credit_accounts(workspace_ids=ids),
        )
        periods = {
            workspace_id: (account.period_start.date(), account.period_end.date())
            for workspace_id, account in accounts.items()
        }
        usage = await self._repository.summarize_workspace_usage(periods=periods)
        return {
            workspace_id: self._build_projection(
                subscription=subscriptions.get(workspace_id),
                account=accounts.get(workspace_id),
                usage=usage.get(workspace_id),
            )
            for workspace_id in ids
        }

    def _build_projection(
        self,
        *,
        subscription: WorkspaceSubscription | None,
        account: WorkspaceCreditAccount | None,
        usage: WorkspaceUsageAggregate | None,
    ) -> WorkspaceCommerceDirectoryOut:
        if subscription is None:
            return WorkspaceCommerceDirectoryOut(
                data_state=WorkspaceCommerceDirectoryDataState.MISSING,
                risk=WorkspaceCommerceDirectoryRisk.DATA_MISSING,
            )

        plan = subscription.plan
        captured_at = subscription.updated_at
        if account is not None and account.updated_at > captured_at:
            captured_at = account.updated_at
        data_state = (
            WorkspaceCommerceDirectoryDataState.COMPLETE
            if account is not None
            else WorkspaceCommerceDirectoryDataState.PARTIAL
        )
        plan_name = t("commerce", plan.name_i18n_key) if plan.name_i18n_key else plan.name
        return WorkspaceCommerceDirectoryOut(
            data_state=data_state,
            risk=_risk(subscription, account),
            captured_at=captured_at,
            billing_provider=subscription.billing_provider,
            plan_code=plan.code,
            plan_name=plan_name,
            plan_tier=plan.tier,
            credit_refresh_interval=plan.credit_refresh_interval,
            subscription_status=subscription.status,
            billing_interval=subscription.billing_cycle,
            current_period_start=subscription.current_period_start,
            current_period_end=subscription.current_period_end,
            renewal_at=None if subscription.cancel_at_period_end else subscription.current_period_end,
            cancel_at_period_end=subscription.cancel_at_period_end,
            credits=self._credits(account=account, refresh_interval=plan.credit_refresh_interval),
            usage=self._usage(account=account, usage=usage),
        )

    @staticmethod
    def _credits(
        *,
        account: WorkspaceCreditAccount | None,
        refresh_interval: CreditRefreshInterval,
    ) -> WorkspaceCreditsOut | None:
        if account is None:
            return None
        return WorkspaceCreditsOut(
            balance=int(account.balance_credits),
            reserved=int(account.reserved_credits),
            available=max(int(account.balance_credits) - int(account.reserved_credits), 0),
            lifetime_granted=int(account.lifetime_granted_credits),
            lifetime_spent=int(account.lifetime_spent_credits),
            period_granted=int(account.period_granted_credits),
            period_spent=int(account.period_spent_credits),
            period_start=account.period_start,
            period_end=account.period_end,
            next_refresh_at=None if refresh_interval == CreditRefreshInterval.NONE else account.period_end,
        )

    @staticmethod
    def _usage(
        *,
        account: WorkspaceCreditAccount | None,
        usage: WorkspaceUsageAggregate | None,
    ) -> WorkspaceCommerceDirectoryUsageOut | None:
        if account is None:
            return None
        return WorkspaceCommerceDirectoryUsageOut(
            window_start=account.period_start,
            window_end=account.period_end,
            coverage=(
                WorkspaceCommerceUsageCoverage.DAILY_ROLLUP
                if usage is not None
                else WorkspaceCommerceUsageCoverage.NO_OBSERVED_USAGE
            ),
            observed_from=usage.observed_from if usage is not None else None,
            observed_to=usage.observed_to if usage is not None else None,
            period_cost_micros=usage.period_cost_micros if usage is not None else 0,
            requests=usage.requests if usage is not None else 0,
            prompt_tokens=usage.prompt_tokens if usage is not None else 0,
            completion_tokens=usage.completion_tokens if usage is not None else 0,
        )


def build_workspace_commerce_directory_service(settings: Settings) -> WorkspaceCommerceDirectoryService:
    return WorkspaceCommerceDirectoryService(settings, repository=CommerceRepository())
