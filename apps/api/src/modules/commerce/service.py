from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any, cast
from uuid import NAMESPACE_URL, UUID, uuid5

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.utils.ids import uuid7
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.i18n import t
from src.core.services import BaseService
from src.models.commerce.billing import (
    BillingCycle,
    CommercePlan,
    CommercePlanTier,
    CreditLedgerEntryType,
    CreditRefreshInterval,
    SubscriptionStatus,
    WorkspaceCreditAccount,
    WorkspaceCreditLedger,
    WorkspaceSubscription,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.commerce.repository import CommercePersistence, CommerceRepository
from src.modules.commerce.schema import (
    CommercePlanOut,
    CommercePlanUpsertRequest,
    CreditLedgerOut,
    PlanFeature,
    WorkspaceCommerceOverviewOut,
    WorkspaceCommerceUsageOut,
    WorkspaceCreditsOut,
    WorkspaceSubscriptionOut,
    WorkspaceSubscriptionSetRequest,
)

if TYPE_CHECKING:
    from src.models.ai.ai_budget_reservation import AIBudgetReservation

_BILLING_MODE = "external_checkout"
_ACTIVE_SUBSCRIPTION_STATUSES = {SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE}
_PLAN_CATALOG_LOCK_CODE = "free"

_DEFAULT_PLANS: tuple[dict[str, Any], ...] = (
    {
        "code": _PLAN_CATALOG_LOCK_CODE,
        "tier": CommercePlanTier.FREE,
        "name": "PLAN_DEFAULT_FREE_NAME",
        "description": "PLAN_DEFAULT_FREE_DESCRIPTION",
        "name_i18n_key": "PLAN_DEFAULT_FREE_NAME",
        "description_i18n_key": "PLAN_DEFAULT_FREE_DESCRIPTION",
        "credit_grant_amount": 70,
        "credit_refresh_interval": CreditRefreshInterval.DAILY,
        "credit_value_micros": 1_000,
        "price_monthly_micros": 0,
        "price_yearly_micros": 0,
        "currency": "USD",
        "features": [
            {
                "key": "ai_credits",
                "label": "PLAN_DEFAULT_FREE_FEATURE_AI_CREDITS",
                "labelI18nKey": "PLAN_DEFAULT_FREE_FEATURE_AI_CREDITS",
                "included": True,
                "value": 70,
            },
            {
                "key": "workspace",
                "label": "PLAN_DEFAULT_FREE_FEATURE_WORKSPACE",
                "labelI18nKey": "PLAN_DEFAULT_FREE_FEATURE_WORKSPACE",
                "included": True,
            },
            {
                "key": "sites.generate",
                "label": "PLAN_DEFAULT_FREE_FEATURE_SITE_GENERATION",
                "labelI18nKey": "PLAN_DEFAULT_FREE_FEATURE_SITE_GENERATION",
                "included": True,
            },
        ],
        "is_active": True,
        "is_default": True,
        "sort_order": 10,
    },
    {
        "code": "premium",
        "tier": CommercePlanTier.PREMIUM,
        "name": "PLAN_DEFAULT_PREMIUM_NAME",
        "description": "PLAN_DEFAULT_PREMIUM_DESCRIPTION",
        "name_i18n_key": "PLAN_DEFAULT_PREMIUM_NAME",
        "description_i18n_key": "PLAN_DEFAULT_PREMIUM_DESCRIPTION",
        "credit_grant_amount": 10_000,
        "credit_refresh_interval": CreditRefreshInterval.MONTHLY,
        "credit_value_micros": 1_000,
        "price_monthly_micros": 19_000_000,
        "price_yearly_micros": 190_000_000,
        "currency": "USD",
        "features": [
            {
                "key": "ai_credits",
                "label": "PLAN_DEFAULT_PREMIUM_FEATURE_AI_CREDITS",
                "labelI18nKey": "PLAN_DEFAULT_PREMIUM_FEATURE_AI_CREDITS",
                "included": True,
                "value": 10_000,
            },
            {
                "key": "priority_support",
                "label": "PLAN_DEFAULT_PREMIUM_FEATURE_PRIORITY_SUPPORT",
                "labelI18nKey": "PLAN_DEFAULT_PREMIUM_FEATURE_PRIORITY_SUPPORT",
                "included": True,
            },
            {
                "key": "sites.generate",
                "label": "PLAN_DEFAULT_PREMIUM_FEATURE_SITE_GENERATION",
                "labelI18nKey": "PLAN_DEFAULT_PREMIUM_FEATURE_SITE_GENERATION",
                "included": True,
            },
        ],
        "is_active": True,
        "is_default": False,
        "sort_order": 20,
    },
)


def _feature_records(raw_features: object, *, source: str) -> list[dict[str, Any]]:
    if not isinstance(raw_features, list):
        raise ValueError(f"{source} commerce plan features must be a list")
    records: list[dict[str, Any]] = []
    keys: set[str] = set()
    for raw_feature in raw_features:
        if not isinstance(raw_feature, dict):
            raise ValueError(f"{source} commerce plan features must contain objects")
        record = cast(dict[str, Any], raw_feature)
        feature = PlanFeature.model_validate(record)
        if feature.key in keys:
            raise ValueError(f"{source} commerce plan features must use unique keys")
        keys.add(feature.key)
        records.append(deepcopy(record))
    return records


def _merge_missing_seed_features(
    *,
    stored_features: object,
    seeded_features: object,
) -> list[dict[str, Any]] | None:
    stored = _feature_records(stored_features, source="stored")
    seeded = _feature_records(seeded_features, source="seeded")
    stored_keys = {str(feature["key"]) for feature in stored}
    missing = [feature for feature in seeded if str(feature["key"]) not in stored_keys]
    return [*stored, *missing] if missing else None


def _billing_period(now: datetime, cycle: BillingCycle) -> tuple[datetime, datetime]:
    start = now
    if cycle == BillingCycle.YEARLY:
        try:
            return start, start.replace(year=start.year + 1)
        except ValueError:
            return start, start.replace(year=start.year + 1, day=28)
    if start.month == 12:
        return start, start.replace(year=start.year + 1, month=1)
    return start, start.replace(month=start.month + 1)


def _credit_period(
    now: datetime,
    interval: CreditRefreshInterval,
    *,
    none_period_end: datetime | None = None,
) -> tuple[datetime, datetime]:
    if interval == CreditRefreshInterval.DAILY:
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return start, start + timedelta(days=1)
    if interval == CreditRefreshInterval.YEARLY:
        start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        return start, start.replace(year=start.year + 1)
    if interval == CreditRefreshInterval.NONE:
        if none_period_end is None or none_period_end <= now:
            raise ValueError("none refresh intervals require a future subscription period end")
        return now, none_period_end
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        return start, start.replace(year=start.year + 1, month=1)
    return start, start.replace(month=start.month + 1)


def _localized_plan_features(raw_features: object) -> list[PlanFeature]:
    if not isinstance(raw_features, list):
        raise ValueError("commerce plan features must be a list")
    features: list[PlanFeature] = []
    for raw_feature in raw_features:
        if not isinstance(raw_feature, dict):
            raise ValueError("commerce plan features must contain objects")
        feature = dict(raw_feature)
        label_key = feature.pop("labelI18nKey", None)
        description_key = feature.pop("descriptionI18nKey", None)
        if isinstance(label_key, str):
            feature["label"] = t("commerce", label_key)
        if isinstance(description_key, str):
            feature["description"] = t("commerce", description_key)
        features.append(PlanFeature.model_validate(feature))
    return features


def _plan_out(plan: CommercePlan) -> CommercePlanOut:
    name_key = plan.name_i18n_key
    description_key = plan.description_i18n_key
    return CommercePlanOut(
        id=plan.id,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
        code=plan.code,
        tier=plan.tier,
        name=_plan_name(plan),
        description=t("commerce", description_key) if description_key else plan.description,
        credit_grant_amount=int(plan.credit_grant_amount),
        credit_refresh_interval=plan.credit_refresh_interval,
        credit_value_micros=int(plan.credit_value_micros),
        price_monthly_micros=int(plan.price_monthly_micros),
        price_yearly_micros=int(plan.price_yearly_micros),
        currency=plan.currency,
        features=_localized_plan_features(plan.features),
        is_active=bool(plan.is_active),
        is_default=bool(plan.is_default),
        sort_order=int(plan.sort_order),
    )


def _plan_name(plan: CommercePlan) -> str:
    return t("commerce", plan.name_i18n_key) if plan.name_i18n_key else plan.name


def _ledger_out(row: WorkspaceCreditLedger) -> CreditLedgerOut:
    return CreditLedgerOut(
        id=row.id,
        created_at=row.created_at,
        updated_at=row.updated_at,
        workspace_id=row.workspace_id,
        account_id=row.account_id,
        entry_type=row.entry_type,
        delta_balance_credits=int(row.delta_balance_credits),
        delta_reserved_credits=int(row.delta_reserved_credits),
        balance_after_credits=int(row.balance_after_credits),
        reserved_after_credits=int(row.reserved_after_credits),
        reference_type=row.reference_type,
        reference_id=row.reference_id,
        actor_user_id=row.actor_user_id,
        description_key=row.description_key,
        description=t("commerce", row.description_key),
        details=row.details,
    )


def _subscription_out(subscription: WorkspaceSubscription) -> WorkspaceSubscriptionOut:
    return WorkspaceSubscriptionOut(
        id=subscription.id,
        created_at=subscription.created_at,
        updated_at=subscription.updated_at,
        status=subscription.status,
        billing_interval=subscription.billing_cycle,
        current_period_start=subscription.current_period_start,
        current_period_end=subscription.current_period_end,
        cancel_at_period_end=subscription.cancel_at_period_end,
    )


class CommerceService(BaseService):
    def __init__(self, settings: Settings, *, repository: CommercePersistence) -> None:
        super().__init__(settings)
        self._settings = settings
        self._repository = repository

    async def ensure_plan_catalog(self, *, conn: BaseDBAsyncClient | None = None) -> None:
        for definition in _DEFAULT_PLANS:
            code = str(definition["code"])
            defaults = {key: value for key, value in definition.items() if key != "code"}
            plan, created = await self._repository.seed_plan(code=code, defaults=defaults, conn=conn)
            if created:
                continue
            merged_features = _merge_missing_seed_features(
                stored_features=plan.features,
                seeded_features=definition["features"],
            )
            if merged_features is None:
                continue
            plan.features = merged_features
            await self._repository.save_plan(plan=plan, conn=conn, update_fields=["features"])

    async def list_plans(self, *, include_inactive: bool) -> list[CommercePlanOut]:
        await self.ensure_plan_catalog()
        rows = await self._repository.list_plans(include_inactive=include_inactive)
        return [_plan_out(row) for row in rows]

    async def upsert_plan(self, *, code: str, payload: CommercePlanUpsertRequest) -> CommercePlanOut:
        async with self.tx() as conn:
            await self.ensure_plan_catalog(conn=conn)
            # A stable seeded row serializes catalog-wide default-plan changes,
            # including concurrent creation of different plan codes.
            catalog_lock = await self._repository.lock_plan_catalog(code=_PLAN_CATALOG_LOCK_CODE, conn=conn)
            if catalog_lock is None:
                raise RuntimeError("Commerce plan catalog lock row is missing")
            if payload.is_default:
                await self._repository.clear_default_plans(conn=conn)
            values = payload.model_dump(mode="python")
            values["features"] = [feature.model_dump(mode="json") for feature in payload.features]
            values["name_i18n_key"] = None
            values["description_i18n_key"] = None
            plan = await self._repository.get_plan_by_code(code=code, conn=conn)
            if plan is None:
                plan = await self._repository.create_plan(code=code, values=values, conn=conn)
            else:
                for field, value in values.items():
                    setattr(plan, field, value)
                await self._repository.save_plan(plan=plan, conn=conn)
            if not await self._repository.has_active_default_plan(conn=conn):
                raise Conflict(
                    message=t("errors", "COMMERCE_DEFAULT_PLAN_REQUIRED"),
                    error="COMMERCE_DEFAULT_PLAN_REQUIRED",
                )
            await write_required_activity_event(
                settings=self._settings,
                conn=conn,
                payload=ActivityAuditPayload(
                    event_name="commerce.plan.updated",
                    entity_type="commerce_plan",
                    entity_id=plan.id,
                    properties={"code": plan.code, "is_active": bool(plan.is_active)},
                ),
            )
        return _plan_out(plan)

    async def _default_plan(self, *, conn: BaseDBAsyncClient) -> CommercePlan:
        await self.ensure_plan_catalog(conn=conn)
        plan = await self._repository.get_default_plan(conn=conn)
        if plan is None:
            raise Conflict(
                message=t("errors", "COMMERCE_DEFAULT_PLAN_REQUIRED"),
                error="COMMERCE_DEFAULT_PLAN_REQUIRED",
            )
        return plan

    async def _write_ledger(
        self,
        *,
        conn: BaseDBAsyncClient,
        account: WorkspaceCreditAccount,
        entry_type: CreditLedgerEntryType,
        delta_balance: int,
        delta_reserved: int,
        reference_type: str,
        reference_id: UUID | None,
        idempotency_key: str,
        actor_user_id: UUID | None,
        description_key: str,
        details: dict[str, Any],
    ) -> None:
        await self._repository.write_credit_ledger(
            idempotency_key=idempotency_key,
            defaults={
                "workspace_id": account.workspace_id,
                "account_id": account.id,
                "entry_type": entry_type,
                "delta_balance_credits": delta_balance,
                "delta_reserved_credits": delta_reserved,
                "balance_after_credits": account.balance_credits,
                "reserved_after_credits": account.reserved_credits,
                "reference_type": reference_type,
                "reference_id": reference_id,
                "actor_user_id": actor_user_id,
                "description_key": description_key,
                "details": details,
            },
            conn=conn,
        )

    async def _refresh_account(
        self,
        *,
        conn: BaseDBAsyncClient,
        account: WorkspaceCreditAccount,
        plan: CommercePlan,
        now: datetime,
        actor_user_id: UUID | None,
        reference_type: str,
        reference_id: UUID | None,
        none_period_end: datetime | None = None,
    ) -> None:
        period_start, period_end = _credit_period(
            now,
            plan.credit_refresh_interval,
            none_period_end=none_period_end,
        )
        operation_key = str(reference_id) if reference_id is not None else period_start.isoformat()
        unreserved_balance = max(int(account.balance_credits) - int(account.reserved_credits), 0)
        if unreserved_balance:
            account.balance_credits -= unreserved_balance
            await self._write_ledger(
                conn=conn,
                account=account,
                entry_type=CreditLedgerEntryType.EXPIRATION,
                delta_balance=-unreserved_balance,
                delta_reserved=0,
                reference_type=reference_type,
                reference_id=reference_id,
                idempotency_key=(
                    f"credit-expiration:{account.workspace_id}:{reference_type}:{operation_key}:{plan.code}"
                ),
                actor_user_id=actor_user_id,
                description_key="LEDGER_PERIOD_EXPIRATION",
                details={"planCode": plan.code},
            )
        grant = int(plan.credit_grant_amount)
        account.balance_credits += grant
        account.lifetime_granted_credits += grant
        account.period_granted_credits = grant
        account.period_spent_credits = 0
        account.period_start = period_start
        account.period_end = period_end
        await self._repository.save_credit_account(account=account, conn=conn)
        await self._write_ledger(
            conn=conn,
            account=account,
            entry_type=CreditLedgerEntryType.PERIOD_GRANT,
            delta_balance=grant,
            delta_reserved=0,
            reference_type=reference_type,
            reference_id=reference_id,
            idempotency_key=f"credit-grant:{account.workspace_id}:{reference_type}:{operation_key}:{plan.code}",
            actor_user_id=actor_user_id,
            description_key="LEDGER_PERIOD_GRANT",
            details={
                "planCode": plan.code,
                "creditValueMicros": int(plan.credit_value_micros),
                "refreshInterval": plan.credit_refresh_interval.value,
            },
        )

    async def _ensure_workspace_billing(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
        now: datetime,
    ) -> tuple[WorkspaceSubscription, WorkspaceCreditAccount, CommercePlan]:
        workspace = await self._repository.lock_workspace(workspace_id=workspace_id, conn=conn)
        if workspace is None:
            raise NotFound(
                message=t("errors", "WORKSPACE_NOT_FOUND"),
                error="WORKSPACE_NOT_FOUND",
            )
        subscription = await self._repository.lock_subscription(workspace_id=workspace_id, conn=conn)
        if subscription is None:
            plan = await self._default_plan(conn=conn)
            billing_start, billing_end = _billing_period(now, BillingCycle.MONTHLY)
            subscription = await self._repository.create_subscription(
                values={
                    "workspace_id": workspace_id,
                    "plan_id": plan.id,
                    "status": SubscriptionStatus.ACTIVE,
                    "billing_cycle": BillingCycle.MONTHLY,
                    "current_period_start": billing_start,
                    "current_period_end": billing_end,
                },
                conn=conn,
            )
            subscription.plan = plan
        else:
            plan = await self._repository.get_plan(plan_id=subscription.plan_id, conn=conn)
            subscription.plan = plan

        if now >= subscription.current_period_end:
            if subscription.cancel_at_period_end:
                subscription.status = SubscriptionStatus.CANCELED
            elif subscription.status in _ACTIVE_SUBSCRIPTION_STATUSES:
                start, end = _billing_period(now, subscription.billing_cycle)
                subscription.current_period_start = start
                subscription.current_period_end = end
            await self._repository.save_subscription(subscription=subscription, conn=conn)

        account = await self._repository.lock_credit_account_by_workspace(workspace_id=workspace_id, conn=conn)
        if account is None:
            credit_start, credit_end = _credit_period(
                now,
                plan.credit_refresh_interval,
                none_period_end=subscription.current_period_end,
            )
            account = await self._repository.create_credit_account(
                values={
                    "workspace_id": workspace_id,
                    "subscription_id": subscription.id,
                    "period_start": credit_start,
                    "period_end": credit_end,
                },
                conn=conn,
            )
            await self._refresh_account(
                conn=conn,
                account=account,
                plan=plan,
                now=now,
                actor_user_id=None,
                reference_type="subscription",
                reference_id=subscription.id,
                none_period_end=subscription.current_period_end,
            )
        elif now >= account.period_end and subscription.status in _ACTIVE_SUBSCRIPTION_STATUSES:
            if plan.credit_refresh_interval == CreditRefreshInterval.NONE:
                account.period_start = subscription.current_period_start
                account.period_end = subscription.current_period_end
                account.period_granted_credits = 0
                account.period_spent_credits = 0
                await self._repository.save_credit_account(account=account, conn=conn)
            else:
                await self._refresh_account(
                    conn=conn,
                    account=account,
                    plan=plan,
                    now=now,
                    actor_user_id=None,
                    reference_type="period_refresh",
                    reference_id=None,
                )
        return subscription, account, plan

    async def ensure_workspace_billing(
        self,
        *,
        workspace_id: UUID,
    ) -> tuple[WorkspaceSubscription, WorkspaceCreditAccount, CommercePlan]:
        async with self.tx() as conn:
            return await self._ensure_workspace_billing(
                workspace_id=workspace_id,
                conn=conn,
                now=datetime.now(UTC),
            )

    async def ensure_workspace_billing_in_transaction(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> tuple[WorkspaceSubscription, WorkspaceCreditAccount, CommercePlan]:
        return await self._ensure_workspace_billing(
            workspace_id=workspace_id,
            conn=conn,
            now=datetime.now(UTC),
        )

    async def write_credit_ledger_entry(
        self,
        *,
        conn: BaseDBAsyncClient,
        account: WorkspaceCreditAccount,
        entry_type: CreditLedgerEntryType,
        delta_balance: int,
        delta_reserved: int,
        reference_type: str,
        reference_id: UUID | None,
        idempotency_key: str,
        actor_user_id: UUID | None,
        description_key: str,
        details: dict[str, Any],
    ) -> None:
        await self._write_ledger(
            conn=conn,
            account=account,
            entry_type=entry_type,
            delta_balance=delta_balance,
            delta_reserved=delta_reserved,
            reference_type=reference_type,
            reference_id=reference_id,
            idempotency_key=idempotency_key,
            actor_user_id=actor_user_id,
            description_key=description_key,
            details=details,
        )

    async def lock_credit_account(
        self,
        *,
        account_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceCreditAccount | None:
        return await self._repository.lock_credit_account_by_id(account_id=account_id, conn=conn)

    async def save_credit_account(
        self,
        *,
        account: WorkspaceCreditAccount,
        conn: BaseDBAsyncClient,
    ) -> None:
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
            reservation=reservation,
            actual_credits=actual_credits,
            reconciled_at=reconciled_at,
            conn=conn,
        )

    async def get_overview(self, *, workspace_id: UUID) -> WorkspaceCommerceOverviewOut:
        subscription, account, plan = await self.ensure_workspace_billing(workspace_id=workspace_id)
        usage_rows = await self._repository.list_usage(
            workspace_id=workspace_id,
            period_start=account.period_start.date(),
            period_end=account.period_end.date(),
        )
        return WorkspaceCommerceOverviewOut(
            billing_mode=_BILLING_MODE,
            billing_provider=self._settings.billing.provider,
            checkout_enabled=self._settings.billing.checkout_enabled,
            plan=_plan_out(plan),
            subscription=_subscription_out(subscription),
            credits=WorkspaceCreditsOut(
                balance=int(account.balance_credits),
                reserved=int(account.reserved_credits),
                available=max(int(account.balance_credits) - int(account.reserved_credits), 0),
                lifetime_granted=int(account.lifetime_granted_credits),
                lifetime_spent=int(account.lifetime_spent_credits),
                period_granted=int(account.period_granted_credits),
                period_spent=int(account.period_spent_credits),
                period_start=account.period_start,
                period_end=account.period_end,
                next_refresh_at=(
                    None if plan.credit_refresh_interval == CreditRefreshInterval.NONE else account.period_end
                ),
            ),
            usage=WorkspaceCommerceUsageOut(
                period_cost_micros=sum(int(row.cost_micros) for row in usage_rows),
                requests=sum(int(row.request_count) for row in usage_rows),
                prompt_tokens=sum(int(row.prompt_tokens) for row in usage_rows),
                completion_tokens=sum(int(row.completion_tokens) for row in usage_rows),
            ),
        )

    async def list_credit_ledger(
        self,
        *,
        workspace_id: UUID,
        params: PageParams,
    ) -> PageData[CreditLedgerOut]:
        total, rows = await self._repository.list_credit_ledger(
            workspace_id=workspace_id,
            limit=params.limit,
            offset=params.offset,
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

    async def _apply_subscription(
        self,
        *,
        conn: BaseDBAsyncClient,
        workspace_id: UUID,
        plan: CommercePlan,
        actor_user_id: UUID | None,
        payload: WorkspaceSubscriptionSetRequest,
        reference_type: str,
        reference_id: UUID | None,
        refresh_credits: bool = True,
        billing_provider: str | None = None,
        external_customer_id: str | None = None,
        external_subscription_id: str | None = None,
    ) -> tuple[WorkspaceSubscription, WorkspaceCreditAccount]:
        now = datetime.now(UTC)
        subscription, account, _ = await self._ensure_workspace_billing(
            workspace_id=workspace_id,
            conn=conn,
            now=now,
        )
        billing_start, billing_end = _billing_period(now, payload.billing_interval)
        subscription.plan_id = plan.id
        subscription.status = payload.status
        subscription.billing_cycle = payload.billing_interval
        subscription.current_period_start = payload.current_period_start or billing_start
        subscription.current_period_end = payload.current_period_end or billing_end
        subscription.cancel_at_period_end = payload.cancel_at_period_end
        if billing_provider is not None:
            subscription.billing_provider = billing_provider
        if external_customer_id is not None:
            subscription.external_customer_id = external_customer_id
        if external_subscription_id is not None:
            subscription.external_subscription_id = external_subscription_id
        await self._repository.save_subscription(subscription=subscription, conn=conn)
        if refresh_credits:
            await self._refresh_account(
                conn=conn,
                account=account,
                plan=plan,
                now=now,
                actor_user_id=actor_user_id,
                reference_type=reference_type,
                reference_id=reference_id,
                none_period_end=subscription.current_period_end,
            )
        return subscription, account

    async def _apply_claimed_provider_subscription(
        self,
        *,
        conn: BaseDBAsyncClient,
        workspace_id: UUID,
        plan_code: str,
        status: SubscriptionStatus,
        billing_interval: BillingCycle,
        current_period_start: datetime,
        current_period_end: datetime,
        cancel_at_period_end: bool,
        provider: str,
        external_customer_id: str,
        external_subscription_id: str,
        event_id: str,
    ) -> None:
        reference_id = uuid5(NAMESPACE_URL, f"{provider}:{event_id}")
        await self.ensure_plan_catalog(conn=conn)
        plan = await self._repository.get_plan_by_code(code=plan_code, conn=conn, active_only=True)
        if plan is None:
            raise NotFound(error="COMMERCE_PLAN_NOT_FOUND")
        current, _, current_plan = await self._ensure_workspace_billing(
            workspace_id=workspace_id,
            conn=conn,
            now=datetime.now(UTC),
        )
        refresh_credits = status in _ACTIVE_SUBSCRIPTION_STATUSES and (
            current_plan.id != plan.id or current_period_start > current.current_period_start
        )
        subscription, _ = await self._apply_subscription(
            conn=conn,
            workspace_id=workspace_id,
            plan=plan,
            actor_user_id=None,
            payload=WorkspaceSubscriptionSetRequest(
                plan_code=plan_code,
                status=status,
                billing_interval=billing_interval,
                current_period_start=current_period_start,
                current_period_end=current_period_end,
                cancel_at_period_end=cancel_at_period_end,
            ),
            reference_type="provider_event",
            reference_id=reference_id,
            refresh_credits=refresh_credits,
            billing_provider=provider,
            external_customer_id=external_customer_id,
            external_subscription_id=external_subscription_id,
        )
        workspace = await self._repository.get_workspace(workspace_id=workspace_id, conn=conn)
        await write_required_activity_event(
            settings=self._settings,
            conn=conn,
            payload=ActivityAuditPayload(
                event_name="commerce.subscription.provider_updated",
                organization_id=workspace.organization_id,
                workspace_id=workspace_id,
                entity_type="workspace_subscription",
                entity_id=subscription.id,
                properties={
                    "provider": provider,
                    "providerEventId": event_id,
                    "planCode": plan.code,
                    "status": str(status),
                },
            ),
        )

    async def apply_provider_subscription(
        self,
        *,
        workspace_id: UUID,
        plan_code: str,
        status: SubscriptionStatus,
        billing_interval: BillingCycle,
        current_period_start: datetime,
        current_period_end: datetime,
        cancel_at_period_end: bool,
        provider: str,
        external_customer_id: str,
        external_subscription_id: str,
        event_id: str,
    ) -> WorkspaceCommerceOverviewOut:
        async with self.tx() as conn:
            receipt, is_new_event = await self._repository.claim_provider_event(
                provider=provider,
                event_id=event_id,
                workspace_id=workspace_id,
                conn=conn,
            )
            if receipt.workspace_id != workspace_id:
                raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
            if is_new_event:
                await self._apply_claimed_provider_subscription(
                    conn=conn,
                    workspace_id=workspace_id,
                    plan_code=plan_code,
                    status=status,
                    billing_interval=billing_interval,
                    current_period_start=current_period_start,
                    current_period_end=current_period_end,
                    cancel_at_period_end=cancel_at_period_end,
                    provider=provider,
                    external_customer_id=external_customer_id,
                    external_subscription_id=external_subscription_id,
                    event_id=event_id,
                )
        return await self.get_overview(workspace_id=workspace_id)

    async def set_workspace_subscription(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        payload: WorkspaceSubscriptionSetRequest,
    ) -> WorkspaceCommerceOverviewOut:
        async with self.tx() as conn:
            await self.ensure_plan_catalog(conn=conn)
            plan = await self._repository.get_plan_by_code(
                code=payload.plan_code,
                conn=conn,
                active_only=True,
            )
            if plan is None:
                raise NotFound(
                    message=t("errors", "COMMERCE_PLAN_NOT_FOUND"),
                    error="COMMERCE_PLAN_NOT_FOUND",
                )
            subscription, _ = await self._apply_subscription(
                conn=conn,
                workspace_id=workspace_id,
                plan=plan,
                actor_user_id=actor_user_id,
                payload=payload,
                reference_type="operator_change",
                reference_id=uuid7(),
            )
            workspace = await self._repository.get_workspace(workspace_id=workspace_id, conn=conn)
            await write_required_activity_event(
                settings=self._settings,
                conn=conn,
                payload=ActivityAuditPayload(
                    event_name="commerce.subscription.updated",
                    actor_user_id=actor_user_id,
                    organization_id=workspace.organization_id,
                    workspace_id=workspace_id,
                    entity_type="workspace_subscription",
                    entity_id=subscription.id,
                    properties={"planCode": plan.code, "status": str(payload.status)},
                ),
            )
        return await self.get_overview(workspace_id=workspace_id)


def build_commerce_service(settings: Settings) -> CommerceService:
    return CommerceService(settings, repository=CommerceRepository())
