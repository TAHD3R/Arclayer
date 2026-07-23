from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import Annotated, Self

from pydantic import Field, StringConstraints, field_validator, model_validator

from src.common.schemas import BaseOut, BaseSchema, TimestampMixin
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.models.commerce.billing import (
    BillingCycle,
    CommercePlanTier,
    CreditLedgerEntryType,
    CreditRefreshInterval,
    SubscriptionStatus,
)
from src.modules.commerce.entitlement_schema import DEFAULT_ENTITLEMENT_REGISTRY

PlanCode = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_-]{1,47}$")]


class PlanFeature(BaseSchema):
    key: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=300)
    included: bool = True
    value: str | int | None = None


class CommercePlanUpsertRequest(BaseSchema):
    tier: CommercePlanTier
    name: str = Field(min_length=1, max_length=96)
    description: str = Field(min_length=1, max_length=512)
    credit_grant_amount: int = Field(ge=0)
    credit_refresh_interval: CreditRefreshInterval
    credit_value_micros: int = Field(gt=0)
    price_monthly_micros: int = Field(ge=0)
    price_yearly_micros: int = Field(ge=0)
    currency: str = Field(min_length=3, max_length=3)
    features: list[PlanFeature] = Field(default_factory=list, max_length=100)
    is_active: bool = True
    is_default: bool = False
    sort_order: int = Field(default=100, ge=0, le=100_000)

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        normalized = value.upper()
        if not normalized.isalpha():
            raise ValueError("currency must be a three-letter ISO code")
        return normalized

    @field_validator("price_monthly_micros", "price_yearly_micros")
    @classmethod
    def validate_provider_price_precision(cls, value: int) -> int:
        if value % 10_000:
            raise ValueError("plan prices must be representable in whole currency cents")
        return value

    @model_validator(mode="after")
    def validate_entitlement_features(self) -> Self:
        feature_keys = [feature.key for feature in self.features]
        if len(feature_keys) != len(set(feature_keys)):
            raise ValueError("plan features must use unique keys")
        required_keys = {definition.key for definition in DEFAULT_ENTITLEMENT_REGISTRY.list_definitions()}
        missing_keys = sorted(required_keys.difference(feature_keys))
        if missing_keys:
            missing = ", ".join(missing_keys)
            raise ValueError(f"plan features must explicitly declare registered entitlements: {missing}")
        return self


class CommercePlanOut(BaseOut, TimestampMixin):
    code: str
    tier: CommercePlanTier
    name: str
    description: str
    credit_grant_amount: int
    credit_refresh_interval: CreditRefreshInterval
    credit_value_micros: int
    price_monthly_micros: int
    price_yearly_micros: int
    currency: str
    features: list[PlanFeature]
    is_active: bool
    is_default: bool
    sort_order: int


class CommercePlanCatalogOut(BaseSchema):
    billing_mode: str = "external_checkout"
    billing_provider: str
    checkout_enabled: bool
    items: list[CommercePlanOut]


class WorkspacePlanOptionOut(CommercePlanOut):
    is_current: bool
    can_select: bool


class WorkspacePlanCatalogOut(BaseSchema):
    billing_mode: str = "external_checkout"
    billing_provider: str
    checkout_enabled: bool
    items: list[WorkspacePlanOptionOut]


class WorkspaceSubscriptionOut(BaseOut, TimestampMixin):
    status: SubscriptionStatus
    billing_interval: BillingCycle
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool


class WorkspaceCreditsOut(BaseSchema):
    balance: int
    reserved: int
    available: int
    lifetime_granted: int
    lifetime_spent: int
    period_granted: int
    period_spent: int
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
    plan_name: str | None = None
    plan_tier: CommercePlanTier | None = None
    credit_refresh_interval: CreditRefreshInterval | None = None
    subscription_status: SubscriptionStatus | None = None
    billing_interval: BillingCycle | None = None
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    renewal_at: datetime | None = None
    cancel_at_period_end: bool | None = None
    credits: WorkspaceCreditsOut | None = None
    usage: WorkspaceCommerceDirectoryUsageOut | None = None


class WorkspaceCommerceOverviewOut(BaseSchema):
    billing_mode: str = "external_checkout"
    billing_provider: str
    checkout_enabled: bool
    plan: CommercePlanOut
    subscription: WorkspaceSubscriptionOut
    credits: WorkspaceCreditsOut
    usage: WorkspaceCommerceUsageOut


class CheckoutSessionCreate(BaseSchema):
    plan_code: PlanCode
    billing_interval: BillingCycle


class BillingRedirectOut(BaseSchema):
    url: str


class WorkspaceSubscriptionSetRequest(BaseSchema):
    plan_code: PlanCode
    status: SubscriptionStatus = SubscriptionStatus.ACTIVE
    billing_interval: BillingCycle = BillingCycle.MONTHLY
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    cancel_at_period_end: bool = False

    @model_validator(mode="after")
    def validate_period(self):
        if self.current_period_start and self.current_period_end:
            if self.current_period_end <= self.current_period_start:
                raise ValueError("currentPeriodEnd must be after currentPeriodStart")
        return self


class CreditLedgerOut(BaseOut, TimestampMixin):
    workspace_id: PublicUUID
    account_id: PublicUUID
    entry_type: CreditLedgerEntryType
    delta_balance_credits: int
    delta_reserved_credits: int
    balance_after_credits: int
    reserved_after_credits: int
    reference_type: str
    reference_id: PublicUUID | None
    actor_user_id: PublicUUID | None
    description_key: str
    description: str
    details: JsonObject


class CommerceUsagePeriod(BaseSchema):
    start_date: date
    end_date: date
