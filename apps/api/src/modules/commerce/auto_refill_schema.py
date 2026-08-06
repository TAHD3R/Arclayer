from __future__ import annotations

from enum import StrEnum
from typing import Annotated

from pydantic import Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.commerce.billing import BillingProviderMode
from src.models.commerce.payments import CommerceAutoRefillExecutionState

CurrencyCode = Annotated[str, Field(min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")]


class WorkspaceAutoRefillPolicyWrite(BaseSchema):
    offer_id: PublicUUID
    is_enabled: bool
    trigger_below_credits: int = Field(ge=0)
    monthly_ceiling_micros: int = Field(gt=0)
    currency: CurrencyCode
    expected_revision: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=128)

    @model_validator(mode="after")
    def validate_threshold(self) -> WorkspaceAutoRefillPolicyWrite:
        if self.trigger_below_credits < 0:
            raise ValueError("auto-refill threshold cannot be negative")
        return self


class WorkspaceAutoRefillPolicyOut(BaseSchema):
    workspace_id: PublicUUID
    configured: bool
    offer_id: PublicUUID | None
    offer_code: str | None
    offer_revision: int | None
    credit_amount: int | None
    is_enabled: bool
    trigger_below_credits: int | None
    monthly_ceiling_micros: int | None
    currency: CurrencyCode | None
    provider: str | None
    provider_mode: BillingProviderMode | None
    execution_state: CommerceAutoRefillExecutionState
    revision: int
    available_offers: list[AutoRefillOfferOut] = Field(default_factory=list)
    replayed: bool = False


class AutoRefillLifecycleAction(StrEnum):
    NONE = "none"
    PROVIDER_CHARGE_REQUIRED = "provider_charge_required"


class WorkspaceAutoRefillLifecycleOut(BaseSchema):
    workspace_id: PublicUUID
    policy_revision: int
    execution_state: CommerceAutoRefillExecutionState
    trigger_below_credits: int | None
    available_credits: int | None
    threshold_reached: bool
    action: AutoRefillLifecycleAction


class AutoRefillOfferOut(BaseSchema):
    offer_id: PublicUUID
    offer_code: str
    credit_amount: int
    currency: CurrencyCode
    amount_micros: int
