from __future__ import annotations

from datetime import date, datetime
from typing import Annotated

from pydantic import Field, StringConstraints, field_validator, model_validator

from src.common.schemas import BaseOut, BaseSchema, TimestampMixin
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.models.commerce.billing import (
    BillingCycle,
    CommercePlanTier,
    CreditLedgerEntryType,
    CreditRefreshInterval,
    SubscriptionChangeRequestStatus,
    SubscriptionStatus,
)

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
    billing_mode: str = "operator_managed"
    items: list[CommercePlanOut]


class WorkspacePlanOptionOut(CommercePlanOut):
    is_current: bool
    can_select: bool


class WorkspacePlanCatalogOut(BaseSchema):
    billing_mode: str = "operator_managed"
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


class SubscriptionChangeRequestCreate(BaseSchema):
    plan_code: PlanCode
    billing_interval: BillingCycle
    reason: str | None = Field(default=None, max_length=1000)


class SubscriptionChangeRequestReview(BaseSchema):
    review_note: str | None = Field(default=None, max_length=1000)


class SubscriptionChangeRequestReject(BaseSchema):
    review_note: str = Field(min_length=1, max_length=1000)


class SubscriptionChangeRequestOut(BaseOut, TimestampMixin):
    workspace_id: PublicUUID
    requested_by_user_id: PublicUUID
    plan_code: str
    plan_name: str
    billing_interval: BillingCycle
    reason: str | None
    status: SubscriptionChangeRequestStatus
    reviewed_by_user_id: PublicUUID | None
    reviewed_at: datetime | None
    review_note: str | None


class WorkspaceCommerceOverviewOut(BaseSchema):
    billing_mode: str = "operator_managed"
    plan: CommercePlanOut
    subscription: WorkspaceSubscriptionOut
    credits: WorkspaceCreditsOut
    usage: WorkspaceCommerceUsageOut
    pending_change_request: SubscriptionChangeRequestOut | None


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
