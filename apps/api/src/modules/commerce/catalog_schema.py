"""Typed commands for the immutable Workspace Commerce Plan catalog."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.models.commerce.billing import (
    BillingCycle,
    BillingProviderMode,
    CreditRefreshInterval,
    EntitlementAllocationMode,
    ResourceLimitKind,
)

PlanCode = Annotated[str, Field(min_length=1, max_length=48, pattern=r"^[a-z][a-z0-9-]*$")]
CatalogKey = Annotated[str, Field(min_length=3, max_length=160, pattern=r"^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$")]
CurrencyCode = Annotated[str, Field(min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")]


class CatalogSchema(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)


class PlanIdentityCreate(CatalogSchema):
    code: PlanCode
    sort_order: int = Field(default=100)


class PlanRevisionPriceInput(CatalogSchema):
    provider: Annotated[str, Field(min_length=1, max_length=32)]
    provider_mode: BillingProviderMode
    billing_cycle: BillingCycle
    currency: CurrencyCode
    amount_micros: int = Field(ge=0)
    external_price_id: Annotated[str, Field(min_length=1, max_length=255)]


class PlanRevisionResourceAllowanceInput(CatalogSchema):
    key: CatalogKey
    limit_kind: ResourceLimitKind
    limit_value: int | None = None

    @model_validator(mode="after")
    def validate_limit(self) -> PlanRevisionResourceAllowanceInput:
        if self.limit_kind == ResourceLimitKind.UNLIMITED and self.limit_value is not None:
            raise ValueError("unlimited resource allowance must not declare a limit value")
        if self.limit_kind == ResourceLimitKind.LIMITED and (self.limit_value is None or self.limit_value <= 0):
            raise ValueError("limited resource allowance requires a positive limit value")
        return self


class PlanRevisionEntitlementInput(CatalogSchema):
    key: CatalogKey
    is_included: bool
    allocation_mode: EntitlementAllocationMode | None = None
    seat_limit_kind: ResourceLimitKind | None = None
    seat_limit_value: int | None = None

    @model_validator(mode="after")
    def validate_allocation(self) -> PlanRevisionEntitlementInput:
        if not self.is_included:
            if any(value is not None for value in (self.allocation_mode, self.seat_limit_kind, self.seat_limit_value)):
                raise ValueError("excluded entitlement must not declare allocation or seat capacity")
            return self
        if self.allocation_mode is None:
            raise ValueError("included entitlement requires an allocation mode")
        if self.allocation_mode == EntitlementAllocationMode.WORKSPACE:
            if self.seat_limit_kind is not None or self.seat_limit_value is not None:
                raise ValueError("workspace entitlement must not declare Feature Seat capacity")
            return self
        if self.seat_limit_kind is None:
            raise ValueError("member-seat entitlement requires Feature Seat capacity")
        if self.seat_limit_kind == ResourceLimitKind.UNLIMITED and self.seat_limit_value is not None:
            raise ValueError("unlimited Feature Seat capacity must not declare a value")
        if self.seat_limit_kind == ResourceLimitKind.LIMITED and (
            self.seat_limit_value is None or self.seat_limit_value <= 0
        ):
            raise ValueError("limited Feature Seat capacity requires a positive value")
        return self


class PlanRevisionTermsInput(CatalogSchema):
    name_i18n_key: Annotated[str, Field(min_length=1, max_length=128)]
    description_i18n_key: Annotated[str, Field(min_length=1, max_length=128)]
    credit_grant_amount: int = Field(ge=0)
    credit_refresh_interval: CreditRefreshInterval
    credit_value_micros: int = Field(gt=0)
    currency: CurrencyCode
    prices: tuple[PlanRevisionPriceInput, ...] = ()
    resource_allowances: tuple[PlanRevisionResourceAllowanceInput, ...] = ()
    entitlements: tuple[PlanRevisionEntitlementInput, ...] = ()

    @model_validator(mode="after")
    def validate_unique_scopes(self) -> PlanRevisionTermsInput:
        price_scopes = {
            (price.provider, price.provider_mode, price.billing_cycle, price.currency) for price in self.prices
        }
        if len(price_scopes) != len(self.prices):
            raise ValueError("duplicate provider Price scope")
        external_price_scopes = {
            (price.provider, price.provider_mode, price.external_price_id) for price in self.prices
        }
        if len(external_price_scopes) != len(self.prices):
            raise ValueError("duplicate provider external Price identity")
        if len({allowance.key for allowance in self.resource_allowances}) != len(self.resource_allowances):
            raise ValueError("duplicate resource allowance")
        if len({entitlement.key for entitlement in self.entitlements}) != len(self.entitlements):
            raise ValueError("duplicate entitlement declaration")
        if any(price.currency != self.currency for price in self.prices):
            raise ValueError("provider Price currency must match the Plan Revision currency")
        return self


class PlanRevisionDraftCreate(CatalogSchema):
    plan_id: UUID
    terms: PlanRevisionTermsInput


class PlanRevisionDraftUpdate(CatalogSchema):
    terms: PlanRevisionTermsInput
