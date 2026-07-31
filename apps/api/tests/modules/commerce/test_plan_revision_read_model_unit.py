from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from uuid import uuid4

from src.models.commerce.billing import (
    BillingCycle,
    BillingProviderMode,
    CommercePlanRevision,
    CommercePlanRevisionEntitlement,
    CommercePlanRevisionPrice,
    CommercePlanRevisionResourceAllowance,
    CreditRefreshInterval,
    EntitlementAllocationMode,
    ResourceLimitKind,
)
from src.modules.commerce.repository import CommercePlanRevisionTerms
from src.modules.commerce.service import _revision_out


def test_revision_read_model_projects_immutable_terms_without_plan_feature_fallbacks() -> None:
    now = datetime.now(UTC)
    revision = SimpleNamespace(
        id=uuid4(),
        created_at=now,
        updated_at=now,
        plan_id=uuid4(),
        plan=SimpleNamespace(code="premium"),
        sequence=7,
        name_i18n_key="commerce.plan.premium.name",
        description_i18n_key="commerce.plan.premium.description",
        credit_grant_amount=50_000,
        credit_refresh_interval=CreditRefreshInterval.MONTHLY,
        credit_value_micros=2_500,
        currency="USD",
        is_selling=False,
    )
    terms = CommercePlanRevisionTerms(
        prices=(
            cast(
                CommercePlanRevisionPrice,
                SimpleNamespace(
                    provider="stripe",
                    provider_mode=BillingProviderMode.LIVE,
                    billing_cycle=BillingCycle.MONTHLY,
                    currency="USD",
                    amount_micros=2_000_000,
                ),
            ),
            cast(
                CommercePlanRevisionPrice,
                SimpleNamespace(
                    provider="stripe",
                    provider_mode=BillingProviderMode.LIVE,
                    billing_cycle=BillingCycle.YEARLY,
                    currency="USD",
                    amount_micros=20_000_000,
                ),
            ),
        ),
        resource_allowances=(
            cast(
                CommercePlanRevisionResourceAllowance,
                SimpleNamespace(
                    resource=SimpleNamespace(key="projects.active"),
                    limit_kind=ResourceLimitKind.UNLIMITED,
                    limit_value=None,
                ),
            ),
        ),
        entitlements=(
            cast(
                CommercePlanRevisionEntitlement,
                SimpleNamespace(
                    entitlement=SimpleNamespace(key="sites.generate"),
                    is_included=True,
                    allocation_mode=EntitlementAllocationMode.MEMBER_SEAT,
                    seat_limit_kind=ResourceLimitKind.LIMITED,
                    seat_limit_value=4,
                ),
            ),
        ),
    )

    result = _revision_out(revision=cast(CommercePlanRevision, revision), terms=terms)

    assert result.name_i18n_key == "commerce.plan.premium.name"
    assert [(price.billing_cycle, price.amount_micros) for price in result.prices] == [
        (BillingCycle.MONTHLY, 2_000_000),
        (BillingCycle.YEARLY, 20_000_000),
    ]
    assert result.resource_allowances[0].key == "projects.active"
    assert result.resource_allowances[0].limit_kind == ResourceLimitKind.UNLIMITED
    assert result.entitlements[0].key == "sites.generate"
    assert result.entitlements[0].seat_limit_value == 4
