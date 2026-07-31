from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict
from src.models.commerce.billing import (
    BillingCycle,
    BillingProviderMode,
    CreditRefreshInterval,
    EntitlementAllocationMode,
    PlanRevisionStatus,
    ResourceLimitKind,
)
from src.modules.commerce.catalog_schema import (
    PlanRevisionEntitlementInput,
    PlanRevisionPriceInput,
    PlanRevisionResourceAllowanceInput,
    PlanRevisionTermsInput,
)
from src.modules.commerce.catalog_service import CommerceCatalogService, _content_hash


class _Repository:
    def __init__(self, *, terms: PlanRevisionTermsInput, collision: bool = False) -> None:
        self.plan_id = uuid4()
        self.draft_id = uuid4()
        self.plan = SimpleNamespace(id=self.plan_id, is_active=True)
        self.draft = SimpleNamespace(id=self.draft_id, status=PlanRevisionStatus.DRAFT, sequence=4)
        self.terms = terms
        self.collision = collision
        self.published_hash: str | None = None
        self.created_sequence: int | None = None
        self.subscription_bindings = ("bound-to-older-revision",)
        self.resources = {"projects.active": SimpleNamespace(id=uuid4(), key="projects.active", is_active=True)}
        self.entitlements = {
            "sites.generate": SimpleNamespace(
                id=uuid4(),
                key="sites.generate",
                is_active=True,
                supports_workspace_allocation=True,
                supports_member_seat_allocation=False,
            ),
            "ai.priority": SimpleNamespace(
                id=uuid4(),
                key="ai.priority",
                is_active=True,
                supports_workspace_allocation=False,
                supports_member_seat_allocation=True,
            ),
        }

    async def get_plan_by_code(self, *, code, conn):  # type: ignore[no-untyped-def]
        _ = (code, conn)
        return None

    async def lock_plan(self, *, plan_id, conn):  # type: ignore[no-untyped-def]
        _ = conn
        return self.plan if plan_id == self.plan_id else None

    async def create_plan(self, *, code, sort_order, conn):  # type: ignore[no-untyped-def]
        _ = (code, sort_order, conn)
        return self.plan

    async def next_revision_sequence(self, *, plan_id, conn):  # type: ignore[no-untyped-def]
        _ = (plan_id, conn)
        return 5

    async def create_draft(self, *, plan_id, sequence, terms, resources, entitlements, conn):  # type: ignore[no-untyped-def]
        _ = (plan_id, terms, resources, entitlements, conn)
        self.created_sequence = sequence
        return self.draft

    async def lock_draft(self, *, revision_id, plan_id, conn):  # type: ignore[no-untyped-def]
        _ = (plan_id, conn)
        return self.draft if revision_id == self.draft_id else None

    async def replace_draft_terms(self, *, draft, terms, resources, entitlements, conn):  # type: ignore[no-untyped-def]
        _ = (draft, resources, entitlements, conn)
        self.terms = terms

    async def load_terms(self, *, revision_id, conn):  # type: ignore[no-untyped-def]
        _ = (revision_id, conn)
        return self.terms

    async def list_entitlement_definitions(self, *, conn):  # type: ignore[no-untyped-def]
        _ = conn
        return list(self.entitlements.values())

    async def get_resource_definitions(self, *, keys, conn):  # type: ignore[no-untyped-def]
        _ = conn
        return [self.resources[key] for key in keys if key in self.resources]

    async def has_published_external_price_collision(self, *, revision_id, terms, conn):  # type: ignore[no-untyped-def]
        _ = (revision_id, terms, conn)
        return self.collision

    async def publish_draft(self, *, plan, draft, content_hash, published_at, conn):  # type: ignore[no-untyped-def]
        _ = (plan, published_at, conn)
        self.published_hash = content_hash
        draft.status = PlanRevisionStatus.PUBLISHED
        return draft

    async def set_plan_active(self, *, plan, is_active, conn):  # type: ignore[no-untyped-def]
        _ = conn
        plan.is_active = is_active
        return plan


