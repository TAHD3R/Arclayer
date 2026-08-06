from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import Annotated
from uuid import UUID

from pydantic import Field

from src.common.schemas import BaseOut, BaseSchema, TimestampMixin
from src.common.types.public_uuid import PublicUUID
from src.models.commerce.billing import (
    BillingCycle,
    BillingProviderMode,
    CreditLedgerEntryType,
    CreditRefreshInterval,
    EntitlementAllocationMode,
    ResourceLimitKind,
    SubscriptionStatus,
)

PlanCode = Annotated[str, Field(min_length=2, max_length=48, pattern=r"^[a-z][a-z0-9-]*$")]


class PlanRevisionPriceOut(BaseSchema):
    """One immutable provider price on a published Plan Revision."""

    provider: str
    provider_mode: BillingProviderMode
    billing_cycle: BillingCycle
    currency: str
    amount_micros: int


class PlanRevisionResourceAllowanceOut(BaseSchema):
    """One typed resource allowance declared by a Plan Revision."""

    key: str
    limit_kind: ResourceLimitKind
    limit_value: int | None


class PlanRevisionEntitlementOut(BaseSchema):
    """One explicit registered Entitlement decision on a Plan Revision."""

    key: str
    is_included: bool
    allocation_mode: EntitlementAllocationMode | None
    seat_limit_kind: ResourceLimitKind | None
    seat_limit_value: int | None


class CommercePlanRevisionOut(BaseOut, TimestampMixin):
    plan_id: PublicUUID
    plan_code: str
    sequence: int
    name_i18n_key: str
    description_i18n_key: str
    credit_grant_amount: int
    credit_refresh_interval: CreditRefreshInterval
    credit_value_micros: int
    currency: str
    prices: tuple[PlanRevisionPriceOut, ...]
    resource_allowances: tuple[PlanRevisionResourceAllowanceOut, ...]
    entitlements: tuple[PlanRevisionEntitlementOut, ...]
    is_selling: bool


class WorkspacePlanOptionOut(CommercePlanRevisionOut):
    is_current: bool
    can_select: bool


class CommercePlanCatalogOut(BaseSchema):
    items: list[CommercePlanRevisionOut]


class WorkspacePlanCatalogOut(BaseSchema):
    billing_provider: str
    checkout_enabled: bool
    items: list[WorkspacePlanOptionOut]


class WorkspaceSubscriptionOut(BaseOut, TimestampMixin):
    plan_revision_id: PublicUUID
    subscription_revision: int
    status: SubscriptionStatus
    billing_cycle: BillingCycle
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool


class WorkspaceCreditsOut(BaseSchema):
    account_revision: int
    balance: int
    reserved: int
    available: int
    period_start: datetime
    period_end: datetime
    next_refresh_at: datetime | None


class WorkspaceCommerceUsageOut(BaseSchema):
    period_cost_micros: int
    requests: int
    prompt_tokens: int
    completion_tokens: int


class WorkspaceCommerceDirectoryDataState(StrEnum):
    COMPLETE = "complete"
    PARTIAL = "partial"
    MISSING = "missing"


class WorkspaceCommerceDirectoryRisk(StrEnum):
    HEALTHY = "healthy"
    ATTENTION_REQUIRED = "attention_required"
    DATA_MISSING = "data_missing"


class WorkspaceCommerceUsageCoverage(StrEnum):
    DAILY_ROLLUP = "daily_rollup"
    NO_OBSERVED_USAGE = "no_observed_usage"


class WorkspaceCommerceDirectoryUsageOut(WorkspaceCommerceUsageOut):
    window_start: datetime
    window_end: datetime
    coverage: WorkspaceCommerceUsageCoverage
    observed_from: date | None = None
    observed_to: date | None = None


class WorkspaceCommerceDirectoryOut(BaseSchema):
    data_state: WorkspaceCommerceDirectoryDataState
    risk: WorkspaceCommerceDirectoryRisk
    captured_at: datetime | None = None
    billing_provider: str | None = None
    plan_code: str | None = None
    plan_revision_id: PublicUUID | None = None
    plan_name_i18n_key: str | None = None
    credit_refresh_interval: CreditRefreshInterval | None = None
    subscription_status: SubscriptionStatus | None = None
    billing_cycle: BillingCycle | None = None
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    cancel_at_period_end: bool | None = None
    credits: WorkspaceCreditsOut | None = None
    usage: WorkspaceCommerceDirectoryUsageOut | None = None


class WorkspaceCommerceOverviewOut(BaseSchema):
    plan_revision: CommercePlanRevisionOut
    subscription: WorkspaceSubscriptionOut
    credits: WorkspaceCreditsOut
    usage: WorkspaceCommerceUsageOut


class CheckoutSessionCreate(BaseSchema):
    plan_code: PlanCode
    billing_interval: BillingCycle


class TopUpCheckoutSessionCreate(BaseSchema):
    top_up_offer_id: PublicUUID


class BillingRedirectOut(BaseSchema):
    url: str


class CreditLedgerOut(BaseOut, TimestampMixin):
    workspace_id: PublicUUID
    account_id: PublicUUID
    subscription_id: PublicUUID
    plan_revision_id: PublicUUID
    entry_type: CreditLedgerEntryType
    request_id: PublicUUID | None
    provider_period_identity: str | None
    estimated_cost_micros: int | None
    actual_cost_micros: int | None
    applied_credit_value_micros: int
    reserved_credits: int
    committed_credits: int
    delta_balance_credits: int
    delta_reserved_credits: int
    balance_after_credits: int
    reserved_after_credits: int
    actor_user_id: PublicUUID | None
    description_key: str


class CommerceUsagePeriod(BaseSchema):
    start_date: date
    end_date: date


class CommercePlanIdentityOut(BaseOut, TimestampMixin):
    code: str
    is_active: bool
    sort_order: int


class CommercePlanRevisionReference(BaseSchema):
    id: UUID
    code: str
    sequence: int
