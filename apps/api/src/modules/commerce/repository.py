from __future__ import annotations

from typing import Protocol
from uuid import UUID

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.commerce.billing import CommercePlan


class BillingCheckoutPlan(BaseSchema):
    """Immutable plan projection required to create a provider checkout."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    id: UUID
    code: str = Field(min_length=1, max_length=48)
    name: str = Field(min_length=1, max_length=96)
    price_monthly_micros: int = Field(ge=0)
    price_yearly_micros: int = Field(ge=0)
    currency: str = Field(min_length=3, max_length=3)


class BillingPlanReader(Protocol):
    async def get_active_checkout_plan(self, *, code: str) -> BillingCheckoutPlan | None: ...


class CommercePlanRepository(TortoiseORMRepository[CommercePlan]):
    """Persistence adapter for Commerce plan projections."""

    def __init__(self) -> None:
        super().__init__(CommercePlan)

    async def get_active_checkout_plan(self, *, code: str) -> BillingCheckoutPlan | None:
        plan = await CommercePlan.get_or_none(code=code, is_active=True)
        if plan is None:
            return None
        return BillingCheckoutPlan(
            id=plan.id,
            code=plan.code,
            name=plan.name,
            price_monthly_micros=int(plan.price_monthly_micros),
            price_yearly_micros=int(plan.price_yearly_micros),
            currency=plan.currency,
        )