def _terms(*, prices_reversed: bool = False, include_ai: bool = True) -> PlanRevisionTermsInput:
    prices = (
        PlanRevisionPriceInput(
            provider="stripe",
            provider_mode=BillingProviderMode.LIVE,
            billing_cycle=BillingCycle.MONTHLY,
            currency="USD",
            amount_micros=10_000_000,
            external_price_id="price_monthly",
        ),
        PlanRevisionPriceInput(
            provider="stripe",
            provider_mode=BillingProviderMode.LIVE,
            billing_cycle=BillingCycle.YEARLY,
            currency="USD",
            amount_micros=100_000_000,
            external_price_id="price_yearly",
        ),
    )
    entitlements = [
        PlanRevisionEntitlementInput(
            key="sites.generate",
            is_included=True,
            allocation_mode=EntitlementAllocationMode.WORKSPACE,
        )
    ]
    if include_ai:
        entitlements.append(
            PlanRevisionEntitlementInput(
                key="ai.priority",
                is_included=True,
                allocation_mode=EntitlementAllocationMode.MEMBER_SEAT,
                seat_limit_kind=ResourceLimitKind.LIMITED,
                seat_limit_value=3,
            )
        )
    return PlanRevisionTermsInput(
        name_i18n_key="commerce.plan.premium.name",
        description_i18n_key="commerce.plan.premium.description",
        credit_grant_amount=1_000,
        credit_refresh_interval=CreditRefreshInterval.MONTHLY,
        credit_value_micros=1_000,
        currency="USD",
        prices=tuple(reversed(prices)) if prices_reversed else prices,
        resource_allowances=(
            PlanRevisionResourceAllowanceInput(
                key="projects.active",
                limit_kind=ResourceLimitKind.UNLIMITED,
            ),
        ),
        entitlements=tuple(entitlements),
    )


async def test_catalog_creates_monotonic_draft_and_publishes_immutable_revision() -> None:
    repository = _Repository(terms=_terms())
    service = CommerceCatalogService(repository=repository)
    conn = cast(BaseDBAsyncClient, object())

    draft = await service.create_draft(plan_id=repository.plan_id, terms=_terms(), conn=conn)
    published = await service.publish_draft(plan_id=repository.plan_id, revision_id=draft.id, conn=conn)

    assert repository.created_sequence == 5
    assert published.status == PlanRevisionStatus.PUBLISHED
    assert repository.published_hash == _content_hash(plan_id=repository.plan_id, terms=_terms())
    assert repository.subscription_bindings == ("bound-to-older-revision",)


async def test_catalog_requires_every_registered_entitlement_before_publish() -> None:
    repository = _Repository(terms=_terms(include_ai=False))
    service = CommerceCatalogService(repository=repository)

    with pytest.raises(Conflict, match="COMMERCE_CATALOG_ENTITLEMENT_DECLARATION_INCOMPLETE"):
        await service.publish_draft(
            plan_id=repository.plan_id,
            revision_id=repository.draft_id,
            conn=cast(BaseDBAsyncClient, object()),
        )


async def test_catalog_rejects_provider_price_collision_before_publication() -> None:
    repository = _Repository(terms=_terms(), collision=True)
    service = CommerceCatalogService(repository=repository)

    with pytest.raises(Conflict, match="COMMERCE_CATALOG_PROVIDER_PRICE_COLLISION"):
        await service.publish_draft(
            plan_id=repository.plan_id,
            revision_id=repository.draft_id,
            conn=cast(BaseDBAsyncClient, object()),
        )


def test_catalog_terms_reject_excluded_feature_seat_capacity() -> None:
    with pytest.raises(ValueError, match="excluded entitlement"):
        PlanRevisionEntitlementInput(
            key="ai.priority",
            is_included=False,
            allocation_mode=EntitlementAllocationMode.MEMBER_SEAT,
            seat_limit_kind=ResourceLimitKind.LIMITED,
            seat_limit_value=1,
        )


def test_catalog_price_parses_typed_api_enum_values() -> None:
    price = PlanRevisionPriceInput.model_validate({
        "provider": "stripe",
        "provider_mode": "live",
        "billing_cycle": "monthly",
        "currency": "USD",
        "amount_micros": 0,
        "external_price_id": "price_free",
    })

    assert price.provider_mode == BillingProviderMode.LIVE
    assert price.billing_cycle == BillingCycle.MONTHLY


def test_catalog_content_hash_is_independent_of_declaration_order() -> None:
    plan_id = uuid4()
    assert _content_hash(plan_id=plan_id, terms=_terms()) == _content_hash(
        plan_id=plan_id,
        terms=_terms(prices_reversed=True),
    )
