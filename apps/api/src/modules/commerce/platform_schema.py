from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.commerce.billing import (
    BillingCycle,
    CommercialAccessState,
    PlanRevisionStatus,
    SubscriptionStatus,
)


class PlatformCommerceRevisionSummaryOut(BaseSchema):
    id: PublicUUID
    sequence: int
    revision: int
    status: PlanRevisionStatus
    is_selling: bool
    name_i18n_key: str
    description_i18n_key: str
    published_at: datetime | None


class PlatformCommercePlanOut(BaseSchema):
    id: PublicUUID
    code: str
    is_active: bool
    sort_order: int
    revisions: tuple[PlatformCommerceRevisionSummaryOut, ...]


class PlatformCommercePlanCatalogOut(BaseSchema):
    items: tuple[PlatformCommercePlanOut, ...]


class PlatformCommercePlanIdentityOut(BaseSchema):
    id: PublicUUID
    code: str


class PlatformCommercePlanRevisionMutationOut(BaseSchema):
    id: PublicUUID
    plan_id: PublicUUID
    sequence: int
    revision: int
    status: PlanRevisionStatus


class PlatformCommerceSubscriptionOut(BaseSchema):
    workspace_id: PublicUUID
    subscription_id: PublicUUID
    plan_revision_id: PublicUUID
    plan_code: str
    plan_revision: int
    status: SubscriptionStatus
    billing_cycle: BillingCycle
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool
    billing_provider: str
    commercial_access_state: CommercialAccessState | None = None
    recovery_deadline_at: datetime | None = None
    access_revision: int | None = None


class PlatformCommerceSubscriptionListOut(BaseSchema):
    items: tuple[PlatformCommerceSubscriptionOut, ...]
    total: int


class PlatformCommerceSubscriptionQuery(BaseSchema):
    page: Annotated[int, Field(ge=1, le=10_000)] = 1
    page_size: Annotated[int, Field(ge=1, le=100)] = 50
    plan_code: str | None = None
    status: SubscriptionStatus | None = None
    provider: str | None = None
    search: str | None = Field(default=None, max_length=200)
    sort_by: Literal["current_period_end", "status", "plan_code"] = "current_period_end"
    sort_direction: Literal["asc", "desc"] = "desc"
